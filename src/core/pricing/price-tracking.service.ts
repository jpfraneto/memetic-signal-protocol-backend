import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Signal } from '../../models/Signal/Signal.model';
import { PriceSnapshot } from '../../models/PriceSnapshot/PriceSnapshot.model';
import { TokenPriceService } from '../signal/services/token-price.service';
import { ScoringService } from '../scoring/scoring.service';
import { SignalStatus } from '../../models/Signal/Signal.types';

@Injectable()
export class PriceTrackingService {
  private readonly logger = new Logger(PriceTrackingService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(PriceSnapshot)
    private priceSnapshotRepository: Repository<PriceSnapshot>,
    private tokenPriceService: TokenPriceService,
    private scoringService: ScoringService,
    private dataSource: DataSource,
  ) {}

  /**
   * Price tracking job - runs every 30 minutes
   * 1. Query active signals for unique contract addresses
   * 2. Fetch current market caps using TokenPriceService
   * 3. Store PriceSnapshot records
   * 4. Check expired signals and calculate final scores
   * 5. Update user totalScore values
   * 6. Refresh leaderboard cache
   */
  @Cron('0 */30 * * * *') // Every 30 minutes
  async trackPrices(): Promise<void> {
    this.logger.log('Starting price tracking job...');

    try {
      // 1. Get unique contract addresses from active signals
      const activeContracts = await this.signalRepository
        .createQueryBuilder('signal')
        .select('DISTINCT signal.ca', 'ca')
        .where('signal.resolved = :status', { status: false })
        .getRawMany();

      this.logger.log(
        `Found ${activeContracts.length} unique contracts with active signals`,
      );

      if (activeContracts.length === 0) {
        this.logger.log('No active signals to track, skipping price job');
        return;
      }

      // 2. Fetch current prices and market caps
      const contractAddresses = activeContracts.map((row) => row.ca);
      const priceSnapshots: PriceSnapshot[] = [];
      const currentTime = new Date();

      for (const contractAddress of contractAddresses) {
        try {
          const tokenInfo =
            await this.tokenPriceService.getTokenInfo(contractAddress);

          if (tokenInfo && tokenInfo.marketCap && tokenInfo.price) {
            const snapshot = new PriceSnapshot();
            snapshot.tokenAddress = contractAddress;
            snapshot.marketCap = tokenInfo.marketCap;
            snapshot.price = tokenInfo.price;
            snapshot.volume24h = tokenInfo.volume24h || 0;
            snapshot.snapshotAt = currentTime;

            priceSnapshots.push(snapshot);
          } else {
            this.logger.warn(
              `No price data available for contract ${contractAddress}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to fetch price data for ${contractAddress}:`,
            error,
          );
        }
      }

      // 3. Store price snapshots in batch
      if (priceSnapshots.length > 0) {
        await this.priceSnapshotRepository.save(priceSnapshots);
        this.logger.log(`Saved ${priceSnapshots.length} price snapshots`);
      }

      // 4. Process expired signals and update scores
      await this.scoringService.processExpiredSignals();

      // 5. Update leaderboard rankings
      await this.scoringService.updateLeaderboardRankings();

      this.logger.log('Price tracking job completed successfully');
    } catch (error) {
      this.logger.error('Price tracking job failed:', error);
    }
  }

  /**
   * Manual trigger for price tracking (useful for testing)
   */
  async triggerPriceTracking(): Promise<void> {
    this.logger.log('Manually triggered price tracking...');
    await this.trackPrices();
  }

  /**
   * Get price history for a token
   */
  async getPriceHistory(
    tokenAddress: string,
    days: number = 7,
  ): Promise<PriceSnapshot[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.priceSnapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.tokenAddress = :address', { address: tokenAddress })
      .andWhere('snapshot.snapshotAt >= :startDate', { startDate })
      .orderBy('snapshot.snapshotAt', 'ASC')
      .getMany();
  }

  /**
   * Get latest price snapshot for a token
   */
  async getLatestPrice(tokenAddress: string): Promise<PriceSnapshot | null> {
    return this.priceSnapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.tokenAddress = :address', { address: tokenAddress })
      .orderBy('snapshot.snapshotAt', 'DESC')
      .getOne();
  }

  /**
   * Cleanup old price snapshots (older than 30 days)
   */
  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldSnapshots(): Promise<void> {
    this.logger.log('Starting price snapshot cleanup...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.priceSnapshotRepository
        .createQueryBuilder()
        .delete()
        .where('snapshotAt < :date', { date: thirtyDaysAgo })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} old price snapshots`);
    } catch (error) {
      this.logger.error('Failed to cleanup old snapshots:', error);
    }
  }

  /**
   * Get statistics about price tracking
   */
  async getTrackingStats(): Promise<{
    totalSnapshots: number;
    uniqueTokens: number;
    latestSnapshot: Date;
    oldestSnapshot: Date;
  }> {
    const [totalCount, uniqueTokensResult, latestResult, oldestResult] =
      await Promise.all([
        this.priceSnapshotRepository.count(),
        this.priceSnapshotRepository
          .createQueryBuilder()
          .select('COUNT(DISTINCT tokenAddress)', 'count')
          .getRawOne(),
        this.priceSnapshotRepository
          .createQueryBuilder()
          .select('MAX(snapshotAt)', 'date')
          .getRawOne(),
        this.priceSnapshotRepository
          .createQueryBuilder()
          .select('MIN(snapshotAt)', 'date')
          .getRawOne(),
      ]);

    return {
      totalSnapshots: totalCount,
      uniqueTokens: parseInt(uniqueTokensResult.count) || 0,
      latestSnapshot: latestResult.date,
      oldestSnapshot: oldestResult.date,
    };
  }
}
