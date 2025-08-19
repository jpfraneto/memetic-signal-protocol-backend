import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokensController } from './tokens.controller';
import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from './services/simple-token.service';
import { MarketCapitalService } from './services/market-capital.service';
import { Token } from '../../models/Token/Token.model';

@Module({
  imports: [TypeOrmModule.forFeature([Token])],
  controllers: [TokensController],
  providers: [TokenPriceService, SimpleTokenService, MarketCapitalService],
  exports: [TokenPriceService, SimpleTokenService, MarketCapitalService],
})
export class TokensModule {}
