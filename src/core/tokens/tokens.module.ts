import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokenPriceService } from '../call/services/token-price.service';

@Module({
  controllers: [TokensController],
  providers: [TokenPriceService],
  exports: [TokenPriceService],
})
export class TokensModule {}
