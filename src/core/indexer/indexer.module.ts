import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainSignal } from '../../models/BlockchainSignal/BlockchainSignal.model';
import { Token } from '../../models/Token/Token.model';
import { IndexerClientService } from './indexer-client.service';
import { SignalSyncService } from './signal-sync.service';
import { FeedService } from '../feed/feed.service';
import { FeedController } from '../feed/feed.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlockchainSignal, Token]),
  ],
  providers: [
    IndexerClientService,
    SignalSyncService,
    FeedService,
  ],
  controllers: [FeedController],
  exports: [
    IndexerClientService,
    SignalSyncService,
    FeedService,
  ],
})
export class IndexerModule {}