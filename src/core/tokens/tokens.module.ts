import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokensController } from './tokens.controller';
import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from './services/simple-token.service';
import { ZapperModule } from '../zapper/zapper.module';
import { Token } from '../../models/Token/Token.model';
import { HistoricalDataManagerService } from '../signal/services/historical-data-manager.service';
import { CoinMarketCapService } from '../signal/services/providers/coinmarketcap.service';
import { CryptoCompareService } from '../signal/services/providers/cryptocompare.service';
import { CoinAPIService } from '../signal/services/providers/coinapi.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    ZapperModule,
  ],
  controllers: [TokensController],
  providers: [
    TokenPriceService,
    SimpleTokenService,
    HistoricalDataManagerService,
    CoinMarketCapService,
    CryptoCompareService,
    CoinAPIService,
  ],
  exports: [TokenPriceService, SimpleTokenService],
})
export class TokensModule {}
