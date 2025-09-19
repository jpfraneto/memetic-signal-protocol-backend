import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
import { TokenPriceService } from './services/token-price.service';
import { NotificationService } from '../notification/services/notification.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { MFSService, MFSCalculationInput } from '../mfs/mfs.service';

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
  async process5MinuteBatchResolution() {
    this.logger.log('Starting 5-minute batch resolution cycle...');

    try {
      const nowTimestamp = Math.floor(Date.now() / 1000); // Current timestamp in seconds

      // Query database directly for expired, unresolved signals
      const expiredSignals = await this.signalRepository.find({
        where: {
          resolved: false, // Only unresolved signals
          resolution_error: false, // Skip signals that already failed resolution
          expires_at: LessThan(BigInt(nowTimestamp)), // Expired signals (bigint comparison)
        },
        relations: ['user', 'token'],
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
          let exitMarketCapSource = 'unknown';
          let resolutionAttempts: string[] = [];

          if (tokenInfo && tokenInfo.marketCap > 0) {
            const exitMarketCap = tokenInfo.marketCap;

            // Get source information from the historical data manager
            const fallbackResult =
              await this.tokenPriceService.getLastResolutionResult();
            if (fallbackResult) {
              exitMarketCapSource = fallbackResult.source;
              resolutionAttempts = fallbackResult.attempts;
            }

            // Calculate MFS delta using the MFS service
            isCorrect = this.mfsService.isPredictionCorrect(
              Number(signal.entry_market_cap),
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
            mfsDelta = mfsResult.mfsDelta;
          } else {
            this.logger.warn(
              `No historical market cap found for ${signal.ca} at ${signalEndDate.toISOString()}, resolving with MFS delta 0`,
            );
          }

          // Update signal in database
          signal.resolved = true; // Mark as resolved regardless
          signal.mfs_delta = mfsDelta;

          // Store resolution tracking data
          if (tokenInfo && tokenInfo.marketCap > 0) {
            signal.exit_market_cap = BigInt(Math.floor(tokenInfo.marketCap));

            // Get source information from the token price service
            const resolutionResult =
              this.tokenPriceService.getLastResolutionResult();
            if (resolutionResult) {
              signal.data_sources = JSON.stringify([resolutionResult.source]);
              signal.resolution_attempts = JSON.stringify(
                resolutionResult.attempts,
              );
            }
          } else {
            signal.exit_market_cap = BigInt(0);
            signal.resolution_error = true;
            const resolutionResult =
              this.tokenPriceService.getLastResolutionResult();
            if (resolutionResult) {
              signal.data_sources = JSON.stringify(['failed']);
              signal.resolution_attempts = JSON.stringify(
                resolutionResult.attempts,
              );
            } else {
              signal.data_sources = JSON.stringify(['failed']);
              signal.resolution_attempts = JSON.stringify([
                'Zapper',
                'CoinMarketCap',
                'CryptoCompare',
                'CoinAPI',
              ]);
            }
          }

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

          // Send notification and publish cast if signal has definitive outcome
          if (tokenInfo && tokenInfo.marketCap > 0) {
            // Send notification
            try {
              await this.notificationService.sendSignalSettledNotification(
                signal.user.fid,
                {
                  tokenSymbol: signal.token?.symbol || 'Unknown',
                  direction: signal.direction ? 'UP' : 'DOWN',
                  duration: signal.duration_days,
                  won: isCorrect,
                  mfsScore: mfsDelta,
                },
              );
            } catch (notificationError) {
              this.logger.error(
                `Failed to send notification for signal ${signal.signal_id}:`,
                notificationError,
              );
            }

            // Publish RESOLVED cast with details
            try {
              // Fetch updated user stats for MFS and rank after stats update
              const refreshedUser = await this.userRepository.findOne({
                where: { fid: signal.user.fid },
              });

              const updatedUserMfs = refreshedUser?.mfs_score ?? 0;
              const updatedUserRank = refreshedUser?.rank ?? null;

              await this.notificationService.publishResolvedSignalCast({
                username: signal.user.username || `fid:${signal.user.fid}`,
                tokenSymbol: signal.token?.symbol || 'Unknown',
                direction: signal.direction ? 'UP' : 'DOWN',
                duration: signal.duration_days,
                contractAddress: signal.ca,
                entryMarketCap: Math.floor(Number(signal.entry_market_cap)),
                exitMarketCap: Math.floor(Number(tokenInfo.marketCap)),
                mfsDelta: mfsDelta,
                userMfsScore: updatedUserMfs,
                userRank: updatedUserRank,
              });
            } catch (castError) {
              this.logger.error(
                `Failed to publish resolved cast for signal ${signal.signal_id}:`,
                castError,
              );
            }
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
    await this.process5MinuteBatchResolution();
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
          timestamp: new Date(todayStart * 1000),
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
