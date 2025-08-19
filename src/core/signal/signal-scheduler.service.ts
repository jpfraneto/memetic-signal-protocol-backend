import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { TokenPriceService } from './services/token-price.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class SignalSchedulerService {
  private readonly logger = new Logger(SignalSchedulerService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tokenPriceService: TokenPriceService,
    private leaderboardService: LeaderboardService,
    private blockchainService: BlockchainService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async settleExpiredSignals() {
    this.logger.log('Starting settlement of expired signals...');

    try {
      const now = new Date();

      // Find all active signals that have expired
      const expiredSignals = await this.signalRepository.find({
        where: {
          status: 'ACTIVE',
          expiresAt: LessThan(now),
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
        ...new Set(
          expiredSignals.flatMap((signal) =>
            signal.tokens.map((token) => token.ca),
          ),
        ),
      ];
      const priceMap =
        await this.tokenPriceService.getTokenPrices(uniqueTokenAddresses);

      const settledSignals: Signal[] = [];
      const userUpdates = new Map<number, { wins: number; losses: number }>();

      for (const signal of expiredSignals) {
        try {
          // Process each token in the signal
          let totalCorrect = 0;
          let totalTokens = signal.tokens.length;

          for (const token of signal.tokens) {
            const currentPrice = priceMap[token.ca];

            if (!currentPrice) {
              this.logger.warn(
                `Could not fetch price for ${token.ca}, skipping token`,
              );
              continue;
            }

            // Calculate if this token prediction was correct
            const entryPrice = +token.mc / 1e18; // Convert from scaled market cap
            const pnlPercentage = this.tokenPriceService.calculatePnL(
              entryPrice,
              currentPrice,
            );

            // Determine if this token prediction was correct
            const isCorrect =
              (token.direction === 'UP' && pnlPercentage > 0) ||
              (token.direction === 'DOWN' && pnlPercentage < 0);

            if (isCorrect) {
              totalCorrect++;
            }
          }

          // Determine overall signal result
          const winThreshold = Math.ceil(totalTokens * 0.6); // 60% correct threshold
          const isWin = totalCorrect >= winThreshold;

          signal.correctPredictions = totalCorrect;
          signal.status = isWin ? 'WON' : 'LOST';

          settledSignals.push(signal);

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
            `Settled signal ${signal.signalId}: ${signal.status} (${totalCorrect}/${totalTokens} correct)`,
          );
        } catch (error) {
          this.logger.error(`Error settling signal ${signal.signalId}:`, error);
          // Mark as expired if we can't process it
          signal.status = 'EXPIRED';
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
      user.activeSignals = Math.max(0, user.activeSignals - (wins + losses));
      user.settledSignals += wins + losses;

      // Recalculate win rate
      if (user.settledSignals > 0) {
        const previousWins = Math.round(
          (user.winRate / 100) * (user.settledSignals - wins - losses),
        );
        const totalWins = previousWins + wins;
        user.winRate = (totalWins / user.settledSignals) * 100;
      }

      // Calculate MFS Score (Memetic Footprint Score)
      if (user.settledSignals >= 5) {
        const winRateWeight = user.winRate / 100;
        const volumeWeight = Math.min(user.settledSignals / 100, 1); // Cap at 100 signals for volume weight
        const consistencyBonus = user.settledSignals >= 20 ? 0.05 : 0; // Small bonus for high activity
        user.mfsScore =
          winRateWeight * 0.7 + volumeWeight * 0.25 + consistencyBonus;

        // Ensure MFS score is between 0 and 1
        user.mfsScore = Math.min(Math.max(user.mfsScore, 0), 1);
      }

      await this.userRepository.save(user);

      this.logger.log(
        `Updated stats for user ${userId}: ${wins} wins, ${losses} losses. New win rate: ${user.winRate.toFixed(2)}%, MFS: ${user.mfsScore.toFixed(3)}`,
      );
    } catch (error) {
      this.logger.error(`Error updating user stats for ${userId}:`, error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncBlockchainSignals() {
    this.logger.log('Starting blockchain sync...');

    try {
      // Get contract stats to understand total signals
      const stats = await this.blockchainService.getContractStats();

      // Get the latest signal ID we have in our database
      const latestSignal = await this.signalRepository.findOne({
        order: { signalId: 'DESC' },
      });

      const lastSyncedId = latestSignal ? parseInt(latestSignal.signalId) : 0;
      const latestBlockchainId = stats.nextSignalId - 1;

      if (lastSyncedId >= latestBlockchainId) {
        this.logger.log('Database is up to date with blockchain');
        return;
      }

      this.logger.log(
        `Syncing signals ${lastSyncedId + 1} to ${latestBlockchainId}`,
      );

      // Sync missing signals
      for (
        let signalId = lastSyncedId + 1;
        signalId <= latestBlockchainId;
        signalId++
      ) {
        await this.blockchainService.syncSignalFromBlockchain(signalId);

        // Batch in groups of 10 to avoid overwhelming the system
        if (signalId % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief pause
        }
      }

      this.logger.log(
        `Completed blockchain sync: ${latestBlockchainId - lastSyncedId} signals synced`,
      );
    } catch (error) {
      this.logger.error('Error in blockchain sync:', error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async settleExpiredSignalsOnBlockchain() {
    this.logger.log('Checking for expired signals to settle on blockchain...');

    try {
      // Get expired signals from blockchain
      const expiredSignals =
        await this.blockchainService.getExpiredSignalsFromBlockchain(20);

      if (expiredSignals.length === 0) {
        this.logger.log('No expired signals found on blockchain');
        return;
      }

      this.logger.log(
        `Found ${expiredSignals.length} expired signals on blockchain`,
      );

      // Collect unique token addresses for price fetching
      const tokenAddressSet = new Set<string>();
      const signalDetails: Array<{ signalId: string; tokens: string[] }> = [];

      for (const signal of expiredSignals) {
        if (signal.tokens && signal.tokens.length > 0) {
          const tokenAddresses = signal.tokens.map((token) =>
            token.ca.toLowerCase(),
          );
          tokenAddresses.forEach((addr) => tokenAddressSet.add(addr));
          signalDetails.push({
            signalId: signal.signalId,
            tokens: tokenAddresses,
          });
        }
      }

      // Batch fetch current prices
      const priceMap = await this.tokenPriceService.getTokenPrices(
        Array.from(tokenAddressSet),
      );

      // Prepare settlement data
      const settlements: Array<{ signalId: number; exitMarketCap: string }> =
        [];

      for (const detail of signalDetails) {
        // Use the first token's price for settlement
        const firstToken = detail.tokens[0];
        const currentPrice = priceMap[firstToken];
        if (currentPrice) {
          settlements.push({
            signalId:
              typeof detail.signalId === 'string'
                ? +detail.signalId
                : detail.signalId,
            exitMarketCap: (currentPrice * 1e18).toString(), // Convert to wei-like format
          });
        } else {
          this.logger.warn(
            `Could not fetch price for ${firstToken}, skipping signal ${detail.signalId}`,
          );
        }
      }

      if (settlements.length === 0) {
        this.logger.log('No settlements possible due to missing prices');
        return;
      }

      // Batch settle on blockchain
      const success =
        await this.blockchainService.batchSettleSignalsOnBlockchain(
          settlements,
        );

      if (success) {
        this.logger.log(
          `Successfully settled ${settlements.length} signals on blockchain`,
        );
      } else {
        this.logger.error('Failed to settle signals on blockchain');
      }
    } catch (error) {
      this.logger.error('Error in settleExpiredSignalsOnBlockchain:', error);
    }
  }

  // Manual trigger methods for testing
  async triggerExpiredSignalsSettlement() {
    await this.settleExpiredSignals();
  }

  async triggerBlockchainSettlement() {
    await this.settleExpiredSignalsOnBlockchain();
  }

  async triggerBlockchainSync() {
    await this.syncBlockchainSignals();
  }

  async triggerLeaderboardUpdate() {
    await this.updateLeaderboardRanks();
  }

  async triggerCacheCleanup() {
    await this.cleanupTokenPriceCache();
  }
}
