import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { SignalSchedulerService } from './signal-scheduler.service';
import { SessionDataService } from './services/session-data.service';
import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
import { TokenPriceService } from '../signal/services/token-price.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { TokensModule } from '../tokens/tokens.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ZapperService } from '../zapper/services/zapper.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signal, User, Token]),
    TokensModule,
    forwardRef(() => UserModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [SignalController],
  providers: [
    SignalService,
    SignalSchedulerService,
    SessionDataService,
    TokenPriceService,
    LeaderboardService,
    BlockchainService,
    ZapperService,
  ],
  exports: [SignalService, SignalSchedulerService, SessionDataService],
})
export class SignalModule {}
