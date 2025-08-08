import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CallService } from './call.service';

@Injectable()
export class BackgroundJobsService {
  private readonly logger = new Logger(BackgroundJobsService.name);

  constructor(private readonly callService: CallService) {}

  @Cron('*/5 * * * *') // Every 5 minutes
  async updateActivePrices(): Promise<void> {
    try {
      this.logger.log('Starting price update job for active calls');

      const activeCalls = await this.callService.getActiveCalls();

      if (activeCalls.length === 0) {
        this.logger.log('No active calls to update');
        return;
      }

      this.logger.log(`Updating prices for ${activeCalls.length} active calls`);
      await this.callService.updateCallPrices(activeCalls);

      this.logger.log('Price update job completed successfully');
    } catch (error) {
      this.logger.error('Failed to update active call prices:', error);
    }
  }

  @Cron('0 */12 * * *') // Every 12 hours
  async cleanupCaches(): Promise<void> {
    try {
      this.logger.log('Starting cache cleanup job');
      // Cache cleanup is handled internally by the services
      // This is a placeholder for more complex cleanup logic if needed
      this.logger.log('Cache cleanup job completed');
    } catch (error) {
      this.logger.error('Failed to cleanup caches:', error);
    }
  }

  // Manual trigger for price updates (useful for testing)
  async triggerPriceUpdate(): Promise<void> {
    await this.updateActivePrices();
  }
}
