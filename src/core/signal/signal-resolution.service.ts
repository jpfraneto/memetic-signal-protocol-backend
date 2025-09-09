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
  mfsDeltas: number[];
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
  private readonly BATCH_SIZE = 90; // Process signals in batches of 90 (smart contract limit is 100)
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
   * Every 5 minutes batch processing cron - processes all expired signals
   */
  @Cron('*/5 * * * *') // Every 5 minutes - COST-OPTIMIZED BATCHING
  async processHourlyBatchResolution() {
    this.logger.log('Starting 5-minute batch resolution cycle...');

    try {
      const nowTimestamp = Math.floor(Date.now() / 1000); // Current timestamp in seconds

      // Query database directly for expired, unresolved signals
      const expiredSignals = await this.signalRepository.find({
        where: {
          resolved: false, // Only unresolved signals
          expires_at: LessThan(BigInt(nowTimestamp)), // Expired signals (bigint comparison)
        },
        relations: ['user'],
        order: { expires_at: 'ASC' }, // Process oldest expired signals first
      });

      if (expiredSignals.length === 0) {
        this.logger.log('No expired signals ready for resolution');
        return;
      }

      this.logger.log(
        `Found ${expiredSignals.length} expired signals ready for resolution`,
      );

      let totalProcessed = 0;
      for (const signal of expiredSignals) {
        try {
          // Get the end timestamp of the signal period (expires_at)
          const signalEndTimestamp = Number(signal.expires_at);
          const signalEndDate = new Date(signalEndTimestamp * 1000);

          this.logger.log(
            `Processing signal ${signal.signal_id} for token ${signal.ca}, expired at ${signalEndDate.toISOString()}`,
          );

          // Query token market cap at the end of the signal period
          const tokenInfo = await this.tokenPriceService.getTokenInfo(
            signal.ca,
            signalEndDate,
          );

          let mfsDelta = 0;
          let isCorrect = false;

          if (tokenInfo && tokenInfo.marketCap > 0) {
            const exitMarketCap = tokenInfo.marketCap;

            // Calculate MFS delta using the MFS service
            isCorrect = this.mfsService.isPredictionCorrect(
              signal.entry_market_cap,
              exitMarketCap,
              signal.direction,
            );

            const mfsInput: MFSCalculationInput = {
              entryMarketCap: Math.floor(Number(signal.entry_market_cap)),
              exitMarketCap: Math.floor(Number(exitMarketCap)),
              direction: signal.direction,
              durationDays: signal.duration_days,
              isCorrect,
            };

            const mfsResult = this.mfsService.calculateMFSDelta(mfsInput);
            console.log('IN HERE, THE MFS RESULT IS', mfsResult);
            mfsDelta = mfsResult.mfsDelta;
            console.log('IN HERE THE MFS DELTA IS', mfsDelta);
          } else {
            this.logger.warn(
              `No historical market cap found for ${signal.ca} at ${signalEndDate.toISOString()}, resolving with MFS delta 0`,
            );
          }

          // Update signal in database
          signal.resolved = true; // Mark as resolved regardless
          signal.mfs_delta = mfsDelta;

          await this.signalRepository.save(signal);

          // Update user statistics
          if (tokenInfo && tokenInfo.marketCap > 0) {
            // With data: wins/losses based on correctness
            const statsSignal = { ...signal, resolved: isCorrect } as Signal;
            await this.updateUserStatistics([statsSignal]);
          } else {
            // Missing data: neutral update (no win/loss impact, keep win_rate)
            await this.updateUserStatisticsNeutral([signal]);
          }

          totalProcessed++;

          const outcomeLabel =
            tokenInfo && tokenInfo.marketCap > 0
              ? isCorrect
                ? 'WON'
                : 'LOST'
              : 'PROCESSED';
          this.logger.log(
            `Successfully resolved signal ${signal.signal_id}: ${outcomeLabel} (MFS: ${mfsDelta})`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process signal ${signal.signal_id}:`,
            error,
          );
          // Continue with next signal even if one fails
        }
      }

      this.logger.log(
        `5-minute batch resolution complete: ${totalProcessed} signals processed`,
      );
    } catch (error) {
      this.logger.error('Error in 5-minute batch resolution cycle:', error);
    }
  }

  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Execute blockchain resolution with retries
   */
  private async executeBlockchainResolution(
    batch: SignalResolutionBatch,
  ): Promise<void> {
    let attempt = 0;
    let success = false;

    while (attempt < this.MAX_RETRIES && !success) {
      try {
        attempt++;

        this.logger.log(
          `Attempting blockchain resolution (attempt ${attempt}/${this.MAX_RETRIES})`,
        );

        // Execute batch resolution on smart contract
        const txHash = await this.blockchainService.batchResolveSignals(
          batch.signalIds,
          batch.mfsDeltas.map((delta) => BigInt(delta)),
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
            const { sent, failed } =
              await this.notificationService.sendBatchSignalNotifications(
                batch.notifications,
              );
            this.logger.log(
              `Notifications sent: ${sent} successful, ${failed} failed`,
            );
          } catch (error) {
            this.logger.error('Error sending batch notifications:', error);
          }
        }

        this.logger.log(`Blockchain resolution successful. Tx: ${txHash}`);
        success = true;
      } catch (error) {
        this.logger.error(
          `Blockchain resolution attempt ${attempt} failed:`,
          error,
        );

        if (attempt === this.MAX_RETRIES) {
          // On final failure, mark signals as lost but don't send to blockchain
          for (const signal of batch.signals) {
            signal.resolved = false;
          }
          await this.signalRepository.save(batch.signals);

          this.logger.error(
            `Failed to resolve signals on blockchain after ${this.MAX_RETRIES} attempts. Marked as lost in database.`,
          );
          throw error;
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Update user statistics after signal resolution
   */
  private async updateUserStatistics(signals: Signal[]): Promise<void> {
    const userUpdates = new Map<
      number,
      { wins: number; losses: number; mfsDeltas: number[] }
    >();

    // Aggregate updates by user
    for (const signal of signals) {
      const userId = signal.user.fid;
      if (!userUpdates.has(userId)) {
        userUpdates.set(userId, { wins: 0, losses: 0, mfsDeltas: [] });
      }

      const update = userUpdates.get(userId)!;
      if (signal.resolved) {
        update.wins += 1;
      } else {
        update.losses += 1;
      }

      // Collect MFS deltas for this user
      update.mfsDeltas.push(signal.mfs_delta || 0);
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
        user.active_signals = Math.max(
          0,
          user.active_signals - (updates.wins + updates.losses),
        );
        user.settled_signals += updates.wins + updates.losses;

        // Recalculate win rate
        if (user.settled_signals > 0) {
          const previousWins = Math.round(
            (user.win_rate / 100) *
              (user.settled_signals - updates.wins - updates.losses),
          );
          const totalWins = previousWins + updates.wins;
          user.win_rate = (totalWins / user.settled_signals) * 100;
        }

        // Simple MFS Score calculation: add all mfs_deltas to the previous score
        const totalMfsDelta = updates.mfsDeltas.reduce(
          (sum, delta) => sum + delta,
          0,
        );
        user.mfs_score += totalMfsDelta;

        await this.userRepository.save(user);

        this.logger.log(
          `Updated stats for user ${userId}: +${updates.wins} wins, +${updates.losses} losses. Win rate: ${user.win_rate.toFixed(2)}%, MFS: ${user.mfs_score.toFixed(3)} (+${totalMfsDelta.toFixed(3)})`,
        );
      } catch (error) {
        this.logger.error(`Error updating user stats for ${userId}:`, error);
      }
    }
  }

  /**
   * Neutral stats update when outcome is unknown (e.g., missing historical data)
   * - Decrements active_signals and increments settled_signals
   * - Does NOT change wins, losses, or win_rate
   */
  private async updateUserStatisticsNeutral(signals: Signal[]): Promise<void> {
    const userCounts = new Map<number, number>();

    for (const signal of signals) {
      const userId = signal.user.fid;
      userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
    }

    for (const [userId, count] of userCounts.entries()) {
      try {
        const user = await this.userRepository.findOne({
          where: { fid: userId },
        });
        if (!user) {
          this.logger.warn(`User ${userId} not found for neutral stats update`);
          continue;
        }

        user.active_signals = Math.max(0, user.active_signals - count);
        user.settled_signals += count;

        // win_rate remains unchanged intentionally

        await this.userRepository.save(user);

        this.logger.log(
          `Neutral stats update for user ${userId}: +${count} settled (unknown outcome). Win rate unchanged at ${user.win_rate.toFixed(2)}%`,
        );
      } catch (error) {
        this.logger.error(
          `Error applying neutral stats update for ${userId}:`,
          error,
        );
      }
    }
  }

  /**
   * Manual trigger for 5-minute batch processing
   */
  async triggerSignalResolution(): Promise<void> {
    await this.processHourlyBatchResolution();
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
    const todayStart = Math.floor(
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
      ).getTime() / 1000,
    );

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
          timestamp: BigInt(todayStart),
        },
      }),
    ]);

    return {
      pendingResolutions,
      resolvedToday,
      failedResolutions: 0, // TODO: Track failed resolutions
    };
  }

  /**
   * Get batch processing statistics
   */
  async getBatchStats(): Promise<{
    signalsReadyForBatch: number;
    nextBatchProcessing: string;
  }> {
    try {
      const nowTimestamp = Math.floor(Date.now() / 1000);

      // Count expired unresolved signals
      const readyCount = await this.signalRepository.count({
        where: {
          resolved: false,
          expires_at: LessThan(BigInt(nowTimestamp)),
        },
      });

      // Calculate next 5-minute batch time
      const now = new Date();
      const nextBatch = new Date(now);
      const currentMinutes = now.getMinutes();
      const nextBatchMinutes = Math.ceil(currentMinutes / 5) * 5;
      nextBatch.setMinutes(nextBatchMinutes, 0, 0);

      // If we're at the top of the hour, go to next hour
      if (nextBatchMinutes >= 60) {
        nextBatch.setHours(nextBatch.getHours() + 1, 0, 0, 0);
      }

      const minutesUntilBatch = Math.ceil(
        (nextBatch.getTime() - now.getTime()) / (1000 * 60),
      );

      return {
        signalsReadyForBatch: readyCount,
        nextBatchProcessing: `In ${minutesUntilBatch} minutes (next 5-minute interval)`,
      };
    } catch (error) {
      this.logger.error('Failed to get batch stats:', error);
      return {
        signalsReadyForBatch: 0,
        nextBatchProcessing: 'Unknown - error occurred',
      };
    }
  }
}
