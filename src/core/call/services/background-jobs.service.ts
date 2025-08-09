import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CallService } from './call.service';

@Injectable()
export class BackgroundJobsService {
  private readonly logger = new Logger(BackgroundJobsService.name);

  constructor(private readonly callService: CallService) {}

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
}
