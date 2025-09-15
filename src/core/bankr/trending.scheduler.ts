import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheService } from '../../cache/cache.service';
import { BankrService } from './bankr.service';
import { DEFAULT_TRENDING_ADDRESSES } from './default-trending';
import { SimpleTokenService } from '../tokens/services/simple-token.service';

@Injectable()
export class TrendingScheduler implements OnModuleInit {
  private readonly logger = new Logger(TrendingScheduler.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly bankrService: BankrService,
    private readonly simpleTokenService: SimpleTokenService,
  ) {}

  // Run at the top of every hour
  @Cron(CronExpression.EVERY_HOUR)
  async refreshTrendingTokens(): Promise<void> {
    this.logger.log('[CRON] Refreshing trending tokens (Bankr)...');
    try {
      // Request 8 addresses; Bankr returns a comma-separated string in job.response
      const addresses = await this.bankrService.askForFeaturedAddresses(8);

      // Normalize, dedupe and validate
      const regex = /^0x[a-f0-9]{40}$/;
      const normalized = Array.from(
        new Set(addresses.map((a) => a.toLowerCase())),
      )
        .filter((a) => regex.test(a))
        .slice(0, 8);

      // Warm database entries for each address (DB-first, Zapper if missing)
      for (const ca of normalized) {
        try {
          await this.simpleTokenService.getTokenInfo(ca);
        } catch {}
      }

      await this.cacheService.setTrendingTokens(normalized);
      this.logger.log(
        `[CRON] Trending tokens updated in cache: ${addresses.length}`,
      );
    } catch (error) {
      this.logger.error(
        '[CRON] Failed to refresh trending tokens from Bankr:',
        error,
      );
      // Fallback to defaults
      await this.cacheService.setTrendingTokens(DEFAULT_TRENDING_ADDRESSES);
      this.logger.warn('[CRON] Default trending tokens loaded into cache');
    }
  }

  // Also run once on server start
  async onModuleInit(): Promise<void> {
    // this.logger.log('[CRON] Initial trending tokens refresh on startup...');
    // await this.refreshTrendingTokens();
  }
}
