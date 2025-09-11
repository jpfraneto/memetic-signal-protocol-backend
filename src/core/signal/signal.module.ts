import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { SignalSchedulerService } from './signal-scheduler.service';
import { SignalResolutionService } from './signal-resolution.service';
import { SessionDataService } from './services/session-data.service';
import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { Token } from '../../models/Token/Token.model';
// Import Ponder entities
import { FidStats } from '../../models/FidStats/FidStats.model';
import { WalletAuthorization } from '../../models/WalletAuthorization/WalletAuthorization.model';
import { DailySignalCount } from '../../models/DailySignalCount/DailySignalCount.model';
import { FidBan } from '../../models/FidBan/FidBan.model';
import { WalletBan } from '../../models/WalletBan/WalletBan.model';
import { TokenPriceService } from '../signal/services/token-price.service';
import { CoinMarketCapService } from './services/providers/coinmarketcap.service';
import { CryptoCompareService } from './services/providers/cryptocompare.service';
import { CoinAPIService } from './services/providers/coinapi.service';
import { HistoricalDataManagerService } from './services/historical-data-manager.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { TokensModule } from '../tokens/tokens.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ZapperService } from '../zapper/services/zapper.service';
import { NotificationModule } from '../notification/notification.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { MFSModule } from '../mfs/mfs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Signal,
      User,
      Token,
      FidStats,
      WalletAuthorization,
      DailySignalCount,
      FidBan,
      WalletBan,
    ]),
    TokensModule,
    forwardRef(() => UserModule),
    forwardRef(() => AuthModule),
    NotificationModule,
    BlockchainModule,
    MFSModule,
  ],
  controllers: [SignalController],
  providers: [
    SignalService,
    SignalSchedulerService,
    SignalResolutionService,
    SessionDataService,
    TokenPriceService,
    HistoricalDataManagerService,
    CoinMarketCapService,
    CryptoCompareService,
    CoinAPIService,
    LeaderboardService,
    ZapperService,
  ],
  exports: [
    SignalService,
    SignalSchedulerService,
    SignalResolutionService,
    SessionDataService,
  ],
})
export class SignalModule {}
