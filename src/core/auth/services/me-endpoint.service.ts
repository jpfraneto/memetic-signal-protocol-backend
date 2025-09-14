import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

// Models
import { User, Signal, Token, PriceSnapshot } from '../../../models';

// Services
import { UserService } from '../../user/services/user.service';
import { ZapperService } from '../../zapper/services/zapper.service';
import { BlockchainService } from '../../blockchain/blockchain.service';
import NeynarService from '../../../utils/neynar';

// DTOs
import {
  MeEndpointResponseDto,
  UserProfileDto,
  FeaturedTokenDto,
  LeaderboardUserDto,
  TodaySignalDto,
  ErrorResponseDto,
  ErrorDetailsDto,
} from '../dto/me-endpoint-response.dto';

// Types
import { SignalStatus } from '../../../models/Signal/Signal.types';

@Injectable()
export class MeEndpointService {
  private readonly logger = new Logger(MeEndpointService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Signal)
    private readonly signalRepository: Repository<Signal>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(PriceSnapshot)
    private readonly priceSnapshotRepository: Repository<PriceSnapshot>,
    private readonly userService: UserService,
    private readonly zapperService: ZapperService,
    private readonly blockchainService: BlockchainService,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Main method to get complete /me endpoint data with caching and error handling
   */
  async getCompleteUserData(fid: number): Promise<MeEndpointResponseDto> {
    const startTime = Date.now();
    this.logger.log(`[/me] Starting complete data fetch for FID: ${fid}`);

    try {
      // 1. Validate and get/create user
      const user = await this.validateAndUpdateUser(fid);
      this.logger.log(`[/me] User validated: ${user.username} (${user.fid})`);

      // 2. Get all data in parallel with fallbacks
      const [feedData, featuredTokens, leaderboard, todaySignal] =
        await Promise.allSettled([
          this.getFeedDataWithFallback(),
          this.getFeaturedTokensWithFallback(fid),
          this.getLeaderboardsWithFallback(),
          this.getTodaySignalWithFallback(fid),
        ]);

      const response: MeEndpointResponseDto = {
        success: true,
        user: this.mapUserToProfileDto(user),
        feedData:
          feedData.status === 'fulfilled'
            ? feedData.value
            : { signals: [], totalCount: 0 },
        featuredTokens:
          featuredTokens.status === 'fulfilled'
            ? featuredTokens.value
            : featuredTokens.status === 'rejected'
              ? []
              : featuredTokens,
        leaderboard:
          leaderboard.status === 'fulfilled' ? leaderboard.value : [],
        todaySignal:
          todaySignal.status === 'fulfilled' ? todaySignal.value : null,
      };

      const duration = Date.now() - startTime;
      this.logger.log(
        `[/me] Complete data fetch completed in ${duration}ms for FID: ${fid}`,
      );

      // Log performance metrics
      this.logPerformanceMetrics(fid, duration, {
        userSuccess: true,
        feedSuccess: feedData.status === 'fulfilled',
        tokensSuccess: featuredTokens.status === 'fulfilled',
        leaderboardSuccess: leaderboard.status === 'fulfilled',
        todaySignalSuccess: todaySignal.status === 'fulfilled',
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[/me] Complete data fetch failed after ${duration}ms for FID: ${fid}:`,
        error,
      );
      throw this.createStructuredError(error, fid, 'COMPLETE_DATA_FETCH');
    }
  }

  /**
   * Validate user exists and update with latest Neynar data
   */
  async validateAndUpdateUser(fid: number): Promise<User> {
    // Check cache first
    const cacheKey = `user:${fid}`;
    const cachedUser = await this.cacheManager.get<User>(cacheKey);

    if (cachedUser && this.isUserCacheValid(cachedUser)) {
      return cachedUser;
    }

    // Get user from database
    let user = await this.userService.getByFid(fid);

    if (!user) {
      this.logger.log(`[/me] Creating new user for FID: ${fid}`);
      try {
        const neynar = new NeynarService();
        const neynarUser = await neynar.getUserByFid(fid);

        const { user: newUser } = await this.userService.create(fid, {
          username: neynarUser.username,
          display_name: neynarUser.display_name,
          pfp_url: neynarUser.pfp_url,
          is_verified:
            neynarUser.verified_addresses?.eth_addresses?.length > 0 || false,
          follower_count: neynarUser.follower_count || 0,
          following_count: neynarUser.following_count || 0,
          created_at: new Date(),
          updated_at: new Date(),
        });

        user = newUser;
      } catch (neynarError) {
        this.logger.error(
          `[/me] Neynar API error for FID ${fid}:`,
          neynarError,
        );
        throw new Error(
          `NEYNAR_API_UNAVAILABLE: Failed to fetch user profile: ${neynarError.message}`,
        );
      }
    } else {
      // Update user profile if data is stale (older than 1800 minutes)
      const updateThreshold = 1800 * 60 * 1000; // 1800 minutes
      const lastUpdate = user.updated_at
        ? new Date(user.updated_at).getTime()
        : 0;

      if (Date.now() - lastUpdate > updateThreshold) {
        try {
          const neynar = new NeynarService();
          const neynarUser = await neynar.getUserByFid(fid);

          await this.userService.update(fid, {
            username: neynarUser.username,
            display_name: neynarUser.display_name,
            pfp_url: neynarUser.pfp_url,
            is_verified:
              neynarUser.verified_addresses?.eth_addresses?.length > 0 || false,
            follower_count: neynarUser.follower_count || 0,
            following_count: neynarUser.following_count || 0,
            updated_at: new Date(),
          });

          // Refresh user data
          user = await this.userService.getByFid(fid);
        } catch (neynarError) {
          this.logger.warn(
            `[/me] Failed to update user profile from Neynar, using cached data:`,
            neynarError,
          );
        }
      }
    }

    // Cache user for 30 minutes
    await this.cacheManager.set(cacheKey, user, 30 * 60 * 1000);
    return user;
  }

  /**
   * Get feed data with caching and fallback
   */
  async getFeedDataWithFallback(): Promise<{
    signals: Signal[];
    totalCount: number;
  }> {
    const cacheKey = 'feed:global';
    const cachedFeed = await this.cacheManager.get<{
      signals: Signal[];
      totalCount: number;
    }>(cacheKey);

    if (cachedFeed) {
      this.logger.log('[/me] Using cached feed data');
      return cachedFeed;
    }

    try {
      const feedData = await this.getFeedData();
      // Cache for 2 minutes
      await this.cacheManager.set(cacheKey, feedData, 2 * 60 * 1000);
      return feedData;
    } catch (error) {
      this.logger.error(
        '[/me] Primary feed query failed, trying fallback:',
        error,
      );
      return await this.getFeedDataSimplified();
    }
  }

  /**
   * Primary feed data query with all joins and price data
   */
  async getFeedData(): Promise<{ signals: Signal[]; totalCount: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const query = `
        SELECT 
          s.transaction_hash,
          s.fid,
          s.ca,
          s.entry_market_cap,
          s.direction,
          s.duration_days,
          s.timestamp,
          s.resolved,
          s.expires_at,
          s.block_number,
          s.mfs_delta,
          u.username,
          u.display_name,
          u.pfp_url,
          u.is_verified,
          u.follower_count,
          u.following_count,
          u.mfs_score,
          u.win_rate,
          u.total_signals,
          u.active_signals,
          u.settled_signals,
          u.total_score,
          u.rank,
          u.last_score_update,
          u.role,
          u.is_banned,
          u.banned_at,
          u.notifications_enabled,
          u.notification_token,
          u.notification_url,
          u.last_signal_date,
          u.state_on_the_system,
          u.wallet_address,
          u.jbm_balance,
          u.created_at as user_created_at,
          u.updated_at as user_updated_at,
          u.last_active_at,
          t.name as token_name,
          t.symbol as token_symbol,
          t.decimals,
          t.categories,
          t.description,
          t.image as token_image,
          t.image_small,
          t.image_thumb,
          t.market_cap_rank,
          t.market_data,
          t.created_at as token_created_at,
          t.updated_at as token_updated_at,
          t.coingecko_id,
          ps_initial.market_cap as initial_market_cap,
          ps_current.market_cap as current_market_cap
        FROM signals s
        LEFT JOIN users u ON s.fid = u.fid
        LEFT JOIN tokens t ON LOWER(s.ca) = LOWER(t.ca)
        LEFT JOIN price_snapshots ps_initial ON (
          LOWER(ps_initial.token_address) = LOWER(s.ca) 
          AND ps_initial.snapshot_at <= s.timestamp
          AND ps_initial.snapshot_at = (
            SELECT MAX(snapshot_at) 
            FROM price_snapshots 
            WHERE LOWER(token_address) = LOWER(s.ca) 
              AND snapshot_at <= s.timestamp
          )
        )
        LEFT JOIN price_snapshots ps_current ON (
          LOWER(ps_current.token_address) = LOWER(s.ca)
          AND ps_current.snapshot_at = (
            SELECT MAX(snapshot_at) 
            FROM price_snapshots 
            WHERE LOWER(token_address) = LOWER(s.ca)
          )
        )
        WHERE s.resolved = false OR s.resolved IS NULL
        ORDER BY s.block_number DESC
        LIMIT 50
      `;

      const results = await queryRunner.query(query);
      const totalCountQuery = await queryRunner.query(
        'SELECT COUNT(*) as count FROM signals WHERE resolved = false OR resolved IS NULL',
      );
      const totalCount = parseInt(totalCountQuery[0].count);

      const signals: Signal[] = results.map((row: any) => {
        // Create User object
        const user: User = {
          fid: row.fid,
          username: row.username || 'Unknown',
          display_name: row.display_name,
          pfp_url: row.pfp_url,
          is_verified: row.is_verified || false,
          follower_count: row.follower_count || 0,
          following_count: row.following_count || 0,
          mfs_score: row.mfs_score || 0,
          win_rate: row.win_rate || 0,
          total_signals: row.total_signals || 0,
          active_signals: row.active_signals || 0,
          settled_signals: row.settled_signals || 0,
          total_score: row.total_score || 0,
          rank: row.rank,
          last_score_update: row.last_score_update,
          role: row.role || 'USER',
          is_banned: row.is_banned || false,
          banned_at: row.banned_at,
          notifications_enabled: row.notifications_enabled !== false,
          notification_token: row.notification_token,
          notification_url: row.notification_url,
          last_signal_date: row.last_signal_date,
          state_on_the_system: row.state_on_the_system || 'ACTIVE',
          wallet_address: row.wallet_address,
          jbm_balance: row.jbm_balance || '0',
          is_subscriber: row.is_subscriber || false,
          subscription_expires_at: row.subscription_expires_at,
          subscribed_at: row.subscribed_at,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
          last_active_at: row.last_active_at,
          signals: [], // Will be populated if needed
        };

        // Create Token object
        const token: Token = {
          ca: row.ca,
          name: row.token_name || 'Unknown Token',
          symbol: row.token_symbol || 'UNKNOWN',
          decimals: row.decimals || 18,
          image: row.token_image || '',
          created_at: row.token_created_at,
          updated_at: row.token_updated_at,
        };

        // Create Signal object with proper structure
        const signal = new Signal();
        signal.signal_id = row.signal_id;
        signal.transaction_hash = row.transaction_hash;
        signal.fid = row.fid;
        signal.ca = row.ca;
        signal.direction = row.direction;
        signal.duration_days = row.duration_days;
        signal.created_at = row.created_at;
        signal.expires_at = row.expires_at;
        signal.timestamp = row.timestamp;
        signal.block_number = row.block_number;
        signal.resolved = row.resolved || false;
        signal.mfs_delta = row.mfs_delta;
        signal.entry_market_cap = row.entry_market_cap;
        signal.user = user;
        signal.token = token;

        return signal;
      });

      return { signals, totalCount };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Simplified feed query as fallback
   */
  async getFeedDataSimplified(): Promise<{
    signals: Signal[];
    totalCount: number;
  }> {
    try {
      const signals = await this.signalRepository
        .createQueryBuilder('signal')
        .leftJoin('signal.user', 'user')
        .leftJoin('signal.token', 'token')
        .select([
          'signal.signal_id',
          'signal.transaction_hash',
          'signal.fid',
          'signal.ca',
          'signal.entry_market_cap',
          'signal.resolved',
          'signal.direction',
          'signal.duration_days',
          'signal.created_at',
          'signal.timestamp',
          'signal.expires_at',
          'signal.block_number',
          'signal.mfs_delta',
          'user.username',
          'user.display_name',
          'user.pfp_url',
          'token.name',
          'token.symbol',
          'token.image',
        ])
        .where('signal.resolved = false OR signal.resolved IS NULL')
        .orderBy('signal.block_number', 'DESC')
        .limit(50)
        .getMany();

      const totalCount = await this.signalRepository.count({
        where: [{ resolved: false }, { resolved: null }],
      });

      return { signals, totalCount };
    } catch (error) {
      this.logger.error('[/me] Simplified feed query also failed:', error);
      return { signals: [], totalCount: 0 };
    }
  }

  /**
   * Get featured tokens with fallback to cache
   */
  async getFeaturedTokensWithFallback(fid: number): Promise<any[]> {
    try {
      // Use the cached trending tokens from ZapperService (30 min cache)
      const zapperTokens = await this.zapperService.getTrendingTokens(fid, 30);

      // Format Zapper tokens to match frontend Token interface expectations
      const formattedTokens = zapperTokens.map((zapperToken) => ({
        ca: zapperToken.tokenAddress.toLowerCase(),
        name: zapperToken.token.name,
        symbol: zapperToken.token.symbol,
        image: zapperToken.token.imageUrlV2 || '',
        created_at: new Date(),
        updated_at: new Date(),
        market_data: {
          current_price: zapperToken.token.priceData.price || 0,
          ath: 0, // Zapper doesn't provide ATH data, set default
          ath_change_percentage: 0, // Zapper doesn't provide ATH change, set default
          ath_date: new Date(), // Default date
          market_cap: zapperToken.token.priceData.marketCap || 0,
          price_change_24h: zapperToken.token.priceData.priceChange24h || 0,
        },
      }));

      return formattedTokens;
    } catch (error) {
      this.logger.error(
        '[/me] Zapper API failed:',
        error,
      );

      // Return empty array if all fails
      return [];
    }
  }

  /**
   * Get today's signal with fallback
   */
  async getTodaySignalWithFallback(
    fid: number,
  ): Promise<TodaySignalDto | null> {
    const cacheKey = `today-signal:${fid}`;
    const cached = await this.cacheManager.get<TodaySignalDto | null>(cacheKey);

    if (cached !== undefined) {
      this.logger.log(`[/me] Using cached today signal for FID: ${fid}`);
      return cached;
    }

    try {
      const todaySignal = await this.getTodaySignal(fid);
      // Cache for 5 minutes (signals don't change frequently within a day)
      await this.cacheManager.set(cacheKey, todaySignal, 5 * 60 * 1000);
      return todaySignal;
    } catch (error) {
      this.logger.error(
        `[/me] Today signal fetch failed for FID ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get leaderboards with caching and fallback
   */
  async getLeaderboardsWithFallback(): Promise<LeaderboardUserDto[]> {
    const cacheKey = 'leaderboards:all';
    const cachedLeaderboards =
      await this.cacheManager.get<LeaderboardUserDto[]>(cacheKey);

    if (cachedLeaderboards) {
      this.logger.log('[/me] Using cached leaderboard data');
      return cachedLeaderboards;
    }

    try {
      const leaderboards = await this.getLeaderboards();
      // Cache for 10 minutes
      await this.cacheManager.set(cacheKey, leaderboards, 10 * 60 * 1000);
      return leaderboards;
    } catch (error) {
      this.logger.error('[/me] Leaderboard query failed:', error);
      return [];
    }
  }

  /**
   * Get leaderboard data with optimized queries
   */
  async getLeaderboards(): Promise<LeaderboardUserDto[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Execute all leaderboard queries in parallel
      const [topByScoreResults] = await Promise.all([
        // Top 20 by score
        queryRunner.query(`
          SELECT fid, username, display_name, pfp_url, total_score 
          FROM users 
          WHERE total_score > 0 
          ORDER BY total_score DESC 
          LIMIT 20
        `),
      ]);

      const topByScore: LeaderboardUserDto[] = topByScoreResults.map(
        (row: any) => ({
          fid: row.fid,
          username: row.username,
          displayName: row.display_name,
          pfpUrl: row.pfp_url,
          totalScore: row.total_score,
        }),
      );

      return topByScore;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get today's signal for a user
   */
  async getTodaySignal(fid: number): Promise<TodaySignalDto | null> {
    try {
      // Get current day index based on contract deployment time
      const currentDayIndex = await this.blockchainService.getCurrentDayIndex();
      const deploymentTimestamp =
        await this.blockchainService.getDeploymentTimestamp();

      // Calculate today's time window (in Unix seconds)
      const todayStartTimestamp = deploymentTimestamp + currentDayIndex * 86400;
      const todayEndTimestamp = todayStartTimestamp + 86400;

      this.logger.debug(
        `[/me] Looking for today's signal for FID ${fid}. Day index: ${currentDayIndex}, Window: ${todayStartTimestamp} - ${todayEndTimestamp}`,
      );

      // Find signal created today for this user
      const signal = await this.signalRepository
        .createQueryBuilder('signal')
        .leftJoinAndSelect('signal.token', 'token')
        .where('signal.fid = :fid', { fid })
        .andWhere('signal.created_at >= :todayStart', {
          todayStart: todayStartTimestamp.toString(),
        })
        .andWhere('signal.created_at < :todayEnd', {
          todayEnd: todayEndTimestamp.toString(),
        })
        .orderBy('signal.created_at', 'DESC')
        .getOne();

      if (!signal) {
        this.logger.debug(`[/me] No signal found for FID ${fid} today`);
        return null;
      }

      // Map signal to DTO
      const todaySignalDto: TodaySignalDto = {
        signalId: signal.signal_id,
        ca: signal.ca,
        direction: signal.direction ? 'up' : 'down',
        timeframe: signal.duration_days, // Keep for backwards compatibility
        duration: signal.duration_days,
        entry_market_cap: Number(signal.entry_market_cap),
        resolved: signal.resolved,
        createdAt: Number(signal.created_at),
        expiresAt: Number(signal.expires_at),
        transactionHash: signal.transaction_hash,
        blockNumber: signal.block_number.toString(),
        token: signal.token
          ? {
              name: signal.token.name || 'Unknown Token',
              symbol: signal.token.symbol || 'UNKNOWN',
              image: signal.token.image || '',
            }
          : undefined,
      };

      this.logger.log(
        `[/me] Found today's signal for FID ${fid}: Signal ${signal.signal_id} (${todaySignalDto.direction} on ${todaySignalDto.token?.symbol})`,
      );
      return todaySignalDto;
    } catch (error) {
      this.logger.error(
        `[/me] Error fetching today's signal for FID ${fid}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private mapUserToProfileDto(user: User): UserProfileDto {
    return {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      pfpUrl: user.pfp_url,
      pfp_url: user.pfp_url, // alias for compatibility
      mfsScore: user.mfs_score || 0,
      mfs_score: user.mfs_score || 0, // alias for compatibility
      totalScore: user.total_score || 0,
      totalSignals: user.total_signals || 0,
      total_signals: user.total_signals || 0, // alias for compatibility
      activeSignals: user.active_signals || 0,
      active_signals: user.active_signals || 0, // alias for compatibility
      settledSignals: user.settled_signals || 0,
      settled_signals: user.settled_signals || 0, // alias for compatibility
      rank: user.rank,
      winRate: user.win_rate || 0,
      win_rate: user.win_rate || 0, // alias for compatibility
      isVerified: user.is_verified || false,
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
    };
  }

  private isUserCacheValid(user: User): boolean {
    if (!user.updated_at) return false;
    const lastUpdate = new Date(user.updated_at).getTime();
    const cacheExpiry = 30 * 60 * 1000; // 30 minutes
    return Date.now() - lastUpdate < cacheExpiry;
  }

  private calculatePriceChange(
    initialPrice: number | null,
    currentPrice: number | null,
  ): number | null {
    if (!initialPrice || !currentPrice || initialPrice === 0) return null;
    return ((currentPrice - initialPrice) / initialPrice) * 100;
  }

  private createStructuredError(
    error: any,
    fid: number,
    component: string,
  ): Error {
    const errorMessage = error.message || 'Unknown error';

    if (errorMessage.includes('NEYNAR_API_UNAVAILABLE')) {
      return new Error(`NEYNAR_API_UNAVAILABLE: ${errorMessage}`);
    }

    if (
      errorMessage.includes('database') ||
      errorMessage.includes('connection')
    ) {
      return new Error(`DATABASE_CONNECTION_FAILED: ${errorMessage}`);
    }

    if (errorMessage.includes('Redis') || errorMessage.includes('cache')) {
      return new Error(`REDIS_CACHE_UNAVAILABLE: ${errorMessage}`);
    }

    return new Error(`${component}_FAILED: ${errorMessage}`);
  }

  private logPerformanceMetrics(
    fid: number,
    duration: number,
    success: any,
  ): void {
    this.logger.log(`[/me] Performance metrics for FID ${fid}:`, {
      totalDuration: duration,
      userSuccess: success.userSuccess,
      feedSuccess: success.feedSuccess,
      tokensSuccess: success.tokensSuccess,
      leaderboardSuccess: success.leaderboardSuccess,
      todaySignalSuccess: success.todaySignalSuccess,
      timestamp: new Date().toISOString(),
    });

    // Log warning if response time exceeds target
    if (duration > 800) {
      this.logger.warn(
        `[/me] Response time exceeded target: ${duration}ms > 800ms for FID ${fid}`,
      );
    }
  }
}
