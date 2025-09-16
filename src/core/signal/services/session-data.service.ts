import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Signal } from '../../../models/Signal/Signal.model';
import { User } from '../../../models/User/User.model';
import { Token } from '../../../models/Token/Token.model';
import { ZapperService } from 'src/core/zapper/services/zapper.service';

export interface SessionStartData {
  sessionId: string;
  startTime: number;
  expiresAt: number;
  timeRemaining: number;
  lastTwentySignals: any[];
  userLastEightTokens: any[];
  lastTwentySignalers: any[];
  trendingTokens: any[];
  defaultTokens?: any[] | null;
}

@Injectable()
export class SessionDataService {
  private readonly logger = new Logger(SessionDataService.name);

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    // private blockchainService: BlockchainService, // Temporarily disabled
    private zapperService: ZapperService,
  ) {}

  private async getLastTwentySignalsFromFeed(): Promise<any[]> {
    try {
      // Get the most recent 20 signals from the feed with user data
      const signals = await this.signalRepository
        .createQueryBuilder('signal')
        .leftJoinAndSelect('signal.user', 'user')
        .orderBy('signal.timestamp', 'DESC')
        .limit(20)
        .getMany();

      return signals.map((signal) => ({
        signalId: signal.transaction_hash, // Updated to use new primary key
        fid: signal.fid,
        username: signal.user?.username || 'Unknown',
        pfp_url: signal.user?.pfp_url || '',
        isVerified: signal.user?.is_verified || false,
        ca: signal.ca,
        timestamp: signal.timestamp,
        expires_at: signal.expires_at, // Already a Date object
      }));
    } catch (error) {
      this.logger.error('Error fetching last 20 signals from feed:', error);
      return [];
    }
  }

  private async getUserLastEightTokens(fid: number): Promise<any[]> {
    try {
      // Get the user's last 8 unique tokens they've traded (from their signals)
      const userSignals = await this.signalRepository
        .createQueryBuilder('signal')
        .where('signal.fid = :fid', { fid })
        .orderBy('signal.timestamp', 'DESC')
        .getMany();

      const uniqueTokens = new Map();

      for (const signal of userSignals) {
        if (
          signal.ca &&
          !uniqueTokens.has(signal.ca) &&
          uniqueTokens.size < 8
        ) {
          // Try to get current price and market cap from Token table
          const tokenData = await this.tokenRepository.findOne({
            where: { ca: signal.ca },
          });

          // Market data no longer available in simplified schema
          const marketData: any = {};

          uniqueTokens.set(signal.ca, {
            ca: signal.ca,
            ticker: '', // Symbol no longer in schema
            imageUrl: tokenData?.image || '',
            priceInUSDC: Number(marketData?.current_price) || 0,
            mcInUSDC: Number(marketData?.market_cap) || 0,
          });
        }

        if (uniqueTokens.size >= 8) break;
      }

      return Array.from(uniqueTokens.values());
    } catch (error) {
      this.logger.error(`Error fetching last 8 tokens for user ${fid}:`, error);
      return [];
    }
  }

  private async getLastTwentySignalers(): Promise<any[]> {
    try {
      // Get the last 20 unique users who created signals, with their user data
      const recentSignalers = await this.signalRepository
        .createQueryBuilder('signal')
        .leftJoinAndSelect('signal.user', 'user')
        .distinctOn(['signal.fid'])
        .orderBy('signal.fid')
        .addOrderBy('signal.timestamp', 'DESC')
        .limit(20)
        .getMany();

      // Sort by most recent activity
      recentSignalers.sort(
        (a, b) =>
          new Date(Number(b.timestamp) * 1000).getTime() -
          new Date(Number(a.timestamp) * 1000).getTime(),
      );

      return recentSignalers;
    } catch (error) {
      this.logger.error('Error fetching last 20 signalers:', error);
      return [];
    }
  }

  async waitForTransactionEvent(
    transactionHash: string,
    timeoutMs: number = 30000,
  ): Promise<boolean> {
    this.logger.log(`Verifying transaction event: ${transactionHash}`);

    try {
      // Blockchain service temporarily disabled - return true for now
      this.logger.log(
        `Transaction verification temporarily disabled: ${transactionHash}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error verifying transaction event ${transactionHash}:`,
        error,
      );
      return false;
    }
  }
}
