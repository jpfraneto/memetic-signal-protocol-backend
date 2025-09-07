import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';

import { Signal } from '../../models/Signal/Signal.model';
import { SignalStatus } from '../../models/Signal/Signal.types';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
import { TokenPriceService } from './services/token-price.service';
import { NotificationService } from '../notification/services/notification.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { MFSService, MFSCalculationInput } from '../mfs/mfs.service';

interface SignalResolutionBatch {
  signals: Signal[];
  signalIds: number[];
  mfsDeltas: bigint[];
  notifications: Array<{
    fid: number;
    signalResult: {
      tokenSymbol: string;
      direction: 'UP' | 'DOWN';
      duration: number;
      won: boolean;
      mfsScore: number;
    };
  }>;
}

@Injectable()
export class SignalResolutionService {
  private readonly logger = new Logger(SignalResolutionService.name);
  private readonly BATCH_SIZE = 50; // Process signals in batches
  private readonly MAX_RETRIES = 3;

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    private tokenPriceService: TokenPriceService,
    private notificationService: NotificationService,
    private blockchainService: BlockchainService,
    private mfsService: MFSService,
  ) {}

  /**
   * Main cron job - runs every 30 minutes to resolve expired signals
   */
  @Cron('0,30 * * * *') // Every 30 minutes at :00 and :30
  async resolveExpiredSignals() {
    this.logger.log('Starting 30-minute signal resolution cycle...');

    try {
      // Check if we're authorized as the resolver
      const isResolver = await this.blockchainService.isResolver();
      if (!isResolver) {
        this.logger.error('Backend wallet is not authorized as contract resolver');
        return;
      }

      const nowTimestamp = Math.floor(Date.now() / 1000); // Current timestamp in seconds
      
      const expiredSignals = await this.signalRepository.find({
        where: {
          resolved: false, // Only unresolved signals
          expires_at: LessThan(BigInt(nowTimestamp)), // Expired signals (bigint comparison)
        },
        relations: ['user'],
        take: this.BATCH_SIZE,
        order: { expires_at: 'ASC' }, // Process oldest expired signals first
      });

      if (expiredSignals.length === 0) {
        this.logger.log('No expired unresolved signals found');
        return;
      }

      this.logger.log(`Found ${expiredSignals.length} expired signals to resolve`);

      // Process signals in batch
      const batch = await this.prepareBatch(expiredSignals);
      
      if (batch.signalIds.length === 0) {
        this.logger.log('No signals ready for blockchain resolution');
        return;
      }

      // Execute batch resolution on blockchain
      await this.executeBlockchainResolution(batch);

      this.logger.log(`Successfully resolved ${batch.signalIds.length} signals on-chain`);

    } catch (error) {
      this.logger.error('Error in resolveExpiredSignals:', error);
    }
  }

  /**
   * Prepare a batch of signals for resolution
   */
  private async prepareBatch(signals: Signal[]): Promise<SignalResolutionBatch> {
    const batch: SignalResolutionBatch = {
      signals: [],
      signalIds: [],
      mfsDeltas: [],
      notifications: [],
    };

    // Get unique token addresses for price fetching
    const uniqueTokenAddresses = [...new Set(signals.map(s => s.ca))];
    const priceMap = await this.tokenPriceService.getTokenPrices(uniqueTokenAddresses);

    for (const signal of signals) {
      try {
        const currentMarketCap = priceMap[signal.ca];
        
        if (!currentMarketCap) {
          this.logger.warn(`Could not fetch price for ${signal.ca}, skipping signal ${signal.transaction_hash}`);
          continue;
        }

        // Calculate MFS delta
        const isCorrect = this.mfsService.isPredictionCorrect(
          signal.mc,
          currentMarketCap,
          signal.direction
        );

        const mfsInput: MFSCalculationInput = {
          entryMarketCap: signal.mc,
          exitMarketCap: currentMarketCap,
          direction: signal.direction,
          durationDays: signal.duration_days,
          isCorrect,
        };

        const mfsResult = this.mfsService.calculateMFSDelta(mfsInput);

        // Update signal in database (but don't save yet - wait for blockchain confirmation)
        signal.status = isCorrect ? SignalStatus.WON : SignalStatus.LOST;
        signal.mfs_applied = mfsResult.mfsDelta.toString();

        // Use the signal_id directly from the Signal model
        const signalId = signal.signal_id;

        batch.signals.push(signal);
        batch.signalIds.push(signalId);
        batch.mfsDeltas.push(mfsResult.mfsDelta);

        // Prepare notification if user has them enabled
        if (signal.user?.notifications_enabled && signal.user?.notification_token) {
          const token = await this.tokenRepository.findOne({
            where: { ca: signal.ca }
          });

          batch.notifications.push({
            fid: signal.user.fid,
            signalResult: {
              tokenSymbol: token?.symbol || 'TOKEN',
              direction: signal.direction ? 'UP' : 'DOWN',
              duration: signal.duration_days,
              won: isCorrect,
              mfsScore: this.mfsService.formatMFSDelta(mfsResult.mfsDelta),
            },
          });
        }

        this.logger.log(
          `Prepared signal ${signalId} (${signal.transaction_hash}) for resolution: ${isCorrect ? 'WON' : 'LOST'} (MFS: ${this.mfsService.formatMFSDelta(mfsResult.mfsDelta)})`
        );

      } catch (error) {
        this.logger.error(`Error preparing signal ${signal.transaction_hash}:`, error);
      }
    }

    return batch;
  }

  /**
   * Execute blockchain resolution with retries
   */
  private async executeBlockchainResolution(batch: SignalResolutionBatch): Promise<void> {
    let attempt = 0;
    let success = false;

    while (attempt < this.MAX_RETRIES && !success) {
      try {
        attempt++;
        
        this.logger.log(`Attempting blockchain resolution (attempt ${attempt}/${this.MAX_RETRIES})`);
        
        // Execute batch resolution on smart contract
        const txHash = await this.blockchainService.batchResolveSignals(
          batch.signalIds,
          batch.mfsDeltas
        );

        // Mark signals as resolved in database (Ponder indexer will update the resolved flag)
        for (const signal of batch.signals) {
          signal.resolved = true;
        }
        
        await this.signalRepository.save(batch.signals);

        // Update user statistics
        await this.updateUserStatistics(batch.signals);

        // Send notifications
        if (batch.notifications.length > 0) {
          try {
            const { sent, failed } = await this.notificationService.sendBatchSignalNotifications(batch.notifications);
            this.logger.log(`Notifications sent: ${sent} successful, ${failed} failed`);
          } catch (error) {
            this.logger.error('Error sending batch notifications:', error);
          }
        }

        this.logger.log(`Blockchain resolution successful. Tx: ${txHash}`);
        success = true;

      } catch (error) {
        this.logger.error(`Blockchain resolution attempt ${attempt} failed:`, error);
        
        if (attempt === this.MAX_RETRIES) {
          // On final failure, mark signals as lost but don't send to blockchain
          for (const signal of batch.signals) {
            signal.status = SignalStatus.LOST;
          }
          await this.signalRepository.save(batch.signals);
          
          this.logger.error(`Failed to resolve signals on blockchain after ${this.MAX_RETRIES} attempts. Marked as lost in database.`);
          throw error;
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Update user statistics after signal resolution
   */
  private async updateUserStatistics(signals: Signal[]): Promise<void> {
    const userUpdates = new Map<number, { wins: number; losses: number }>();

    // Aggregate updates by user
    for (const signal of signals) {
      const userId = signal.user.fid;
      if (!userUpdates.has(userId)) {
        userUpdates.set(userId, { wins: 0, losses: 0 });
      }

      const update = userUpdates.get(userId)!;
      if (signal.status === SignalStatus.WON) {
        update.wins += 1;
      } else {
        update.losses += 1;
      }
    }

    // Apply updates
    for (const [userId, updates] of userUpdates.entries()) {
      try {
        const user = await this.userRepository.findOne({
          where: { fid: userId },
        });

        if (!user) {
          this.logger.warn(`User ${userId} not found for stats update`);
          continue;
        }

        // Update counts
        user.active_signals = Math.max(0, user.active_signals - (updates.wins + updates.losses));
        user.settled_signals += updates.wins + updates.losses;

        // Recalculate win rate
        if (user.settled_signals > 0) {
          const previousWins = Math.round(
            (user.win_rate / 100) * (user.settled_signals - updates.wins - updates.losses)
          );
          const totalWins = previousWins + updates.wins;
          user.win_rate = (totalWins / user.settled_signals) * 100;
        }

        // Calculate MFS Score
        if (user.settled_signals >= 5) {
          const winRateWeight = user.win_rate / 100;
          const volumeWeight = Math.min(user.settled_signals / 100, 1);
          const consistencyBonus = user.settled_signals >= 20 ? 0.05 : 0;
          user.mfs_score = winRateWeight * 0.7 + volumeWeight * 0.25 + consistencyBonus;
          user.mfs_score = Math.min(Math.max(user.mfs_score, 0), 1);
        }

        await this.userRepository.save(user);

        this.logger.log(
          `Updated stats for user ${userId}: +${updates.wins} wins, +${updates.losses} losses. Win rate: ${user.win_rate.toFixed(2)}%, MFS: ${user.mfs_score.toFixed(3)}`
        );

      } catch (error) {
        this.logger.error(`Error updating user stats for ${userId}:`, error);
      }
    }
  }


  /**
   * Manual trigger for testing
   */
  async triggerSignalResolution(): Promise<void> {
    await this.resolveExpiredSignals();
  }

  /**
   * Get resolution statistics
   */
  async getResolutionStats(): Promise<{
    pendingResolutions: number;
    resolvedToday: number;
    failedResolutions: number;
  }> {
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime() / 1000);

    const [pendingResolutions, resolvedToday] = await Promise.all([
      this.signalRepository.count({
        where: {
          resolved: false,
          expires_at: LessThan(BigInt(nowTimestamp)),
        },
      }),
      this.signalRepository.count({
        where: {
          resolved: true,
          timestamp: MoreThan(new Date(todayStart * 1000)),
        },
      }),
    ]);

    return {
      pendingResolutions,
      resolvedToday,
      failedResolutions: 0, // TODO: Track failed resolutions
    };
  }
}