import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { Signal } from '../../models/Signal/Signal.model';
import { SignalStatus } from '../../models/Signal/Signal.types';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
import { TokenPriceService } from './services/token-price.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { NotificationService } from '../notification/services/notification.service';

@Injectable()
export class SignalSchedulerService {
  private readonly logger = new Logger(SignalSchedulerService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    private tokenPriceService: TokenPriceService,
    private leaderboardService: LeaderboardService,
    private notificationService: NotificationService,
    // private blockchainService: BlockchainService, // Temporarily disabled
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async settleExpiredSignalsHourly() {
    this.logger.log('Starting hourly settlement of expired signals...');
    await this.settleExpiredSignals();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async settleExpiredSignals() {
    this.logger.log('Starting settlement of expired signals...');

    try {
      const now = new Date();

      // Find all active signals that have expired
      const expiredSignals = await this.signalRepository.find({
        where: {
          status: SignalStatus.ACTIVE,
          expires_at: LessThan(BigInt(Math.floor(now.getTime() / 1000))),
        },
        relations: ['user'],
        take: 50, // Process in batches to avoid overwhelming the API
      });

      if (expiredSignals.length === 0) {
        this.logger.log('No expired signals found');
        return;
      }

      this.logger.log(
        `Found ${expiredSignals.length} expired signals to settle`,
      );

      // Get unique token addresses to batch fetch prices
      const uniqueTokenAddresses = [
        ...new Set(expiredSignals.map((signal) => signal.ca)),
      ];
      const priceMap =
        await this.tokenPriceService.getTokenPrices(uniqueTokenAddresses);

      const settledSignals: Signal[] = [];
      const userUpdates = new Map<number, { wins: number; losses: number }>();
      const notificationsToSend: Array<{
        fid: number;
        signalResult: {
          tokenSymbol: string;
          direction: 'UP' | 'DOWN';
          duration: number;
          won: boolean;
          mfsScore: number;
        };
      }> = [];

      for (const signal of expiredSignals) {
        try {
          // Process the single token in the signal
          let totalCorrect = 0;
          let totalTokens = 1;

          const currentPrice = priceMap[signal.ca];

          if (!currentPrice) {
            this.logger.warn(
              `Could not fetch price for ${signal.ca}, skipping signal`,
            );
            continue;
          }

          const entryPrice = signal.mc;
          const pnlPercentage = this.tokenPriceService.calculatePnL(
            entryPrice,
            currentPrice,
          );

          // Determine if this token prediction was correct
          const isCorrect =
            (signal.direction === true && pnlPercentage > 0) ||
            (signal.direction === false && pnlPercentage < 0);

          if (isCorrect) {
            totalCorrect++;
          }

          // Calculate MFS Signal Score: Market Cap Change (in $) × Direction × e^(-λ×(days-1))
          const marketCapChangeDollars = currentPrice - entryPrice; // Absolute dollar difference
          const direction = isCorrect ? 1 : -1; // +1 if correct prediction, -1 if incorrect
          const decayMultiplier = Math.exp(-0.075 * Math.max(0, signal.duration - 1)); // Day 1 = multiplier 1
          const mfsSignalScore = marketCapChangeDollars * direction * decayMultiplier;

          // Determine overall signal result
          const isWin = totalCorrect >= 1; // Since we only have 1 token now
          signal.status = isWin ? SignalStatus.WON : SignalStatus.LOST;

          settledSignals.push(signal);

          // Prepare notification data if user has notifications enabled
          if (signal.user?.notifications_enabled && signal.user?.notification_token) {
            // Get token info for notification
            const token = await this.tokenRepository.findOne({
              where: { ca: signal.ca }
            });
            
            notificationsToSend.push({
              fid: signal.user.fid,
              signalResult: {
                tokenSymbol: token?.symbol || 'TOKEN',
                direction: signal.direction ? 'UP' : 'DOWN',
                duration: signal.duration,
                won: isWin,
                mfsScore: mfsSignalScore, // Raw dollar-based score
              },
            });
          }

          // Track user updates
          const userId = signal.user.fid;
          if (!userUpdates.has(userId)) {
            userUpdates.set(userId, { wins: 0, losses: 0 });
          }

          const userUpdate = userUpdates.get(userId);
          if (isWin) {
            userUpdate.wins += 1;
          } else {
            userUpdate.losses += 1;
          }

          this.logger.log(
            `Settled signal ${signal.transaction_hash}: ${signal.status} (${totalCorrect}/${totalTokens} correct)`,
          );
        } catch (error) {
          this.logger.error(
            `Error settling signal ${signal.transaction_hash}:`,
            error,
          );
          // Mark as lost if we can't process it
          signal.status = SignalStatus.LOST;
          settledSignals.push(signal);
        }
      }

      // Batch save all settled signals
      if (settledSignals.length > 0) {
        await this.signalRepository.save(settledSignals);
      }

      // Update user statistics
      for (const [userId, updates] of userUpdates.entries()) {
        await this.updateUserStats(userId, updates.wins, updates.losses);
      }

      // Send batch notifications
      if (notificationsToSend.length > 0) {
        this.logger.log(`Sending ${notificationsToSend.length} signal settlement notifications`);
        try {
          const { sent, failed } = await this.notificationService.sendBatchSignalNotifications(notificationsToSend);
          this.logger.log(`Notifications sent: ${sent} successful, ${failed} failed`);
        } catch (error) {
          this.logger.error('Error sending batch notifications:', error);
        }
      }

      this.logger.log(`Successfully settled ${settledSignals.length} signals`);
    } catch (error) {
      this.logger.error('Error in settleExpiredSignals:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateLeaderboardRanks() {
    this.logger.log('Updating leaderboard ranks...');

    try {
      await this.leaderboardService.updateUserRanks();
      this.logger.log('Leaderboard ranks updated successfully');
    } catch (error) {
      this.logger.error('Error updating leaderboard ranks:', error);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupTokenPriceCache() {
    this.logger.log('Cleaning up token price cache...');

    try {
      this.tokenPriceService.cleanupCache();
      const stats = this.tokenPriceService.getCacheStats();
      this.logger.log(
        `Cache cleanup complete. Cache stats: hits=${stats.hits}, misses=${stats.misses}, size=${stats.size}`,
      );
    } catch (error) {
      this.logger.error('Error cleaning up cache:', error);
    }
  }

  private async updateUserStats(
    userId: number,
    wins: number,
    losses: number,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid: userId },
      });
      if (!user) {
        this.logger.warn(`User ${userId} not found for stats update`);
        return;
      }

      // Update counts
      user.active_signals = Math.max(0, user.active_signals - (wins + losses));
      user.settled_signals += wins + losses;

      // Recalculate win rate
      if (user.settled_signals > 0) {
        const previousWins = Math.round(
          (user.win_rate / 100) * (user.settled_signals - wins - losses),
        );
        const totalWins = previousWins + wins;
        user.win_rate = (totalWins / user.settled_signals) * 100;
      }

      // Calculate MFS Score (Memetic Footprint Score)
      if (user.settled_signals >= 5) {
        const winRateWeight = user.win_rate / 100;
        const volumeWeight = Math.min(user.settled_signals / 100, 1); // Cap at 100 signals for volume weight
        const consistencyBonus = user.settled_signals >= 20 ? 0.05 : 0; // Small bonus for high activity
        user.mfs_score =
          winRateWeight * 0.7 + volumeWeight * 0.25 + consistencyBonus;

        // Ensure MFS score is between 0 and 1
        user.mfs_score = Math.min(Math.max(user.mfs_score, 0), 1);
      }

      await this.userRepository.save(user);

      this.logger.log(
        `Updated stats for user ${userId}: ${wins} wins, ${losses} losses. New win rate: ${user.win_rate.toFixed(2)}%, MFS: ${user.mfs_score.toFixed(3)}`,
      );
    } catch (error) {
      this.logger.error(`Error updating user stats for ${userId}:`, error);
    }
  }

  // Manual trigger methods for testing
  async triggerExpiredSignalsSettlement() {
    await this.settleExpiredSignals();
  }

  async triggerLeaderboardUpdate() {
    await this.updateLeaderboardRanks();
  }

  async triggerCacheCleanup() {
    await this.cleanupTokenPriceCache();
  }
}
