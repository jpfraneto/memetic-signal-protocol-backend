import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlockchainSignal } from '../../models/BlockchainSignal/BlockchainSignal.model';
import { Token } from '../../models/Token/Token.model';
import { IndexerClientService, SignalCreatedEvent, SignalResolvedEvent } from './indexer-client.service';

@Injectable()
export class SignalSyncService {
  private readonly logger = new Logger(SignalSyncService.name);
  private lastSyncTimestamp: string | null = null;

  constructor(
    @InjectRepository(BlockchainSignal)
    private blockchainSignalRepository: Repository<BlockchainSignal>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    private indexerClient: IndexerClientService,
  ) {
    this.initializeLastSyncTimestamp();
  }

  private async initializeLastSyncTimestamp(): Promise<void> {
    const lastSignal = await this.blockchainSignalRepository.findOne({
      where: {},
      order: { blockTimestamp: 'DESC' },
    });

    if (lastSignal?.blockTimestamp) {
      this.lastSyncTimestamp = lastSignal.blockTimestamp;
      this.logger.log(`Initialized last sync timestamp: ${this.lastSyncTimestamp}`);
    } else {
      this.logger.log('No previous signals found, will sync from the beginning');
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncSignals(): Promise<void> {
    this.logger.log('Starting signal sync...');

    try {
      await Promise.all([
        this.syncSignalCreatedEvents(),
        this.syncSignalResolvedEvents(),
      ]);

      this.logger.log('Signal sync completed successfully');
    } catch (error) {
      this.logger.error('Signal sync failed:', error);
    }
  }

  private async syncSignalCreatedEvents(): Promise<void> {
    const events = await this.indexerClient.getRecentSignalCreatedEvents(
      this.lastSyncTimestamp || undefined
    );

    if (events.length === 0) {
      this.logger.log('No new signal created events to sync');
      return;
    }

    for (const event of events) {
      await this.processSignalCreatedEvent(event);
    }

    // Update last sync timestamp to the latest event
    if (events.length > 0) {
      const latestTimestamp = Math.max(
        ...events.map(e => parseInt(e.block_timestamp || e.expiresAt))
      ).toString();
      
      if (!this.lastSyncTimestamp || latestTimestamp > this.lastSyncTimestamp) {
        this.lastSyncTimestamp = latestTimestamp;
      }
    }

    this.logger.log(`Synced ${events.length} signal created events`);
  }

  private async syncSignalResolvedEvents(): Promise<void> {
    const events = await this.indexerClient.getRecentSignalResolvedEvents(
      this.lastSyncTimestamp || undefined
    );

    if (events.length === 0) {
      this.logger.log('No new signal resolved events to sync');
      return;
    }

    for (const event of events) {
      await this.processSignalResolvedEvent(event);
    }

    this.logger.log(`Synced ${events.length} signal resolved events`);
  }

  private async processSignalCreatedEvent(event: SignalCreatedEvent): Promise<void> {
    try {
      // Check if signal already exists
      const existingSignal = await this.blockchainSignalRepository.findOne({
        where: { id: event.id },
      });

      if (existingSignal) {
        this.logger.debug(`Signal ${event.id} already exists, skipping`);
        return;
      }

      // Try to find associated token metadata
      let token: Token | null = null;
      try {
        token = await this.tokenRepository.findOne({
          where: { address: event.ca.toLowerCase() },
        });
      } catch (error) {
        this.logger.debug(`Token ${event.ca} not found in database`);
      }

      // Create new blockchain signal
      const blockchainSignal = this.blockchainSignalRepository.create({
        id: event.id,
        signalId: event.signalId,
        fid: event.fid,
        ca: event.ca.toLowerCase(),
        direction: parseInt(event.direction),
        timeframe: parseInt(event.timeframe),
        expiresAt: event.expiresAt,
        isSubscriber: event.isSubscriber,
        isResolved: false,
        won: null,
        blockTimestamp: event.block_timestamp || event.expiresAt,
        token,
        syncedAt: new Date(),
      });

      await this.blockchainSignalRepository.save(blockchainSignal);
      
      this.logger.log(`Created blockchain signal: ${event.id} for FID ${event.fid} on token ${event.ca}`);
    } catch (error) {
      this.logger.error(`Failed to process signal created event ${event.id}:`, error);
    }
  }

  private async processSignalResolvedEvent(event: SignalResolvedEvent): Promise<void> {
    try {
      // Find the signal by signalId
      const signal = await this.blockchainSignalRepository.findOne({
        where: { signalId: event.signalId },
      });

      if (!signal) {
        this.logger.warn(`Signal ${event.signalId} not found for resolution`);
        return;
      }

      // Update resolution status
      signal.isResolved = true;
      signal.won = event.won;
      signal.syncedAt = new Date();

      await this.blockchainSignalRepository.save(signal);
      
      this.logger.log(`Resolved signal: ${event.signalId} - Won: ${event.won}`);
    } catch (error) {
      this.logger.error(`Failed to process signal resolved event ${event.id}:`, error);
    }
  }

  async forceSync(): Promise<void> {
    this.logger.log('Starting forced sync...');
    await this.syncSignals();
  }

  async getSignalStats(): Promise<{
    total: number;
    resolved: number;
    active: number;
    lastSyncTimestamp: string | null;
  }> {
    const [total, resolved] = await Promise.all([
      this.blockchainSignalRepository.count(),
      this.blockchainSignalRepository.count({ where: { isResolved: true } }),
    ]);

    return {
      total,
      resolved,
      active: total - resolved,
      lastSyncTimestamp: this.lastSyncTimestamp,
    };
  }
}