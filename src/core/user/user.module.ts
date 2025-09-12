// Dependencies
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { UserController } from './user.controller';

// Services
import { UserService } from './services';

// Models
import { User, Signal } from '../../models';

// Modules
import { AuthModule } from '../auth/auth.module';
import { RedisCacheModule } from '../../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Signal]),
    forwardRef(() => AuthModule),
    RedisCacheModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
