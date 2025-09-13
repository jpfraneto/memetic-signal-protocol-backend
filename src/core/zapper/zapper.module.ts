import { Module } from '@nestjs/common';
import { ZapperService, PortfolioService } from './services';
import { RedisCacheModule } from '../../cache/cache.module';

@Module({
  imports: [RedisCacheModule],
  providers: [ZapperService, PortfolioService],
  exports: [ZapperService, PortfolioService],
})
export class ZapperModule {}
