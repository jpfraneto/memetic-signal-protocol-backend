import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlockchainService } from './blockchain.service';
import { Call } from '../../models/Call/Call.model';
import { User } from '../../models/User/User.model';

@Module({
  imports: [TypeOrmModule.forFeature([Call, User])],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}