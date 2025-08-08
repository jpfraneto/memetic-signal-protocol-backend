import { Injectable, Logger } from '@nestjs/common';

export interface FarcasterUser {
  fid: number;
  username: string;
  avatar?: string;
}

@Injectable()
export class FarcasterUserService {
  private readonly logger = new Logger(FarcasterUserService.name);
  private readonly userCache = new Map<
    number,
    { user: FarcasterUser; expires: number }
  >();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  async getUserProfile(fid: number): Promise<FarcasterUser> {
    // Check cache first
    const cached = this.userCache.get(fid);
    if (cached && cached.expires > Date.now()) {
      return cached.user;
    }

    try {
      // For now, return a default user profile
      // TODO: Integrate with actual Farcaster API using existing Neynar SDK
      const user: FarcasterUser = {
        fid,
        username: `user${fid}`,
        avatar: undefined,
      };

      // Cache the result
      this.userCache.set(fid, {
        user,
        expires: Date.now() + this.CACHE_TTL,
      });

      return user;
    } catch (error) {
      this.logger.error(`Failed to fetch user profile for FID ${fid}:`, error);

      // Return fallback user
      return {
        fid,
        username: `user${fid}`,
        avatar: undefined,
      };
    }
  }

  async getUserProfiles(fids: number[]): Promise<Map<number, FarcasterUser>> {
    const userMap = new Map<number, FarcasterUser>();

    // Process in batches to avoid overwhelming the API
    const batchSize = 20;
    for (let i = 0; i < fids.length; i += batchSize) {
      const batch = fids.slice(i, i + batchSize);
      const promises = batch.map((fid) => this.getUserProfile(fid));

      try {
        const users = await Promise.allSettled(promises);
        users.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            userMap.set(batch[index], result.value);
          } else {
            // Fallback for failed requests
            userMap.set(batch[index], {
              fid: batch[index],
              username: `user${batch[index]}`,
              avatar: undefined,
            });
          }
        });
      } catch (error) {
        this.logger.error(`Failed to fetch user profiles batch:`, error);
        // Add fallback users for this batch
        batch.forEach((fid) => {
          userMap.set(fid, {
            fid,
            username: `user${fid}`,
            avatar: undefined,
          });
        });
      }
    }

    return userMap;
  }

  // Clear expired entries from cache
  private cleanupCache(): void {
    const now = Date.now();
    for (const [fid, cached] of this.userCache.entries()) {
      if (cached.expires <= now) {
        this.userCache.delete(fid);
      }
    }
  }
}
