import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisCacheModule } from '../cache/cache.module';

@Module({
  imports: [RedisCacheModule],
  controllers: [HealthController],
})
export class HealthModule {}
