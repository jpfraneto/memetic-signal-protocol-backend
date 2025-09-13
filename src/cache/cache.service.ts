import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  USER_PROFILE: 2 * 60 * 1000,    // 2 minutes
  LEADERBOARD: 5 * 60 * 1000,     // 5 minutes
  USER_SIGNALS: 3 * 60 * 1000,    // 3 minutes
  TRENDING_TOKENS: 30 * 60 * 1000, // 30 minutes
  SIGNAL_FEED: 2 * 60 * 1000,     // 2 minutes
} as const;

// Cache key prefixes
export const CACHE_KEYS = {
  USER_PROFILE: 'user:profile',
  USER_SIGNALS: 'user:signals',
  LEADERBOARD: 'leaderboard',
  LEADERBOARD_STATS: 'leaderboard:stats',
  TRENDING_TOKENS: 'tokens:trending',
  SIGNAL_FEED: 'signals:feed',
  USER_RANKING: 'user:ranking',
} as const;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cacheStats = {
    hits: 0,
    misses: 0,
    lastReset: Date.now()
  };

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // Start periodic monitoring
    this.startCacheMonitoring();
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.cacheManager.get<T>(key);
      if (result) {
        this.cacheStats.hits++;
        this.logger.debug(`Cache HIT for key: ${key}`);
      } else {
        this.cacheStats.misses++;
        this.logger.debug(`Cache MISS for key: ${key}`);
      }
      return result;
    } catch (error) {
      this.cacheStats.misses++;
      this.logger.error(`Cache GET error for key ${key}:`, error);
      return undefined;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(`Cache SET for key: ${key} (TTL: ${ttl || 'default'}ms)`);
    } catch (error) {
      this.logger.error(`Cache SET error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DEL for key: ${key}`);
    } catch (error) {
      this.logger.error(`Cache DEL error for key ${key}:`, error);
    }
  }

  async reset(): Promise<void> {
    try {
      await this.cacheManager.reset();
      this.logger.debug('Cache RESET - all keys cleared');
    } catch (error) {
      this.logger.error('Cache RESET error:', error);
    }
  }

  generateKey(prefix: string, ...params: (string | number)[]): string {
    return `${prefix}:${params.join(':')}`;
  }

  // Specific caching methods for user profile system
  
  async getUserProfile(fid: number) {
    const key = this.generateKey(CACHE_KEYS.USER_PROFILE, fid);
    return await this.get(key);
  }

  async setUserProfile(fid: number, data: any) {
    const key = this.generateKey(CACHE_KEYS.USER_PROFILE, fid);
    await this.set(key, data, CACHE_TTL.USER_PROFILE);
  }

  async invalidateUserProfile(fid: number) {
    const key = this.generateKey(CACHE_KEYS.USER_PROFILE, fid);
    await this.del(key);
  }

  async getUserSignals(fid: number, page: number = 1, limit: number = 20, status?: string) {
    const key = this.generateKey(CACHE_KEYS.USER_SIGNALS, fid, page, limit, status || 'all');
    return await this.get(key);
  }

  async setUserSignals(fid: number, data: any, page: number = 1, limit: number = 20, status?: string) {
    const key = this.generateKey(CACHE_KEYS.USER_SIGNALS, fid, page, limit, status || 'all');
    await this.set(key, data, CACHE_TTL.USER_SIGNALS);
  }

  async invalidateUserSignals(fid: number) {
    // When signals change, we need to invalidate all cached pages for this user
    const pattern = `${CACHE_KEYS.USER_SIGNALS}:${fid}:*`;
    await this.invalidatePattern(pattern);
  }

  async getLeaderboard(page: number = 1, limit: number = 20, minSettledSignals: number = 5) {
    const key = this.generateKey(CACHE_KEYS.LEADERBOARD, page, limit, minSettledSignals);
    return await this.get(key);
  }

  async setLeaderboard(data: any, page: number = 1, limit: number = 20, minSettledSignals: number = 5) {
    const key = this.generateKey(CACHE_KEYS.LEADERBOARD, page, limit, minSettledSignals);
    await this.set(key, data, CACHE_TTL.LEADERBOARD);
  }

  async invalidateLeaderboard() {
    const pattern = `${CACHE_KEYS.LEADERBOARD}:*`;
    await this.invalidatePattern(pattern);
  }

  async getLeaderboardStats() {
    return await this.get(CACHE_KEYS.LEADERBOARD_STATS);
  }

  async setLeaderboardStats(data: any) {
    await this.set(CACHE_KEYS.LEADERBOARD_STATS, data, CACHE_TTL.LEADERBOARD);
  }

  async getTrendingTokens() {
    const key = CACHE_KEYS.TRENDING_TOKENS;
    return await this.get(key);
  }

  async setTrendingTokens(data: any) {
    const key = CACHE_KEYS.TRENDING_TOKENS;
    await this.set(key, data, CACHE_TTL.TRENDING_TOKENS);
  }

  async getSignalFeed(page: number = 1, limit: number = 50) {
    const key = this.generateKey(CACHE_KEYS.SIGNAL_FEED, page, limit);
    return await this.get(key);
  }

  async setSignalFeed(data: any, page: number = 1, limit: number = 50) {
    const key = this.generateKey(CACHE_KEYS.SIGNAL_FEED, page, limit);
    await this.set(key, data, CACHE_TTL.SIGNAL_FEED);
  }

  async invalidateSignalFeed() {
    const pattern = `${CACHE_KEYS.SIGNAL_FEED}:*`;
    await this.invalidatePattern(pattern);
  }

  async getSignalsByCA(ca: string, page: number = 1, limit: number = 20, status?: string) {
    const key = this.generateKey('signals:ca', ca, page, limit, status || 'all');
    return await this.get(key);
  }

  async setSignalsByCA(ca: string, data: any, page: number = 1, limit: number = 20, status?: string) {
    const key = this.generateKey('signals:ca', ca, page, limit, status || 'all');
    await this.set(key, data, CACHE_TTL.USER_SIGNALS);
  }

  async invalidateSignalsByCA(ca: string) {
    // When signals for a CA change, invalidate all cached pages for this CA
    const pattern = `signals:ca:${ca}:*`;
    await this.invalidatePattern(pattern);
  }

  // Cache invalidation when signals are resolved
  async onSignalResolved(fid: number) {
    this.logger.log(`Invalidating caches for signal resolution - user FID: ${fid}`);
    
    // Invalidate user-specific caches
    await this.invalidateUserProfile(fid);
    await this.invalidateUserSignals(fid);
    
    // Invalidate global caches that depend on signal data
    await this.invalidateLeaderboard();
    await this.invalidateSignalFeed();
    await this.del(CACHE_KEYS.LEADERBOARD_STATS);
  }

  // Helper method to invalidate cache keys matching a pattern
  private async invalidatePattern(pattern: string) {
    // Note: This is a simplified implementation
    // In a real Redis setup, you'd use Redis SCAN with pattern matching
    this.logger.debug(`Invalidating cache pattern: ${pattern}`);
    
    // For now, we'll just log the pattern
    // A full implementation would require Redis-specific commands
    // or storing keys in sets for efficient pattern-based invalidation
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message?: string }> {
    try {
      const testKey = 'health:check';
      const testValue = Date.now().toString();
      
      await this.set(testKey, testValue, 1000);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      
      if (retrieved === testValue) {
        return { status: 'healthy' };
      } else {
        return { status: 'unhealthy', message: 'Cache read/write mismatch' };
      }
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  // Start cache monitoring - logs every 1 minute
  private startCacheMonitoring(): void {
    setInterval(async () => {
      const uptime = Math.floor((Date.now() - this.cacheStats.lastReset) / 1000);
      const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
      const hitRate = totalRequests > 0 ? ((this.cacheStats.hits / totalRequests) * 100).toFixed(2) : '0.00';
      
      // Check health
      const health = await this.healthCheck();
      
      // Special check for trending tokens cache
      const trendingTokensStatus = await this.getTrendingTokens();
      const hasTrendingTokens = trendingTokensStatus && Array.isArray(trendingTokensStatus);
      
      this.logger.log(
        `[REDIS MONITOR] Uptime: ${uptime}s | Hits: ${this.cacheStats.hits} | Misses: ${this.cacheStats.misses} | Hit Rate: ${hitRate}% | Health: ${health.status} | Trending Tokens Cached: ${hasTrendingTokens ? 'YES' : 'NO'}${hasTrendingTokens ? ` (${trendingTokensStatus.length} tokens)` : ''}`
      );
    }, 60000); // Every 1 minute
  }
}
