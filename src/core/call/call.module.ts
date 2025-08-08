import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CallController } from './call.controller';
import {
  CallService,
  FarcasterUserService,
  TokenPriceService,
  BackgroundJobsService,
} from './services';
import { Call, User } from '../../models';
import { UserService } from '../user/services/user.service';

@Module({
  imports: [TypeOrmModule.forFeature([Call, User])],
  controllers: [CallController],
  providers: [
    CallService,
    FarcasterUserService,
    TokenPriceService,
    BackgroundJobsService,
    UserService,
  ],
  exports: [
    CallService,
    FarcasterUserService,
    TokenPriceService,
    BackgroundJobsService,
  ],
})
export class CallModule {}
