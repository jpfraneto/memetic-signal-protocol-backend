import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { SignalSchedulerService } from './signal-scheduler.service';
import { Call } from '../../models/Call/Call.model';
import { User } from '../../models/User/User.model';
import { TokenPriceService } from '../call/services/token-price.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Module({
  imports: [TypeOrmModule.forFeature([Call, User])],
  controllers: [SignalController],
  providers: [
    SignalService,
    SignalSchedulerService,
    TokenPriceService,
    LeaderboardService,
    BlockchainService,
  ],
  exports: [SignalService, SignalSchedulerService],
})
export class SignalModule {}
