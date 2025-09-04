import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokensController } from './tokens.controller';
import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from './services/simple-token.service';
import { ZapperService } from '../zapper/services/zapper.service';
import { Token } from '../../models/Token/Token.model';

@Module({
  imports: [TypeOrmModule.forFeature([Token])],
  controllers: [TokensController],
  providers: [TokenPriceService, SimpleTokenService, ZapperService],
  exports: [TokenPriceService, SimpleTokenService],
})
export class TokensModule {}
