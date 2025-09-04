import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../../models/Token/Token.model';
import { Signal } from 'src/models/Signal/Signal.model';
import { SignalStatus } from 'src/models/Signal/Signal.types';

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
  created_at: Date;
  token: {
    ca: string;
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
  signals: Signal[];
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
  ca?: string;
  minTimeframe?: number;
  maxTimeframe?: number;
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
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
      ca,
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

    if (ca) {
      whereConditions.ca = ca.toLowerCase();
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
        this.signalRepository.find({
          where: whereConditions,
          relations: ['token'],
          order: { timestamp: 'DESC' },
          take: limit,
          skip: offset,
        }),
        this.signalRepository.count({ where: whereConditions }),
      ]);

      return {
        signals: signals,
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

  async getSignalsByToken(ca: string, limit = 10): Promise<Signal[]> {
    try {
      const signals = await this.signalRepository.find({
        where: { ca: ca.toLowerCase() },
        relations: ['token'],
        order: { timestamp: 'DESC' },
        take: limit,
      });

      return signals;
    } catch (error) {
      this.logger.error(`Failed to fetch signals for token ${ca}:`, error);
      return [];
    }
  }

  async getSignalsByFid(fid: string, limit = 20): Promise<Signal[]> {
    try {
      const signals = await this.signalRepository.find({
        where: { fid: parseInt(fid) },
        relations: ['token'],
        order: { timestamp: 'DESC' },
        take: limit,
      });

      return signals;
    } catch (error) {
      this.logger.error(`Failed to fetch signals for FID ${fid}:`, error);
      return [];
    }
  }

  async getRecentSignals(limit = 20): Promise<Signal[]> {
    try {
      const signals = await this.signalRepository.find({
        relations: ['token'],
        order: { timestamp: 'DESC' },
        take: limit,
      });

      return signals;
    } catch (error) {
      this.logger.error('Failed to fetch recent signals:', error);
      return [];
    }
  }

  async getSignalById(transaction_hash: string): Promise<Signal | null> {
    try {
      const signal = await this.signalRepository.findOne({
        where: { transaction_hash: transaction_hash },
        relations: ['token'],
      });

      return signal;
    } catch (error) {
      this.logger.error(`Failed to fetch signal ${transaction_hash}:`, error);
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
        this.signalRepository.count(),
        this.signalRepository.count({ where: { status: SignalStatus.ACTIVE } }),
        this.signalRepository.count({ where: { status: SignalStatus.WON } }),
        this.signalRepository.count({ where: { status: SignalStatus.LOST } }),
        this.signalRepository
          .createQueryBuilder('signal')
          .select('COUNT(DISTINCT signal.ca)', 'count')
          .getRawOne(),
        this.signalRepository
          .createQueryBuilder('signal')
          .select('COUNT(DISTINCT signal.fid)', 'count')
          .getRawOne(),
      ]);

      return {
        totalSignals,
        activeSignals,
        resolvedSignals,
        uniqueTokens: parseInt(uniqueTokensResult.toString()),
        uniqueSignalers: parseInt(uniqueSignalersResult.toString()),
      };
    } catch (error) {
      this.logger.error('Failed to fetch feed stats:', error);
      throw error;
    }
  }
}
