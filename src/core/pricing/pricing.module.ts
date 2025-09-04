import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { PriceTrackingService } from './price-tracking.service';
import { Signal } from '../../models/Signal/Signal.model';
import { PriceSnapshot } from '../../models/PriceSnapshot/PriceSnapshot.model';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
import { ScoringService } from '../scoring/scoring.service';
import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from '../tokens/services/simple-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signal, PriceSnapshot, User, Token]),
    ScheduleModule.forRoot(),
  ],
  providers: [
    PriceTrackingService,
    ScoringService,
    TokenPriceService,
    SimpleTokenService,
  ],
  exports: [PriceTrackingService, ScoringService],
})
export class PricingModule {}