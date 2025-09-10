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
      order: { expires_at: 'DESC' },
      take: 20,
      relations: ['user', 'token'],
    });
    return signals.map((signal) => this.mapToResponseDto(signal));
  }

  async getSignalsFeed(
    query: GetSignalsFeedDto,
  ): Promise<SignalsFeedResponseDto> {
    const { limit = 20, page = 1, status, fid, resolved, cursor } = query;
    const offset = (page - 1) * limit;

    const whereConditions: any = {};
    if (status) {
      whereConditions.status = status;
    }
    if (fid) {
      whereConditions.fid = fid;
    }

    // Handle resolved parameter
    if (resolved !== undefined) {
      if (resolved === true) {
        whereConditions.resolved = true;
      } else {
        // For resolved=false or unspecified, show live signals
        whereConditions.resolved = false;
      }
    }

    // Determine sort order based on signal resolution status
    let orderBy: any;
    if (resolved === true) {
      // For resolved signals, sort by timestamp DESC (most recent first)
      // Since we don't have settled_at, we'll use timestamp as proxy
      orderBy = { timestamp: 'DESC' };
    } else {
      // For live signals, sort by expires_at ASC (closest to expiration first)
      orderBy = { expires_at: 'ASC' };
    }

    const findOptions: FindManyOptions<Signal> = {
      where: whereConditions,
      order: orderBy,
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

    if (signal.resolved) {
      throw new ConflictException('Signal is already resolved');
    }

    // Validate exit market cap
    if (!exitMarketCap) {
      throw new HttpException(
        'Exit market cap is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Determine status based on prediction correctness
    const isExpired = new Date() >= new Date(Number(signal.expires_at) * 1000);

    let newStatus: SignalStatus;
    if (isExpired) {
      newStatus = SignalStatus.LOST; // Expired signals are considered lost
    } else {
      newStatus = isCorrect ? SignalStatus.WON : SignalStatus.LOST;
    }

    // Update signal
    signal.resolved = true;

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
      (s) => !s.resolved,
    ).length;
    const settledSignals = userWithSignals.signals.filter((s) =>
      [true, false].includes(s.resolved),
    ).length;
    const wonSignals = userWithSignals.signals.filter((s) => s.resolved).length;

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
    // Convert resolved status to signal status enum
    let status: SignalStatus;
    if (signal.resolved === false) {
      status = SignalStatus.ACTIVE;
    } else if (signal.resolved === true) {
      // For resolved signals, we'd need additional logic to determine WON vs LOST
      // For now, treating all resolved as WON - this might need adjustment based on other fields
      status = SignalStatus.WON;
    } else {
      status = SignalStatus.ACTIVE;
    }

    return {
      // All Signal model properties
      signal_id: signal.signal_id,
      transaction_hash: signal.transaction_hash,
      ca: signal.ca,
      fid: signal.fid,
      direction: signal.direction,
      duration_days: signal.duration_days,
      entry_market_cap: signal.entry_market_cap,
      created_at: signal.created_at.toString(),
      expires_at: new Date(Number(signal.expires_at) * 1000),
      timestamp: signal.timestamp.toString(),
      block_number: Number(signal.block_number),
      resolved: signal.resolved,
      mfs_delta: signal.mfs_delta,
      manually_updated: signal.manually_updated,
      
      // Computed/helper properties
      duration: signal.duration,
      status: status,
      
      // Related data
      user: signal.user ? {
        fid: signal.user.fid,
        username: signal.user.username,
        pfp_url: signal.user.pfp_url,
        total_signals: signal.user.total_signals,
        win_rate: signal.user.win_rate,
        mfs_score: signal.user.mfs_score,
        display_name: signal.user.display_name,
      } : undefined,
      
      token: signal.token ? {
        ca: signal.token.ca,
        name: signal.token.name,
        symbol: signal.token.symbol,
        image: signal.token.image,
      } : undefined,
    };
  }
}
