import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainSignal } from '../../models/BlockchainSignal/BlockchainSignal.model';
import { Token } from '../../models/Token/Token.model';

export interface EnrichedSignal {
  id: string;
  signalId: string;
  fid: string;
  direction: number;
  timeframe: number;
  expiresAt: string;
  isSubscriber: boolean;
  isResolved: boolean;
  won: boolean | null;
  createdAt: Date;
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    image?: string;
    image_small?: string;
    image_thumb?: string;
    market_cap_rank?: number;
    market_data?: {
      current_price: number;
      ath: number;
      ath_change_percentage: number;
      ath_date: string;
      market_cap: number;
      price_change_24h: number;
    };
  } | null;
}

export interface FeedResponse {
  signals: EnrichedSignal[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FeedFilters {
  page?: number;
  limit?: number;
  fid?: string;
  direction?: number;
  isResolved?: boolean;
  tokenAddress?: string;
  minTimeframe?: number;
  maxTimeframe?: number;
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(BlockchainSignal)
    private blockchainSignalRepository: Repository<BlockchainSignal>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
  ) {}

  async getEnrichedFeed(filters: FeedFilters = {}): Promise<FeedResponse> {
    const {
      page = 1,
      limit = 20,
      fid,
      direction,
      isResolved,
      tokenAddress,
      minTimeframe,
      maxTimeframe,
    } = filters;

    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions: any = {};
    
    if (fid) {
      whereConditions.fid = fid;
    }
    
    if (direction !== undefined) {
      whereConditions.direction = direction;
    }
    
    if (isResolved !== undefined) {
      whereConditions.isResolved = isResolved;
    }
    
    if (tokenAddress) {
      whereConditions.ca = tokenAddress.toLowerCase();
    }

    // Handle timeframe range
    if (minTimeframe !== undefined || maxTimeframe !== undefined) {
      whereConditions.timeframe = {};
      if (minTimeframe !== undefined) {
        whereConditions.timeframe.gte = minTimeframe;
      }
      if (maxTimeframe !== undefined) {
        whereConditions.timeframe.lte = maxTimeframe;
      }
    }

    try {
      const [signals, total] = await Promise.all([
        this.blockchainSignalRepository.find({
          where: whereConditions,
          relations: ['token'],
          order: { createdAt: 'DESC' },
          take: limit,
          skip: offset,
        }),
        this.blockchainSignalRepository.count({ where: whereConditions }),
      ]);

      const enrichedSignals = signals.map(signal => this.mapToEnrichedSignal(signal));

      return {
        signals: enrichedSignals,
        total,
        page,
        limit,
        hasMore: offset + signals.length < total,
      };
    } catch (error) {
      this.logger.error('Failed to fetch enriched feed:', error);
      throw error;
    }
  }

  async getSignalsByToken(tokenAddress: string, limit = 10): Promise<EnrichedSignal[]> {
    try {
      const signals = await this.blockchainSignalRepository.find({
        where: { ca: tokenAddress.toLowerCase() },
        relations: ['token'],
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return signals.map(signal => this.mapToEnrichedSignal(signal));
    } catch (error) {
      this.logger.error(`Failed to fetch signals for token ${tokenAddress}:`, error);
      return [];
    }
  }

  async getSignalsByFid(fid: string, limit = 20): Promise<EnrichedSignal[]> {
    try {
      const signals = await this.blockchainSignalRepository.find({
        where: { fid },
        relations: ['token'],
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return signals.map(signal => this.mapToEnrichedSignal(signal));
    } catch (error) {
      this.logger.error(`Failed to fetch signals for FID ${fid}:`, error);
      return [];
    }
  }

  async getActiveSignals(limit = 50): Promise<EnrichedSignal[]> {
    try {
      const signals = await this.blockchainSignalRepository.find({
        where: { isResolved: false },
        relations: ['token'],
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return signals.map(signal => this.mapToEnrichedSignal(signal));
    } catch (error) {
      this.logger.error('Failed to fetch active signals:', error);
      return [];
    }
  }

  async getRecentSignals(limit = 20): Promise<EnrichedSignal[]> {
    try {
      const signals = await this.blockchainSignalRepository.find({
        relations: ['token'],
        order: { createdAt: 'DESC' },
        take: limit,
      });

      return signals.map(signal => this.mapToEnrichedSignal(signal));
    } catch (error) {
      this.logger.error('Failed to fetch recent signals:', error);
      return [];
    }
  }

  async getSignalById(signalId: string): Promise<EnrichedSignal | null> {
    try {
      const signal = await this.blockchainSignalRepository.findOne({
        where: { signalId },
        relations: ['token'],
      });

      return signal ? this.mapToEnrichedSignal(signal) : null;
    } catch (error) {
      this.logger.error(`Failed to fetch signal ${signalId}:`, error);
      return null;
    }
  }

  async getFeedStats(): Promise<{
    totalSignals: number;
    activeSignals: number;
    resolvedSignals: number;
    uniqueTokens: number;
    uniqueSignalers: number;
  }> {
    try {
      const [
        totalSignals,
        activeSignals,
        resolvedSignals,
        uniqueTokensResult,
        uniqueSignalersResult,
      ] = await Promise.all([
        this.blockchainSignalRepository.count(),
        this.blockchainSignalRepository.count({ where: { isResolved: false } }),
        this.blockchainSignalRepository.count({ where: { isResolved: true } }),
        this.blockchainSignalRepository
          .createQueryBuilder('signal')
          .select('COUNT(DISTINCT signal.ca)', 'count')
          .getRawOne(),
        this.blockchainSignalRepository
          .createQueryBuilder('signal')
          .select('COUNT(DISTINCT signal.fid)', 'count')
          .getRawOne(),
      ]);

      return {
        totalSignals,
        activeSignals,
        resolvedSignals,
        uniqueTokens: parseInt(uniqueTokensResult.count),
        uniqueSignalers: parseInt(uniqueSignalersResult.count),
      };
    } catch (error) {
      this.logger.error('Failed to fetch feed stats:', error);
      throw error;
    }
  }

  private mapToEnrichedSignal(signal: BlockchainSignal): EnrichedSignal {
    return {
      id: signal.id,
      signalId: signal.signalId,
      fid: signal.fid,
      direction: signal.direction,
      timeframe: signal.timeframe,
      expiresAt: signal.expiresAt,
      isSubscriber: signal.isSubscriber,
      isResolved: signal.isResolved,
      won: signal.won,
      createdAt: signal.createdAt,
      token: signal.token ? {
        address: signal.token.address,
        name: signal.token.name,
        symbol: signal.token.symbol,
        decimals: signal.token.decimals,
        image: signal.token.image,
        image_small: signal.token.image_small,
        image_thumb: signal.token.image_thumb,
        market_cap_rank: signal.token.market_cap_rank,
        market_data: signal.token.market_data,
      } : null,
    };
  }
}