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
import {
  SignalDirection,
  SignalStatus,
} from '../../models/Signal/Signal.types';
import { User } from '../../models/User/User.model';
import { UserService } from '../user/services/user.service';
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
  isRetry: boolean;
}

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);
  private activeSessions = new Map<number, ActiveSession>();

  constructor(
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private userService: UserService,
    private sessionDataService: SessionDataService,
  ) {
    // Sessions are now persistent until signal submission
  }

  private isNewDay(user: User): boolean {
    if (!user.last_signal_date) return true;

    const today = new Date();
    const lastSignal = new Date(user.last_signal_date);

    return today.toDateString() !== lastSignal.toDateString();
  }

  async getSignalsFeedForUser(fid: number): Promise<SignalResponseDto[]> {
    const signals = await this.signalRepository.find({
      where: { fid },
      relations: ['user', 'token'],
    });
    return signals.map((signal) => this.mapToResponseDto(signal));
  }

  async getFavoriteTwentySignalersForFid(
    fid: number,
  ): Promise<SignalResponseDto[]> {
    const signals = await this.signalRepository.find({
      order: { timestamp: 'DESC' },
      take: 20,
      relations: ['user', 'token'],
    });
    return signals.map((signal) => this.mapToResponseDto(signal));
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
      relations: ['user', 'token'],
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

  async getSignalById(transaction_hash: string): Promise<SignalResponseDto> {
    const signal = await this.signalRepository.findOne({
      where: { transaction_hash: transaction_hash },
      relations: ['user', 'token'],
    });

    if (!signal) {
      throw new NotFoundException(
        `Signal with transaction_hash ${transaction_hash} not found`,
      );
    }

    return this.mapToResponseDto(signal);
  }

  async settleSignal(
    transaction_hash: string,
    exitMarketCap: string,
    isCorrect: boolean,
  ): Promise<SignalResponseDto> {
    const signal = await this.signalRepository.findOne({
      where: { transaction_hash: transaction_hash },
      relations: ['user', 'token'],
    });

    if (!signal) {
      throw new NotFoundException(
        `Signal with transaction_hash ${transaction_hash} not found`,
      );
    }

    if (signal.status !== SignalStatus.ACTIVE) {
      throw new ConflictException('Signal is not active');
    }

    // Validate exit market cap
    if (!exitMarketCap) {
      throw new HttpException(
        'Exit market cap is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Determine status based on prediction correctness
    const isExpired = new Date() >= signal.expires_at;

    let newStatus: SignalStatus;
    if (isExpired) {
      newStatus = SignalStatus.LOST; // Expired signals are considered lost
    } else {
      newStatus = isCorrect ? SignalStatus.WON : SignalStatus.LOST;
    }

    // Update signal
    signal.status = newStatus;

    const savedSignal = await this.signalRepository.save(signal);

    // Update user stats
    await this.updateUserStats(signal.user);

    this.logger.log(
      `Signal settled: ${transaction_hash} - Status: ${newStatus}, Correct: ${isCorrect}`,
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
      (s) => s.status === SignalStatus.ACTIVE,
    ).length;
    const settledSignals = userWithSignals.signals.filter((s) =>
      [SignalStatus.WON, SignalStatus.LOST].includes(s.status),
    ).length;
    const wonSignals = userWithSignals.signals.filter(
      (s) => s.status === SignalStatus.WON,
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
    userWithSignals.total_signals = totalSignals;
    userWithSignals.active_signals = activeSignals;
    userWithSignals.settled_signals = settledSignals;
    userWithSignals.win_rate = winRate;
    userWithSignals.mfs_score = mfsScore;

    await this.userRepository.save(userWithSignals);
  }

  private mapToResponseDto(signal: Signal): SignalResponseDto {
    // Convert boolean direction to uppercase string for API response
    const directionString = signal.direction ? 'UP' : 'DOWN';

    // Convert numeric status to string
    const statusString =
      signal.status === SignalStatus.ACTIVE
        ? 'ACTIVE'
        : signal.status === SignalStatus.WON
          ? 'WON'
          : 'LOST';

    return {
      transaction_hash: signal.transaction_hash,
      fid: signal.fid,
      ca: signal.ca,
      mc: signal.mc,
      direction: directionString === 'UP',
      timestamp: signal.timestamp,
      block_number: signal.block_number,
      expires_at: signal.expires_at,
      status:
        statusString === 'ACTIVE'
          ? SignalStatus.ACTIVE
          : statusString === 'WON'
            ? SignalStatus.WON
            : SignalStatus.LOST,
      duration: signal.duration,
      user: {
        fid: signal.user.fid,
        username: signal.user.username,
        pfp_url: signal.user.pfp_url,
        total_signals: signal.user.total_signals,
        win_rate: signal.user.win_rate,
        mfs_score: signal.user.mfs_score,
        display_name: signal.user.display_name,
      },
      token: signal.token
        ? {
            ca: signal.token.ca,
            name: signal.token.name,
            symbol: signal.token.symbol,
            image: signal.token.image,
          }
        : undefined,
    };
  }
}
