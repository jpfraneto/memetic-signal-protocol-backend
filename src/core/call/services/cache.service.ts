import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    const expires = Date.now() + ttlMs;
    this.cache.set(key, { data, expires });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // Clean expired entries
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  // Cache keys for different data types
  static getUserProfileKey(fid: number): string {
    return `user:profile:${fid}`;
  }

  static getTokenPriceKey(tokenAddress: string): string {
    return `token:price:${tokenAddress.toLowerCase()}`;
  }

  static getCallsFeedKey(limit: number, offset: number, fid?: number): string {
    const fidPart = fid ? `:fid:${fid}` : '';
    return `calls:feed:${limit}:${offset}${fidPart}`;
  }
}
