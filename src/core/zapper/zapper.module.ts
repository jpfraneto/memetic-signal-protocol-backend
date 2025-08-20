import { Module } from '@nestjs/common';
import { ZapperService, PortfolioService } from './services';

@Module({
  providers: [ZapperService, PortfolioService],
  exports: [ZapperService, PortfolioService],
})
export class ZapperModule {}
