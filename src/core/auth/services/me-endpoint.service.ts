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
import NeynarService from '../../../utils/neynar';

// DTOs
import {
  MeEndpointResponseDto,
  UserProfileDto,
  FeaturedTokenDto,
  LeaderboardsDto,
  LeaderboardUserDto,
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
      const [feedData, featuredTokens, leaderboards] = await Promise.allSettled(
        [
          this.getFeedDataWithFallback(),
          this.getFeaturedTokensWithFallback(fid),
          this.getLeaderboardsWithFallback(),
        ],
      );

      const response: MeEndpointResponseDto = {
        success: true,
        user: this.mapUserToProfileDto(user),
        feedData:
          feedData.status === 'fulfilled'
            ? feedData.value
            : { signals: [], totalCount: 0 },
        featuredTokens:
          featuredTokens.status === 'fulfilled' ? featuredTokens.value : [],
        leaderboards:
          leaderboards.status === 'fulfilled'
            ? leaderboards.value
            : { topByScore: [], mostSignals: [], champion: null },
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
        leaderboardSuccess: leaderboards.status === 'fulfilled',
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
          s.transaction_hash,  -- Changed from s.id
          s.fid,
          s.ca,
          s.mc,
          s.direction,
          s.duration,
          s.timestamp,
          s.status,
          s.expires_at,
          s.block_number,
          u.username,
          u.display_name,
          u.pfp_url,
          t.name as token_name,
          t.symbol as token_symbol,
          t.image as token_image,
          ps_initial.market_cap as initial_market_cap,
          ps_current.market_cap as current_market_cap
        FROM signals s
        LEFT JOIN users u ON s.fid = u.fid
        LEFT JOIN tokens t ON LOWER(s.ca) = LOWER(t.ca)
        LEFT JOIN price_snapshots ps_initial ON (
          LOWER(ps_initial.token_address) = LOWER(s.ca) 
          AND ps_initial.snapshot_at <= s.timestamp  -- Direct bigint comparison
          AND ps_initial.snapshot_at = (
            SELECT MAX(snapshot_at) 
            FROM price_snapshots 
            WHERE LOWER(token_address) = LOWER(s.ca) 
              AND snapshot_at <= s.timestamp  -- Direct bigint comparison
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
        ORDER BY s.timestamp DESC
        LIMIT 50
      `;

      const results = await queryRunner.query(query);
      const totalCountQuery = await queryRunner.query(
        'SELECT COUNT(*) as count FROM signals',
      );
      const totalCount = parseInt(totalCountQuery[0].count);
      console.log('THE RESULTS ARE', results);

      const signals: Signal[] = results.map((row: any) => ({
        transaction_hash: row.transaction_hash,
        fid: row.fid,
        username: row.username || 'Unknown',
        display_name: row.display_name,
        pfp_url: row.pfp_url,
        ca: row.ca,
        name: row.token_name || 'Unknown Token',
        symbol: row.token_symbol || 'UNKNOWN',
        image: row.token_image || '',
        direction: row.direction,
        duration: row.duration,
        timestamp: row.timestamp.toString(),
        status: row.status,
        expires_at: row.expires_at.toString(),
        mc: row.mc,
        current_market_cap: row.current_market_cap,
        price_change: this.calculatePriceChange(row.mc, row.current_market_cap),
        block_number: row.block_number.toString(),
        token: row.token as Token,
        user: row.user as User,
      }));

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
          'signal.transaction_hash',
          'signal.fid',
          'signal.ca',
          'signal.mc',
          'signal.direction',
          'signal.duration',
          'signal.timestamp',
          'signal.status',
          'signal.expires_at',
          'signal.block_number',
          'user.username',
          'user.display_name',
          'user.pfp_url',
          'token.name',
          'token.symbol',
          'token.image',
        ])
        .orderBy('signal.timestamp', 'DESC')
        .limit(50)
        .getMany();

      const totalCount = await this.signalRepository.count();

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
    const cacheKey = `tokens:trending:${fid}`;
    const cachedTokens =
      await this.cacheManager.get<FeaturedTokenDto[]>(cacheKey);

    if (cachedTokens) {
      this.logger.log('[/me] Using cached trending tokens');
      return cachedTokens;
    }

    try {
      const trendingTokens = await this.zapperService.getTrendingTokens(fid, 8);
      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, trendingTokens, 5 * 60 * 1000);
      return trendingTokens;
    } catch (error) {
      this.logger.error(
        '[/me] Zapper API failed, trying cached fallback:',
        error,
      );

      // Try global cache as fallback
      const globalCacheKey = 'tokens:trending:global';
      const globalCached =
        await this.cacheManager.get<FeaturedTokenDto[]>(globalCacheKey);

      if (globalCached) {
        return globalCached;
      }

      // Return empty array if all fails
      return [];
    }
  }

  /**
   * Get leaderboards with caching and fallback
   */
  async getLeaderboardsWithFallback(): Promise<LeaderboardsDto> {
    const cacheKey = 'leaderboards:all';
    const cachedLeaderboards =
      await this.cacheManager.get<LeaderboardsDto>(cacheKey);

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
      return { topByScore: [], mostSignals: [], champion: null };
    }
  }

  /**
   * Get leaderboard data with optimized queries
   */
  async getLeaderboards(): Promise<LeaderboardsDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Execute all leaderboard queries in parallel
      const [topByScoreResults, mostSignalsResults, championResults] =
        await Promise.all([
          // Top 3 by score
          queryRunner.query(`
          SELECT fid, username, display_name, pfp_url, total_score 
          FROM users 
          WHERE total_score > 0 
          ORDER BY total_score DESC 
          LIMIT 3
        `),
          // Top 3 by signal count
          queryRunner.query(`
          SELECT fid, username, display_name, pfp_url, total_signals 
          FROM users 
          WHERE total_signals > 0 
          ORDER BY total_signals DESC 
          LIMIT 3
        `),
          // Champion (highest score)
          queryRunner.query(`
          SELECT fid, username, display_name, pfp_url, total_score, total_signals, win_rate 
          FROM users 
          WHERE total_score > 0 
          ORDER BY total_score DESC 
          LIMIT 1
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

      const mostSignals: LeaderboardUserDto[] = mostSignalsResults.map(
        (row: any) => ({
          fid: row.fid,
          username: row.username,
          displayName: row.display_name,
          pfpUrl: row.pfp_url,
          totalSignals: row.total_signals,
        }),
      );

      const champion: LeaderboardUserDto | null =
        championResults.length > 0
          ? {
              fid: championResults[0].fid,
              username: championResults[0].username,
              displayName: championResults[0].display_name,
              pfpUrl: championResults[0].pfp_url,
              totalScore: championResults[0].total_score,
              totalSignals: championResults[0].total_signals,
              winRate: championResults[0].win_rate,
            }
          : null;

      return { topByScore, mostSignals, champion };
    } finally {
      await queryRunner.release();
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
      totalScore: user.total_score || 0,
      totalSignals: user.total_signals || 0,
      activeSignals: user.active_signals || 0,
      rank: user.rank,
      winRate: user.win_rate || 0,
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
