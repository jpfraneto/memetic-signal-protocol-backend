import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../../models/User/User.model';
import { Signal } from '../../models/Signal/Signal.model';
import { PriceSnapshot } from '../../models/PriceSnapshot/PriceSnapshot.model';
import { SignalStatus } from '../../models/Signal/Signal.types';

export interface ScoreCalculationResult {
  transaction_hash: string;
  mc: number;
  finalMarketCap: number;
  marketCapChange: number;
  direction: number;
  days: number;
  decayMultiplier: number;
  rawScore: number;
  finalScore: number;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private readonly DECAY_CONSTANT = 0.075; // Exponential decay constant

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Signal)
    private signalRepository: Repository<Signal>,
    @InjectRepository(PriceSnapshot)
    private priceSnapshotRepository: Repository<PriceSnapshot>,
    private dataSource: DataSource,
  ) {}

  /**
   * Calculate exponential decay multiplier
   * Formula: e^(-0.075 × days)
   */
  calculateDecayMultiplier(days: number): number {
    return Math.exp(-this.DECAY_CONSTANT * days);
  }

  /**
   * Calculate final score for a signal
   * Formula: Final Score = Market Cap Change × Direction × e^(-0.075 × days)
   */
  async calculateSignalScore(
    signal: Signal,
    finalMarketCap: number,
  ): Promise<ScoreCalculationResult> {
    this.logger.log(`Calculating score for signal ${signal.transaction_hash}`);

    // Get initial market cap from price snapshots
    const initialSnapshot = await this.priceSnapshotRepository
      .createQueryBuilder('ps')
      .where('ps.tokenAddress = :address', { address: signal.ca })
      .andWhere('ps.snapshotAt <= :timestamp', {
        timestamp: new Date(Number(signal.timestamp) * 1000),
      })
      .orderBy('ps.snapshotAt', 'DESC')
      .getOne();

    const mc = signal?.entry_market_cap || 0;

    if (mc === 0) {
      this.logger.warn(
        `No initial market cap data found for signal ${signal.transaction_hash}`,
      );
      return null;
    }

    // Calculate components
    const marketCapChange = (finalMarketCap - mc) / mc;
    const direction = signal.direction ? 1 : -1; // UP = +1, DOWN = -1
    const decayMultiplier = this.calculateDecayMultiplier(signal.duration);

    // Calculate raw score (before decay)
    const rawScore = marketCapChange * direction;

    // Apply exponential decay
    const finalScore = rawScore * decayMultiplier;

    this.logger.log(
      `Signal ${signal.transaction_hash}: ${marketCapChange.toFixed(4)} × ${direction} × ${decayMultiplier.toFixed(4)} = ${finalScore.toFixed(4)}`,
    );

    return {
      transaction_hash: signal.transaction_hash,
      mc,
      finalMarketCap,
      marketCapChange,
      direction,
      days: signal.duration,
      decayMultiplier,
      rawScore,
      finalScore,
    };
  }

  /**
   * Process expired signals and update user scores
   */
  async processExpiredSignals(): Promise<void> {
    this.logger.log('Processing expired signals for score updates');

    const expiredSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .leftJoinAndSelect('signal.user', 'user')
      .where('signal.resolved = :status', { status: false })
      .andWhere('signal.expires_at < :now', {
        now: new Date(),
      })
      .getMany();

    this.logger.log(
      `Found ${expiredSignals.length} expired signals to process`,
    );

    for (const signal of expiredSignals) {
      await this.processSignalScore(signal);
    }
  }

  /**
   * Process individual signal score and update user
   */
  async processSignalScore(signal: Signal): Promise<void> {
    try {
      // Get current market cap from latest price snapshot
      const currentSnapshot = await this.priceSnapshotRepository
        .createQueryBuilder('ps')
        .where('ps.tokenAddress = :address', { address: signal.ca })
        .orderBy('ps.snapshotAt', 'DESC')
        .getOne();

      const currentMarketCap = currentSnapshot?.marketCap || 0;

      if (currentMarketCap === 0) {
        this.logger.warn(
          `No market cap data available for signal ${signal.transaction_hash}, skipping`,
        );
        return;
      }

      // Calculate score
      const scoreResult = await this.calculateSignalScore(
        signal,
        currentMarketCap,
      );

      // Determine signal outcome
      const isCorrect =
        (signal.direction && scoreResult.marketCapChange > 0) ||
        (!signal.direction && scoreResult.marketCapChange < 0);

      // Update signal status
      await this.signalRepository.update(signal.transaction_hash, {
        resolved: isCorrect ? true : false,
      });

      // Update user score if signal was correct
      if (isCorrect && signal.user) {
        await this.updateUserScore(signal.user.fid, scoreResult.finalScore);
      }

      this.logger.log(
        `Processed signal ${signal.transaction_hash}: ${isCorrect ? 'WON' : 'LOST'}, score: ${scoreResult.finalScore.toFixed(4)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process signal ${signal.transaction_hash}:`,
        error,
      );
    }
  }

  /**
   * Update user's total score
   */
  async updateUserScore(fid: number, scoreToAdd: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, { where: { fid } });

      if (user) {
        user.total_score = Number(user.total_score) + scoreToAdd;

        await queryRunner.manager.save(user);

        this.logger.log(
          `Updated user ${fid} score by ${scoreToAdd.toFixed(4)}, new total: ${user.total_score}`,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update user ${fid} score:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get score multiplier examples for documentation
   */
  getScoreExamples(): Array<{
    days: number;
    multiplier: number;
    description: string;
  }> {
    return [
      {
        days: 1,
        multiplier: this.calculateDecayMultiplier(1),
        description: 'High impact',
      },
      {
        days: 7,
        multiplier: this.calculateDecayMultiplier(7),
        description: 'Moderate impact',
      },
      {
        days: 30,
        multiplier: this.calculateDecayMultiplier(30),
        description: 'Low impact',
      },
      {
        days: 300,
        multiplier: this.calculateDecayMultiplier(300),
        description: 'Negligible impact',
      },
    ];
  }

  /**
   * Recalculate leaderboard rankings
   */
  async updateLeaderboardRankings(): Promise<void> {
    this.logger.log('Updating leaderboard rankings');

    const users = await this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.totalScore', 'DESC')
      .getMany();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const newRank = i + 1;

      if (user.rank !== newRank) {
        await this.userRepository.update(user.fid, { rank: newRank });
      }
    }

    this.logger.log(`Updated rankings for ${users.length} users`);
  }
}
