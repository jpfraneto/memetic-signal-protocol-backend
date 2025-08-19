import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Signal } from '../../../models/Signal/Signal.model';
import { User } from '../../../models/User/User.model';
import { Token } from '../../../models/Token/Token.model';
import { BlockchainService } from '../../blockchain/blockchain.service';
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
  private readonly SESSION_DURATION = 88 * 1000; // 88 seconds

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    private blockchainService: BlockchainService,
    private zapperService: ZapperService,
  ) {}

  async prepareSessionStartData(
    fid: number,
    transactionHash?: string,
  ): Promise<SessionStartData> {
    this.logger.log(
      `Preparing session start data for FID ${fid}, TX: ${transactionHash}`,
    );

    const sessionId = `session-${Date.now()}-${fid}`;
    const startTime = Date.now();
    const expiresAt = startTime + this.SESSION_DURATION;
    const timeRemaining = this.SESSION_DURATION;

    // Fetch all required data in parallel
    const [
      lastTwentySignals,
      userLastEightTokens,
      lastTwentySignalers,
      trendingTokens,
      user,
    ] = await Promise.all([
      this.getLastTwentySignalsFromFeed(),
      this.getUserLastEightTokens(fid),
      this.getLastTwentySignalers(),
      this.zapperService.getTrendingTokens(fid),
      this.userRepository.findOne({ where: { fid } }),
    ]);

    return {
      sessionId,
      startTime,
      expiresAt,
      timeRemaining,
      lastTwentySignals,
      userLastEightTokens,
      lastTwentySignalers,
      trendingTokens,
      defaultTokens: user?.defaultTokens || null,
    };
  }

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
        signalId: signal.signalId,
        fid: signal.fid,
        username: signal.user?.username || 'Unknown',
        displayName:
          signal.user?.displayName || signal.user?.username || 'Unknown',
        pfpUrl: signal.user?.pfpUrl || '',
        isVerified: signal.user?.isVerified || false,
        tokens: signal.tokens,
        timestamp: signal.timestamp,
        status: signal.status,
        expiresAt: signal.expiresAt,
        correctPredictions: signal.correctPredictions,
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
        if (signal.tokens && Array.isArray(signal.tokens)) {
          for (const token of signal.tokens) {
            if (!uniqueTokens.has(token.ca) && uniqueTokens.size < 8) {
              // Try to get current price and market cap from Token table
              const tokenData = await this.tokenRepository.findOne({
                where: { address: token.ca },
              });

              uniqueTokens.set(token.ca, {
                ca: token.ca,
                ticker: token.ticker,
                imageUrl: tokenData?.image || '',
                priceInUSDC: Number(tokenData?.price) || 0,
                mcInUSDC: Number(tokenData?.marketCap) || 0,
              });
            }

            if (uniqueTokens.size >= 8) break;
          }
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
      recentSignalers.sort((a, b) => b.timestamp - a.timestamp);

      return recentSignalers.map((signal) => ({
        fid: signal.user?.fid || signal.fid,
        username: signal.user?.username || 'Unknown',
        displayName:
          signal.user?.displayName || signal.user?.username || 'Unknown',
        pfpUrl: signal.user?.pfpUrl || '',
        isVerified: signal.user?.isVerified || false,
        mfsScore: Number(signal.user?.mfsScore || 0),
        winRate: Number(signal.user?.winRate || 0),
        settledSignals: signal.user?.settledSignals || 0,
        totalSignals: signal.user?.totalSignals || 0,
        followerCount: signal.user?.followerCount || 0,
        followingCount: signal.user?.followingCount || 0,
        lastSignalTimestamp: signal.timestamp,
      }));
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
      // Use the blockchain service to verify the transaction contains a SignalCreated event
      const isValidSessionStart =
        await this.blockchainService.verifySessionStartTransaction(
          transactionHash,
        );

      if (isValidSessionStart) {
        this.logger.log(
          `Session start transaction verified: ${transactionHash}`,
        );
        return true;
      } else {
        this.logger.warn(
          `Invalid session start transaction: ${transactionHash}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error verifying transaction event ${transactionHash}:`,
        error,
      );
      return false;
    }
  }
}
