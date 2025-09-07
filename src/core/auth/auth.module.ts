// Dependencies
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AuthController } from './auth.controller';

// Services
import { AuthService } from './services';
import { MeEndpointService } from './services/me-endpoint.service';

// Models
import { User, Signal, Token, PriceSnapshot } from '../../models';
import { AdminGuard } from 'src/security/guards';

// Modules
import { UserModule } from '../user/user.module';
import { ZapperModule } from '../zapper/zapper.module';
import { SignalModule } from '../signal/signal.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Signal, Token, PriceSnapshot]),
    forwardRef(() => UserModule),
    ZapperModule,
    SignalModule,
    BlockchainModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MeEndpointService, AdminGuard],
  exports: [AuthService, MeEndpointService, AdminGuard],
})
export class AuthModule {}
