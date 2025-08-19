import { Module } from '@nestjs/common';
import { ZapperService } from './services';

@Module({
  providers: [ZapperService],
  exports: [ZapperService],
})
export class ZapperModule {}