import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { Call } from '../../models/Call/Call.model';
import { User } from '../../models/User/User.model';
import { TokenPriceService } from '../call/services/token-price.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class SignalSchedulerService {
  private readonly logger = new Logger(SignalSchedulerService.name);

  constructor(
    @InjectRepository(Call)
    private callRepository: Repository<Call>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tokenPriceService: TokenPriceService,
    private leaderboardService: LeaderboardService,
    private blockchainService: BlockchainService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async settleExpiredCalls() {
    this.logger.log('Starting settlement of expired calls...');

    try {
      const now = new Date();

      // Find all active calls that have expired
      const expiredCalls = await this.callRepository.find({
        where: {
          status: 'active',
          expiresAt: LessThan(now),
        },
        relations: ['user'],
        take: 50, // Process in batches to avoid overwhelming the API
      });

      if (expiredCalls.length === 0) {
        this.logger.log('No expired calls found');
        return;
      }

      this.logger.log(`Found ${expiredCalls.length} expired calls to settle`);

      // Get unique token addresses to batch fetch prices
      const uniqueTokenAddresses = [
        ...new Set(expiredCalls.map((call) => call.tokenAddress)),
      ];
      const priceMap =
        await this.tokenPriceService.getTokenPrices(uniqueTokenAddresses);

      const settledCalls: Call[] = [];
      const userUpdates = new Map<number, { wins: number; losses: number }>();

      for (const call of expiredCalls) {
        try {
          const currentPrice = priceMap.get(call.tokenAddress.toLowerCase());

          if (!currentPrice) {
            this.logger.warn(
              `Could not fetch price for ${call.tokenAddress}, marking as expired`,
            );
            call.status = 'expired';
            settledCalls.push(call);
            continue;
          }

          // Calculate PnL
          const pnlPercentage = this.tokenPriceService.calculatePnL(
            call.callPrice,
            currentPrice,
            call.direction,
          );

          const isWin = pnlPercentage > 0;
          call.currentPrice = currentPrice;
          call.pnlPercentage = pnlPercentage;
          call.status = isWin ? 'won' : 'lost';

          settledCalls.push(call);

          // Track user updates
          const userId = call.user.fid;
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
            `Settled call ${call.signalId}: ${call.status} (${pnlPercentage.toFixed(2)}%)`,
          );
        } catch (error) {
          this.logger.error(`Error settling call ${call.signalId}:`, error);
          // Mark as expired if we can't process it
          call.status = 'expired';
          settledCalls.push(call);
        }
      }

      // Batch save all settled calls
      if (settledCalls.length > 0) {
        await this.callRepository.save(settledCalls);
      }

      // Update user statistics
      for (const [userId, updates] of userUpdates.entries()) {
        await this.updateUserStats(userId, updates.wins, updates.losses);
      }

      this.logger.log(`Successfully settled ${settledCalls.length} calls`);
    } catch (error) {
      this.logger.error('Error in settleExpiredCalls:', error);
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
        `Cache cleanup complete. Price cache: ${stats.priceCache}, Info cache: ${stats.tokenInfoCache}`,
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
      user.activeCalls = Math.max(0, user.activeCalls - (wins + losses));
      user.settledCalls += wins + losses;

      // Recalculate win rate
      if (user.settledCalls > 0) {
        const previousWins = Math.round(
          (user.winRate / 100) * (user.settledCalls - wins - losses),
        );
        const totalWins = previousWins + wins;
        user.winRate = (totalWins / user.settledCalls) * 100;
      }

      // Calculate MFS Score (Memetic Footprint Score)
      if (user.settledCalls >= 5) {
        const winRateWeight = user.winRate / 100;
        const volumeWeight = Math.min(user.settledCalls / 100, 1); // Cap at 100 calls for volume weight
        const consistencyBonus = user.settledCalls >= 20 ? 0.05 : 0; // Small bonus for high activity
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
      const latestCall = await this.callRepository.findOne({
        order: { signalId: 'DESC' }
      });
      
      const lastSyncedId = latestCall ? parseInt(latestCall.signalId) : 0;
      const latestBlockchainId = stats.nextSignalId - 1;

      if (lastSyncedId >= latestBlockchainId) {
        this.logger.log('Database is up to date with blockchain');
        return;
      }

      this.logger.log(`Syncing signals ${lastSyncedId + 1} to ${latestBlockchainId}`);

      // Sync missing signals
      for (let signalId = lastSyncedId + 1; signalId <= latestBlockchainId; signalId++) {
        await this.blockchainService.syncSignalFromBlockchain(signalId);
        
        // Batch in groups of 10 to avoid overwhelming the system
        if (signalId % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
        }
      }

      this.logger.log(`Completed blockchain sync: ${latestBlockchainId - lastSyncedId} signals synced`);
    } catch (error) {
      this.logger.error('Error in blockchain sync:', error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async settleExpiredCallsOnBlockchain() {
    this.logger.log('Checking for expired signals to settle on blockchain...');

    try {
      // Get expired signals from blockchain
      const expiredSignalIds = await this.blockchainService.getExpiredSignalsFromBlockchain(20);
      
      if (expiredSignalIds.length === 0) {
        this.logger.log('No expired signals found on blockchain');
        return;
      }

      this.logger.log(`Found ${expiredSignalIds.length} expired signals on blockchain`);

      // Collect unique token addresses for price fetching
      const tokenAddresses = new Set<string>();
      const signalDetails: Array<{signalId: number, token: string}> = [];

      for (const signalId of expiredSignalIds) {
        const signal = await this.blockchainService.getSignalFromBlockchain(signalId);
        if (signal) {
          tokenAddresses.add(signal.token.toLowerCase());
          signalDetails.push({
            signalId,
            token: signal.token.toLowerCase()
          });
        }
      }

      // Batch fetch current prices
      const priceMap = await this.tokenPriceService.getTokenPrices(Array.from(tokenAddresses));

      // Prepare settlement data
      const settlements: Array<{signalId: number, exitPrice: number}> = [];
      
      for (const detail of signalDetails) {
        const currentPrice = priceMap.get(detail.token);
        if (currentPrice) {
          settlements.push({
            signalId: detail.signalId,
            exitPrice: currentPrice
          });
        } else {
          this.logger.warn(`Could not fetch price for ${detail.token}, skipping signal ${detail.signalId}`);
        }
      }

      if (settlements.length === 0) {
        this.logger.log('No settlements possible due to missing prices');
        return;
      }

      // Batch settle on blockchain
      const success = await this.blockchainService.batchSettleSignalsOnBlockchain(settlements);
      
      if (success) {
        this.logger.log(`Successfully settled ${settlements.length} signals on blockchain`);
      } else {
        this.logger.error('Failed to settle signals on blockchain');
      }

    } catch (error) {
      this.logger.error('Error in settleExpiredCallsOnBlockchain:', error);
    }
  }

  // Manual trigger methods for testing
  async triggerExpiredCallsSettlement() {
    await this.settleExpiredCalls();
  }

  async triggerBlockchainSettlement() {
    await this.settleExpiredCallsOnBlockchain();
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
