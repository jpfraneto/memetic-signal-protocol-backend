import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';

import { Signal } from '../../models/Signal/Signal.model';
import { User } from '../../models/User/User.model';
import { UserService } from '../user/services/user.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import {
  SignalResponseDto,
  SignalsFeedResponseDto,
  SessionStatusDto,
} from './dto/signal-response.dto';
import { GetSignalsFeedDto } from './dto/get-signals-feed.dto';
import { UserStateOnTheSystemEnum } from '../../models/User/User.types';
import {
  SessionDataService,
  SessionStartData,
} from './services/session-data.service';

interface ActiveSession {
  fid: number;
  startTime: number;
  expiresAt: number;
  isRetry: boolean;
}

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);
  private readonly SESSION_DURATION = 88 * 1000; // 88 seconds in milliseconds
  private activeSessions = new Map<number, ActiveSession>();

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private userService: UserService,
    private sessionDataService: SessionDataService,
  ) {
    // Clean up expired sessions every minute
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [fid, session] of this.activeSessions) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(fid);
        this.logger.log(`Session expired for FID ${fid}`);
      }
    }
  }

  private isNewDay(user: User): boolean {
    if (!user.lastSignalDate) return true;

    const today = new Date();
    const lastSignal = new Date(user.lastSignalDate);

    return today.toDateString() !== lastSignal.toDateString();
  }

  private async resetDailyStatus(user: User): Promise<User> {
    if (this.isNewDay(user)) {
      user.lastSignalDate = new Date();
      user.submittedSignalToday = false;
      user.usedRetryToday = false;
      await this.userRepository.save(user);
    }
    return user;
  }

  async startSession(
    fid: number,
    isRetry: boolean = false,
    transactionHash?: string,
  ): Promise<SessionStartData> {
    try {
      console.log(
        `[startSession] Starting session for FID: ${fid}, isRetry: ${isRetry}, transactionHash: ${transactionHash}`,
      );

      // Get or create user
      const user = await this.userService.getByFid(fid);
      console.log('IN HERE THE USER IS', user);

      if (user.isBanned) {
        console.log(
          `[startSession] User ${fid} is banned, throwing FORBIDDEN error`,
        );
        throw new HttpException('User is banned', HttpStatus.FORBIDDEN);
      }

      // Reset daily status if new day
      console.log(`[startSession] Resetting daily status for user ${fid}`);
      await this.resetDailyStatus(user);

      // Check if already signaled today
      if (user.submittedSignalToday) {
        console.log(
          `[startSession] User ${fid} already signaled today, throwing CONFLICT error`,
        );
        throw new ConflictException('Already signaled today');
      }

      // Check retry conditions
      if (isRetry && user.usedRetryToday) {
        console.log(
          `[startSession] User ${fid} already used retry today, throwing CONFLICT error`,
        );
        throw new ConflictException('Retry already used today');
      }

      // Check for existing active session
      const existingSession = this.activeSessions.get(fid);
      console.log('IN HERE THE EXISTING SESSION IS', existingSession);
      if (existingSession && Date.now() < existingSession.expiresAt) {
        console.log(
          `[startSession] User ${fid} has existing active session, returning existing session data`,
        );
        // Return existing session data instead of throwing error
        const sessionData =
          await this.sessionDataService.prepareSessionStartData(
            fid,
            transactionHash,
          );
        console.log(
          `[startSession] Returning existing session data for FID: ${fid}`,
        );
        return sessionData;
      }
      console.log('IN HERE THE EXISTING SESSION IS', existingSession);

      // If transaction hash is provided, wait for the blockchain event (or just verify it exists)
      if (transactionHash) {
        console.log(
          `[startSession] Waiting for transaction event: ${transactionHash}`,
        );
        await this.sessionDataService.waitForTransactionEvent(transactionHash);
      }

      // Create new session
      const now = Date.now();
      const expiresAt = now + this.SESSION_DURATION;

      console.log('IN HERE THE TRANSACTION HASH IS', transactionHash);
      const session: ActiveSession = {
        fid,
        startTime: now,
        expiresAt,
        isRetry,
      };

      this.activeSessions.set(fid, session);

      this.logger.log(
        `Session started for FID ${fid} - ${isRetry ? 'Retry' : 'Regular'} session, expires at ${new Date(expiresAt).toISOString()}${transactionHash ? `, TX: ${transactionHash}` : ''}`,
      );

      // Prepare and return comprehensive session data
      console.log(
        `[startSession] Preparing session start data for FID: ${fid}`,
      );
      const sessionData = await this.sessionDataService.prepareSessionStartData(
        fid,
        transactionHash,
      );

      console.log(
        `[startSession] Successfully started session for FID: ${fid}`,
      );
      return sessionData;
    } catch (error) {
      console.error(
        `[startSession] Error starting session for FID ${fid}:`,
        error,
      );
      console.error(`[startSession] Error details:`, {
        message: error.message,
        stack: error.stack,
        isRetry,
        transactionHash,
        errorType: error.constructor.name,
      });

      // Re-throw the error to maintain the original behavior
      throw error;
    }
  }

  async getSessionStatus(fid: number): Promise<SessionStatusDto> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.resetDailyStatus(user);

    const session = this.activeSessions.get(fid);
    const now = Date.now();

    let isActive = false;
    let timeRemaining = 0;

    if (session && now < session.expiresAt) {
      isActive = true;
      timeRemaining = session.expiresAt - now;
    }

    return {
      isActive,
      timeRemaining,
      canSignal: !user.submittedSignalToday,
      canRetry: !user.usedRetryToday && !user.submittedSignalToday,
      hasSignaledToday: user.submittedSignalToday,
      hasUsedRetry: user.usedRetryToday,
      defaultTokens: user.defaultTokens || null,
    };
  }

  async setDefaultTokens(
    fid: number,
    tokens: Array<{ ca: string; ticker: string }>,
  ): Promise<void> {
    if (tokens.length !== 8) {
      throw new HttpException(
        'Must provide exactly 8 default tokens',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.defaultTokens = tokens;
    await this.userRepository.save(user);

    this.logger.log(`Updated default tokens for FID ${fid}`);
  }

  async createSignal(
    createSignalDto: CreateSignalDto,
  ): Promise<SignalResponseDto> {
    const { fid, tokens, metadata } = createSignalDto;

    // Validate session
    const session = this.activeSessions.get(fid);
    if (!session || Date.now() > session.expiresAt) {
      throw new HttpException(
        'No active session or session expired',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get user
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.resetDailyStatus(user);

    // Check if already signaled today
    if (user.submittedSignalToday) {
      throw new ConflictException('Already signaled today');
    }

    // Validate exactly 8 tokens
    if (tokens.length !== 8) {
      throw new HttpException(
        'Must provide exactly 8 token predictions',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Generate signal ID
    const signalId = `signal-${Date.now()}-${fid}`;

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create signal
    const signal = this.signalRepository.create({
      signalId,
      tokens,
      timestamp: Date.now(),
      expiresAt,
      status: 'ACTIVE',
      correctPredictions: 0,
      fid,
      user,
      metadata,
    });

    const savedSignal = await this.signalRepository.save(signal);

    // Update user status
    user.submittedSignalToday = true;
    user.totalSignals += 1;
    user.activeSignals += 1;
    await this.userRepository.save(user);

    // End session
    this.activeSessions.delete(fid);

    this.logger.log(`Signal created: ${signalId} by FID ${fid}`);

    return this.mapToResponseDto(savedSignal);
  }

  async getSignalsFeed(
    query: GetSignalsFeedDto,
  ): Promise<SignalsFeedResponseDto> {
    const { limit = 20, page = 1, status, fid } = query;
    const offset = (page - 1) * limit;

    const whereConditions: any = {};
    if (status) {
      whereConditions.status = status;
    }
    if (fid) {
      whereConditions.fid = fid;
    }

    const findOptions: FindManyOptions<Signal> = {
      where: whereConditions,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['user'],
    };

    const [signals, total] = await Promise.all([
      this.signalRepository.find(findOptions),
      this.signalRepository.count({ where: whereConditions }),
    ]);

    const enrichedSignals = signals.map((signal) =>
      this.mapToResponseDto(signal),
    );

    return {
      signals: enrichedSignals,
      total,
      hasMore: offset + signals.length < total,
    };
  }

  async getSignalById(signalId: string): Promise<SignalResponseDto> {
    const signal = await this.signalRepository.findOne({
      where: { signalId },
      relations: ['user'],
    });

    if (!signal) {
      throw new NotFoundException(`Signal with ID ${signalId} not found`);
    }

    return this.mapToResponseDto(signal);
  }

  async settleSignal(
    signalId: string,
    exitMarketCaps: string[],
    correctPredictions: number,
  ): Promise<SignalResponseDto> {
    const signal = await this.signalRepository.findOne({
      where: { signalId },
      relations: ['user'],
    });

    if (!signal) {
      throw new NotFoundException(`Signal with ID ${signalId} not found`);
    }

    if (signal.status !== 'ACTIVE') {
      throw new ConflictException('Signal is not active');
    }

    // Validate exit market caps
    if (exitMarketCaps.length !== 8) {
      throw new HttpException(
        'Must provide exactly 8 exit market caps',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Determine status based on correct predictions (>4 = win)
    const isWin = correctPredictions > 4;
    const isExpired = Date.now() >= signal.expiresAt.getTime();

    let newStatus: 'WON' | 'LOST' | 'EXPIRED';
    if (isExpired) {
      newStatus = 'EXPIRED';
    } else {
      newStatus = isWin ? 'WON' : 'LOST';
    }

    // Update signal
    signal.status = newStatus;
    signal.correctPredictions = correctPredictions;

    const savedSignal = await this.signalRepository.save(signal);

    // Update user stats
    await this.updateUserStats(signal.user);

    this.logger.log(
      `Signal settled: ${signalId} - Status: ${newStatus}, Correct: ${correctPredictions}/8`,
    );

    return this.mapToResponseDto(savedSignal);
  }

  private async updateUserStats(user: User): Promise<void> {
    // Reload user with signals
    const userWithSignals = await this.userRepository.findOne({
      where: { fid: user.fid },
      relations: ['signals'],
    });

    if (!userWithSignals) return;

    const totalSignals = userWithSignals.signals.length;
    const activeSignals = userWithSignals.signals.filter(
      (s) => s.status === 'ACTIVE',
    ).length;
    const settledSignals = userWithSignals.signals.filter((s) =>
      ['WON', 'LOST', 'EXPIRED'].includes(s.status),
    ).length;
    const wonSignals = userWithSignals.signals.filter(
      (s) => s.status === 'WON',
    ).length;

    const winRate =
      settledSignals > 0 ? (wonSignals / settledSignals) * 100 : 0;

    // Calculate MFS Score
    let mfsScore = 0;
    if (settledSignals >= 5) {
      const winRateWeight = winRate / 100;
      const volumeWeight = Math.min(settledSignals / 100, 1);
      mfsScore = winRateWeight * 0.7 + volumeWeight * 0.3;
    }

    // Update user
    userWithSignals.totalSignals = totalSignals;
    userWithSignals.activeSignals = activeSignals;
    userWithSignals.settledSignals = settledSignals;
    userWithSignals.winRate = winRate;
    userWithSignals.mfsScore = mfsScore;

    await this.userRepository.save(userWithSignals);
  }

  private mapToResponseDto(signal: Signal): SignalResponseDto {
    return {
      signalId: signal.signalId,
      fid: signal.fid,
      tokens: signal.tokens,
      timestamp: signal.timestamp,
      expiresAt: signal.expiresAt,
      status: signal.status,
      correctPredictions: signal.correctPredictions,
      createdAt: signal.createdAt,
      user: {
        fid: signal.user.fid,
        username: signal.user.username,
        pfpUrl: signal.user.pfpUrl,
        totalSignals: signal.user.totalSignals,
        winRate: signal.user.winRate,
        mfsScore: signal.user.mfsScore,
      },
    };
  }
}
