import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { BankrService } from './bankr.service';
import { TrendingScheduler } from './trending.scheduler';
import { RedisCacheModule } from '../../cache/cache.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    RedisCacheModule,
    TokensModule,
  ],
  providers: [BankrService, TrendingScheduler],
  exports: [BankrService],
})
export class BankrModule {}
