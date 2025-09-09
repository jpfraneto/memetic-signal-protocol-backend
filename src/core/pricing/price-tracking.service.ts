import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { TokenPriceService } from '../signal/services/token-price.service';

@Injectable()
export class PriceTrackingService {
  private readonly logger = new Logger(PriceTrackingService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tokenPriceService: TokenPriceService,
    private dataSource: DataSource,
  ) {}

  /**
   * Signal resolution job - runs every 30 minutes
   * Find expired signals and resolve them with MFS calculation
   */
  @Cron('0 */30 * * * *')
  async resolveExpiredSignals(): Promise<void> {
    this.logger.log('Starting expired signal resolution...');

    try {
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

      // Find signals that are expired but not resolved
      const expiredSignals = await this.signalRepository
        .createQueryBuilder('signal')
        .where('signal.resolved = :resolved', { resolved: false })
        .andWhere('signal.expires_at < :currentTimestamp', {
          currentTimestamp: currentTimestamp.toString(),
        })
        .getMany();

      this.logger.log(
        `Found ${expiredSignals.length} expired signals to resolve`,
      );

      if (expiredSignals.length === 0) {
        return;
      }

      // Process each expired signal
      for (const signal of expiredSignals) {
        await this.resolveSignal(signal);
      }

      this.logger.log('Signal resolution completed successfully');
    } catch (error) {
      this.logger.error('Signal resolution failed:', error);
    }
  }

  /**
   * Resolve a single signal by fetching price at expiry and calculating MFS
   */
  private async resolveSignal(signal: Signal): Promise<void> {
    try {
      // Double check expiry conditions
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
      const signalExpiryTime =
        BigInt(signal.timestamp) + BigInt(signal.duration_days * 86400);

      if (
        signal.expires_at >= currentTimestamp ||
        signalExpiryTime >= currentTimestamp
      ) {
        this.logger.warn(
          `Signal ${signal.signal_id} not yet expired, skipping`,
        );
        return;
      }

      // Fetch token price at expiry moment
      const expiryDate = new Date(Number(signal.expires_at) * 1000);
      const tokenInfo = await this.tokenPriceService.getTokenInfo(
        signal.ca,
        expiryDate,
      );

      // Handle case where no price data is available - set MFS to 0
      if (!tokenInfo || tokenInfo.marketCap === 0) {
        this.logger.warn(
          `No market cap data available for signal ${signal.signal_id} at expiry, setting MFS to 0`,
        );

        // Update signal as resolved with 0 MFS delta
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Signal, signal.signal_id, {
            resolved: true,
            mfs_delta: 0,
          });
          // No need to update user MFS since delta is 0
        });

        this.logger.log(
          `Resolved signal ${signal.signal_id} for FID ${signal.fid} with MFS delta: 0 (no price data)`,
        );
        return;
      }

      const exitMarketCap = Number(tokenInfo.marketCap);
      const entryMarketCap = signal.entry_market_cap;

      // Handle division by zero case
      if (entryMarketCap === 0) {
        this.logger.warn(
          `Entry market cap is 0 for signal ${signal.signal_id}, setting MFS to 0`,
        );

        await this.dataSource.transaction(async (manager) => {
          await manager.update(Signal, signal.signal_id, {
            resolved: true,
            mfs_delta: 0,
          });
        });

        this.logger.log(
          `Resolved signal ${signal.signal_id} for FID ${signal.fid} with MFS delta: 0 (entry market cap is 0)`,
        );
        return;
      }

      // Calculate MFS using the smart contract formula
      const percentageChange = Math.abs(
        (exitMarketCap - entryMarketCap) / entryMarketCap,
      );
      const wasCorrect =
        (signal.direction && exitMarketCap > entryMarketCap) ||
        (!signal.direction && exitMarketCap < entryMarketCap);
      const correctnessMultiplier = wasCorrect ? 1 : -1;
      const lambda = 0.088;
      const timeDecay = Math.exp(-lambda * (signal.duration_days - 1));

      const mfsDelta = Math.floor(
        percentageChange * 1000 * correctnessMultiplier * timeDecay,
      );

      // Update signal and user in transaction
      await this.dataSource.transaction(async (manager) => {
        // Update signal
        await manager.update(Signal, signal.signal_id, {
          resolved: true,
          mfs_delta: mfsDelta,
        });

        // Update user's MFS score
        await manager
          .createQueryBuilder()
          .update(User)
          .set({ mfs_score: () => `mfs_score + ${mfsDelta}` })
          .where('fid = :fid', { fid: signal.fid })
          .execute();
      });

      this.logger.log(
        `Resolved signal ${signal.signal_id} for FID ${signal.fid} with MFS delta: ${mfsDelta}`,
      );
    } catch (error) {
      this.logger.error(`Failed to resolve signal ${signal.signal_id}:`, error);
    }
  }

  /**
   * Manual trigger for signal resolution (useful for testing)
   */
  async triggerSignalResolution(): Promise<void> {
    this.logger.log('Manually triggered signal resolution...');
    await this.resolveExpiredSignals();
  }

  /**
   * Get resolution statistics
   */
  async getResolutionStats(): Promise<{
    totalSignals: number;
    resolvedSignals: number;
    pendingSignals: number;
    expiredButUnresolved: number;
  }> {
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const [
      totalSignals,
      resolvedSignals,
      pendingSignals,
      expiredButUnresolved,
    ] = await Promise.all([
      this.signalRepository.count(),
      this.signalRepository.count({ where: { resolved: true } }),
      this.signalRepository
        .createQueryBuilder('signal')
        .where('signal.resolved = :resolved', { resolved: false })
        .andWhere('signal.expires_at > :currentTimestamp', {
          currentTimestamp: currentTimestamp.toString(),
        })
        .getCount(),
      this.signalRepository
        .createQueryBuilder('signal')
        .where('signal.resolved = :resolved', { resolved: false })
        .andWhere('signal.expires_at < :currentTimestamp', {
          currentTimestamp: currentTimestamp.toString(),
        })
        .getCount(),
    ]);

    return {
      totalSignals,
      resolvedSignals,
      pendingSignals,
      expiredButUnresolved,
    };
  }
}
