// Dependencies
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AuthController } from './auth.controller';

// Services
import { AuthService } from './services';

// Models
import { User } from '../../models';
import { AdminGuard } from 'src/security/guards';

// Modules
import { UserModule } from '../user/user.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ZapperModule } from '../zapper/zapper.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => UserModule),
    BlockchainModule,
    ZapperModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
