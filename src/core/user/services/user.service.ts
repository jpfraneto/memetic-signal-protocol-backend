// Dependencies
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import { User, UserRoleEnum, Signal } from 'src/models';

// Utils
import NeynarService from '../../../utils/neynar';
import { CacheService } from 'src/cache/cache.service';

// DTOs
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { UserSignalsQueryDto } from '../dto/user-signals-query.dto';
import { SignalDto } from '../dto/user-response.dto';
import { SignalService } from 'src/core/signal/signal.service';
import { SignalResponseDto } from 'src/core/signal/dto/signal-response.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Signal)
    private readonly signalRepository: Repository<Signal>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Retrieves a user by their Farcaster ID with optional selected fields and relations.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @param {(keyof User)[]} [select=[]] - Optional array of fields to select.
   * @param {(keyof User)[]} [relations=[]] - Optional array of relations to include.
   * @returns {Promise<User | undefined>} The user entity or undefined if not found.
   */
  async getByFid(
    fid: User['fid'],
    select: (keyof User)[] = [],
    relations: (keyof User)[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      ...(select.length > 0 && {
        select,
      }),
      where: {
        fid,
      },
      ...(relations.length > 0 && {
        relations,
      }),
    });
  }

  /**
   * Upserts a user based on the provided Farcaster ID. This method checks if a user with the given Farcaster ID exists. If the user exists, it updates the user with the provided data; otherwise, it creates a new user with the given data and assigns a default role of USER.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to upsert.
   * @param {Partial<User>} data - An object containing the fields to update for an existing user or to set for a new user.
   * @returns {Promise<{isCreated: boolean; user: User}>} An object containing a boolean flag indicating if a new user was created and the upserted user entity.
   */
  async upsert(
    fid: User['fid'],
    data: Partial<User>,
  ): Promise<{ isCreated: boolean; user: User }> {
    let isCreated: boolean = false;
    let user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (user) {
      Object.assign(user, data);
    } else {
      isCreated = true;
      user = this.userRepository.create({
        fid,
        ...data,
        role: UserRoleEnum.USER,
      });
    }

    await this.userRepository.save(user);

    return {
      isCreated,
      user,
    };
  }

  /**
   * Updates a user's data based on the provided user ID.
   *
   * @param {User['id']} id - The ID of the user to update.
   * @param {Partial<User>} data - The data to update the user with.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async update(fid: User['fid'], data: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    Object.assign(user, data);
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Updates a user's goal by their FID.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to update.
   * @param {string} goal - The goal to set for the user.
   * @param {'preset' | 'custom'} goalType - The type of goal being set.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified FID is not found.
   */
  async updateGoal(
    fid: User['fid'],
    goal: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _goalType: 'preset' | 'custom',
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    // Update the goal and mark user as having an active training plan
    Object.assign(user, {
      currentGoal: goal,
      hasActiveTrainingPlan: true,
    });

    await this.userRepository.save(user);

    this.logger.log(
      `Updated goal for user ${user.username} (FID: ${fid}): ${goal}`,
    );
    return user;
  }

  /**
   * Deletes a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to delete.
   * @returns {Promise<boolean>} Returns true if the user was successfully deleted.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async delete(fid: User['fid']): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    await this.userRepository.remove(user);

    return true;
  }

  /**
   * Creates a new user with the provided data.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to create.
   * @param {Partial<User>} data - The data to create the user with.
   * @returns {Promise<{user: User}>} An object containing the created user entity.
   */
  async create(fid: User['fid'], data: Partial<User>): Promise<{ user: User }> {
    const user = this.userRepository.create({
      fid,
      ...data,
      role: UserRoleEnum.USER,
    });

    const savedUser = await this.userRepository.save(user);

    return {
      user: savedUser,
    };
  }

  async getUsers(query: GetUsersQueryDto): Promise<{
    users: User[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit, offset, search, sortBy, sortOrder, verified } = query;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.signals', 'signal');

    if (search) {
      queryBuilder.andWhere(
        '(user.username ILIKE :search OR user.display_name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (verified !== undefined) {
      queryBuilder.andWhere('user.is_verified = :verified', { verified });
    }

    queryBuilder
      .orderBy(`user.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .limit(limit)
      .offset(offset);

    const [users, total] = await queryBuilder.getManyAndCount();

    const result = {
      users: users,
      total,
      hasMore: offset + limit < total,
    };

    return result;
  }

  async getUserWithDetails(fid: number): Promise<{
    user: any;
    recentSignals: any[];
    stats: any;
  }> {
    const user = await this.userRepository.findOne({
      where: { fid },
      relations: ['signals'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    // Get recent signals with token information
    const recentSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .leftJoinAndSelect('signal.token', 'token')
      .where('signal.fid = :fid', { fid })
      .orderBy('signal.timestamp', 'DESC')
      .limit(10)
      .getMany();

    // Calculate user statistics
    const totalSignals = await this.signalRepository.count({ where: { fid } });
    const resolvedSignals = await this.signalRepository.count({
      where: { fid, resolved: true },
    });

    // Map signals to UserSignalDto format
    const recentSignals_mapped = recentSignals.map((signal) => ({
      id: signal.transaction_hash,
      signalId: signal.signal_id,
      fid: signal.fid,
      tokenAddress: signal.ca,
      ticker: signal.token?.symbol || 'UNKNOWN',
      direction: signal.direction ? 'up' : 'down',
      timestamp: Number(signal.timestamp) * 1000, // Convert to milliseconds
      entry_market_cap: signal.entry_market_cap,
      expires_at: signal.expires_at,
      block_number: signal.block_number,
      resolved: signal.resolved,
      manually_updated: signal.manually_updated,
      duration: signal.duration_days,
      current_price: null, // Would need to be calculated from current price
      exit_price: null, // Would need to be calculated if resolved
      mfs_delta: signal.mfs_delta,
      stake: 100, // Default stake amount
      status: signal.resolved ? 'closed' : 'open',
      transactionHash: signal.transaction_hash,
    }));

    // Calculate basic stats
    const stats = {
      total_score: user.total_score,
      bestSignal:
        recentSignals_mapped.length > 0
          ? recentSignals_mapped.reduce((best, signal) =>
              signal.mfs_delta > best.mfs_delta ? signal : best,
            )
          : null,
      worstSignal:
        recentSignals_mapped.length > 0
          ? recentSignals_mapped.reduce((worst, signal) =>
              signal.mfs_delta < worst.mfs_delta ? signal : worst,
            )
          : null,
      averageStake: 100, // Default average stake
      total_signals: totalSignals,
      active_signals: totalSignals - resolvedSignals,
      resolved_signals: resolvedSignals,
      win_rate: user.win_rate,
      mfs_score: user.mfs_score,
    };

    // Map user to enhanced format
    const enhancedUser = {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      avatar: user.pfp_url,
      pfpUrl: user.pfp_url,
      isVerified: user.is_verified || false,
      mfsScore: user.mfs_score,
      winRate: user.win_rate || 0,
      total_signals: totalSignals,
      rank: user.rank,
      createdAt: user.created_at
        ? new Date(user.created_at).toISOString()
        : new Date().toISOString(),
      updatedAt: user.updated_at
        ? new Date(user.updated_at).toISOString()
        : new Date().toISOString(),
    };

    return {
      user: enhancedUser,
      recentSignals: recentSignals_mapped,
      stats,
    };
  }

  async getUserSignals(
    fid: number,
    query: UserSignalsQueryDto,
  ): Promise<{
    signals: Signal[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit, offset, status } = query;

    const queryBuilder = this.signalRepository
      .createQueryBuilder('signal')
      .leftJoin('signal.user', 'user')
      .where('user.fid = :fid', { fid });

    if (status) {
      queryBuilder.andWhere('signal.resolved = :status', { status });
    }

    queryBuilder
      .orderBy('signal.timestamp', 'DESC')
      .limit(limit)
      .offset(offset);

    const [signals, total] = await queryBuilder.getManyAndCount();

    return {
      signals,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Recalculates total signals for a specific user
   */
  async recalculateUserTotalSignals(fid: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    // Count total signals for this user
    const totalSignals = await this.signalRepository.count({
      where: { fid },
    });

    // Update user's total_signals field
    user.total_signals = totalSignals;
    await this.userRepository.save(user);

    // Invalidate cache for this user
    await this.cacheService.invalidateUserProfile(fid);

    this.logger.log(`Updated total signals for user ${fid}: ${totalSignals}`);
  }

  /**
   * Recalculates total signals for all users
   */
  async recalculateTotalSignals(): Promise<void> {
    const users = await this.userRepository.find();

    for (const user of users) {
      const totalSignals = await this.signalRepository.count({
        where: { fid: user.fid },
      });

      user.total_signals = totalSignals;
      await this.userRepository.save(user);

      // Invalidate cache for this user
      await this.cacheService.invalidateUserProfile(user.fid);
    }

    this.logger.log(`Recalculated total signals for ${users.length} users`);
  }

  /**
   * Get enhanced user statistics with caching
   */
  async getUserStatistics(fid: number): Promise<{
    totalSignals: number;
    resolvedSignals: number;
    successfulSignals: number;
    activeSignals: number;
    winRate: number;
    totalScore: number;
    mfsScore: number;
    latestSignalsCount: number;
  }> {
    const cacheKey = `user_stats:${fid}`;

    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`User statistics cache hit for FID: ${fid}`);
      return cached as any;
    }

    // Calculate from database
    const totalSignals = await this.signalRepository.count({ where: { fid } });
    const resolvedSignals = await this.signalRepository.count({
      where: { fid, resolved: true },
    });
    const activeSignals = totalSignals - resolvedSignals;

    // Get successful signals (resolved with positive MFS delta)
    const successfulSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .where(
        'signal.fid = :fid AND signal.resolved = true AND signal.mfs_delta > 0',
        { fid },
      )
      .getCount();

    // Calculate win rate
    const winRate =
      resolvedSignals > 0 ? (successfulSignals / resolvedSignals) * 100 : 0;

    // Calculate total score
    const scoreResult = await this.signalRepository
      .createQueryBuilder('signal')
      .select('SUM(signal.mfs_delta)', 'totalScore')
      .where('signal.fid = :fid AND signal.resolved = true', { fid })
      .getRawOne();

    const totalScore = parseFloat(scoreResult?.totalScore || '0') || 0;
    const mfsScore = totalScore;

    // Get latest 50 signals for the user
    const latestSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .where('signal.fid = :fid', { fid })
      .orderBy('signal.timestamp', 'DESC')
      .limit(50)
      .getMany();

    const stats = {
      totalSignals,
      resolvedSignals,
      successfulSignals,
      activeSignals,
      winRate,
      totalScore,
      mfsScore,
      latestSignalsCount: latestSignals.length,
    };

    // Cache the result for 3 minutes
    await this.cacheService.set(cacheKey, stats, 3 * 60 * 1000);

    this.logger.debug(`User statistics calculated and cached for FID: ${fid}`);
    return stats;
  }

  /**
   * Enhanced getUserWithDetails with caching and updated return format
   */
  async getUserWithDetailsEnhanced(fid: number): Promise<{
    user: any;
    recentSignals: any[];
    stats: any;
  }> {
    // Try to get user profile from cache
    const cached = await this.cacheService.getUserProfile(fid);
    if (cached) {
      this.logger.debug(`User profile cache hit for FID: ${fid}`);
      return cached as any;
    }

    const user = await this.userRepository.findOne({
      where: { fid },
      relations: ['signals'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    // Get recent signals with token information
    const recentSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .leftJoinAndSelect('signal.token', 'token')
      .where('signal.fid = :fid', { fid })
      .orderBy('signal.timestamp', 'DESC')
      .limit(10)
      .getMany();

    // Get enhanced statistics using the new method
    const statistics = await this.getUserStatistics(fid);

    // Map signals to UserSignalDto format
    const recentSignals_mapped = recentSignals.map((signal) => ({
      id: signal.transaction_hash,
      signalId: signal.signal_id,
      fid: signal.fid,
      tokenAddress: signal.ca,
      ticker: signal.token?.symbol || 'UNKNOWN',
      direction: signal.direction ? 'up' : 'down',
      timestamp: Number(signal.timestamp) * 1000, // Convert to milliseconds
      entry_market_cap: signal.entry_market_cap,
      expires_at: signal.expires_at,
      block_number: signal.block_number,
      resolved: signal.resolved,
      manually_updated: signal.manually_updated,
      duration: signal.duration_days,
      current_price: null, // Would need to be calculated from current price
      exit_price: null, // Would need to be calculated if resolved
      mfs_delta: signal.mfs_delta,
      stake: 100, // Default stake amount
      status: signal.resolved ? 'closed' : 'open',
      transactionHash: signal.transaction_hash,
    }));

    // Enhanced stats with all required fields
    const stats = {
      totalPnl: statistics.totalScore,
      totalSignals: statistics.totalSignals,
      resolvedSignals: statistics.resolvedSignals,
      successfulSignals: statistics.successfulSignals,
      activeSignals: statistics.activeSignals,
      winRate: statistics.winRate,
      mfsScore: statistics.mfsScore,
      latestSignalsCount: statistics.latestSignalsCount,
      bestSignal:
        recentSignals_mapped.length > 0
          ? recentSignals_mapped.reduce((best, signal) =>
              signal.mfs_delta > best.mfs_delta ? signal : best,
            )
          : null,
      worstSignal:
        recentSignals_mapped.length > 0
          ? recentSignals_mapped.reduce((worst, signal) =>
              signal.mfs_delta < worst.mfs_delta ? signal : worst,
            )
          : null,
      averageStake: 100, // Default average stake
    };

    // Map user to enhanced format
    const enhancedUser = {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      avatar: user.pfp_url,
      pfpUrl: user.pfp_url,
      isVerified: user.is_verified || false,
      mfsScore: user.mfs_score,
      winRate: user.win_rate || 0,
      totalSignals: statistics.totalSignals,
      rank: user.rank,
      createdAt: user.created_at
        ? new Date(user.created_at).toISOString()
        : new Date().toISOString(),
      updatedAt: user.updated_at
        ? new Date(user.updated_at).toISOString()
        : new Date().toISOString(),
    };

    const result = {
      user: enhancedUser,
      recentSignals: recentSignals_mapped,
      stats,
    };

    // Cache the result for 2 minutes
    await this.cacheService.setUserProfile(fid, result);

    return result;
  }

  /**
   * Comprehensive data consistency check and repair for a user
   */
  async ensureUserDataConsistency(fid: number): Promise<void> {
    this.logger.log(`Ensuring data consistency for user ${fid}`);

    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    // Get accurate counts from database
    const totalSignals = await this.signalRepository.count({ where: { fid } });
    const settledSignals = await this.signalRepository.count({
      where: { fid, resolved: true },
    });
    const activeSignals = await this.signalRepository.count({
      where: { fid, resolved: false },
    });

    // Calculate win count and win rate
    const wonSignals = await this.signalRepository
      .createQueryBuilder('signal')
      .where(
        'signal.fid = :fid AND signal.resolved = true AND signal.mfs_delta > 0',
        { fid },
      )
      .getCount();

    const winRate =
      settledSignals > 0 ? (wonSignals / settledSignals) * 100 : 0;

    // Calculate total score
    const scoreResult = await this.signalRepository
      .createQueryBuilder('signal')
      .select('SUM(signal.mfs_delta)', 'totalScore')
      .where('signal.fid = :fid AND signal.resolved = true', { fid })
      .getRawOne();

    const totalScore = parseFloat(scoreResult?.totalScore || '0') || 0;
    const mfsScore = totalScore; // MFS score is based on total score

    // Update user with consistent data
    user.total_signals = totalSignals;
    user.active_signals = activeSignals;
    user.settled_signals = settledSignals;
    user.win_rate = winRate;
    user.total_score = totalScore;
    user.mfs_score = mfsScore;

    await this.userRepository.save(user);

    // Invalidate cache for this user after updating
    await this.cacheService.invalidateUserProfile(fid);

    this.logger.log(
      `Data consistency updated for user ${fid}: total=${totalSignals}, active=${activeSignals}, settled=${settledSignals}, winRate=${winRate.toFixed(2)}%, score=${totalScore.toFixed(4)}`,
    );
  }

  /**
   * Run data consistency check for all users
   */
  async ensureAllUsersDataConsistency(): Promise<void> {
    this.logger.log(
      'Starting comprehensive data consistency check for all users',
    );

    const users = await this.userRepository.find();
    let processedCount = 0;

    for (const user of users) {
      try {
        await this.ensureUserDataConsistency(user.fid);
        processedCount++;

        if (processedCount % 10 === 0) {
          this.logger.log(
            `Data consistency progress: ${processedCount}/${users.length} users processed`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to ensure data consistency for user ${user.fid}:`,
          error,
        );
      }
    }

    this.logger.log(
      `Data consistency check completed. Processed ${processedCount}/${users.length} users`,
    );
  }
}
