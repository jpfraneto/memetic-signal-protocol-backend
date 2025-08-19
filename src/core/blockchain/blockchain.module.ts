import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlockchainService } from './blockchain.service';
import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';

@Module({
  imports: [TypeOrmModule.forFeature([Signal, User])],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
