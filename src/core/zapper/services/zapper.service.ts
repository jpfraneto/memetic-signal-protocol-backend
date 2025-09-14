import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../../cache/cache.service';

export interface ZapperTokenTrend {
  tokenAddress: string;
  chainId: number;
  token: {
    name: string;
    symbol: string;
    imageUrlV2: string;
    decimals: number;
    priceData: {
      price: number;
      priceChange24h: number;
      volume24h: number;
      marketCap: number;
      latestRelevantFarcasterSwaps?: {
        edges: Array<{
          node: {
            timestamp: number;
            volumeUsd: number;
            amount: number;
            isBuy: boolean;
            profile: {
              username: string;
              fid: number;
              metadata: {
                displayName: string;
                imageUrl: string;
              };
            };
          };
        }>;
      };
    };
  };
}

export interface ZapperTokenTrendsResponse {
  data: {
    tokenTrends: {
      edges: Array<{
        node: ZapperTokenTrend;
      }>;
    };
  };
}

@Injectable()
export class ZapperService {
  private readonly logger = new Logger(ZapperService.name);
  private readonly ZAPPER_API_URL = 'https://public.zapper.xyz/graphql';

  constructor(private readonly cacheService: CacheService) {}

  async getTrendingTokens(
    fid?: number,
    count: number = 8,
  ): Promise<ZapperTokenTrend[]> {
    try {
      // Check Redis cache first
      const cachedTokens = await this.cacheService.getTrendingTokens();
      if (cachedTokens && Array.isArray(cachedTokens)) {
        this.logger.log(
          `[REDIS CACHE HIT] Returning ${cachedTokens.length} cached trending tokens from Redis (requested: ${count})`,
        );
        return cachedTokens.slice(0, count);
      }

      this.logger.log(
        '[REDIS CACHE MISS] Fetching trending tokens from Zapper API (cache expired or empty)',
      );

      const query = `
        query TokenTrends($fid: Int!, $first: Int) {
          tokenTrends(fid: $fid, first: $first) {
            edges {
              node {
                tokenAddress
                chainId
                token {
                  name
                  symbol
                  imageUrlV2
                  decimals
                  priceData {
                    price
                    priceChange24h
                    volume24h
                    marketCap
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        fid: 16098, // Use provided fid or fallback to 1
        first: 50, // Fetch 50 tokens as requested
      };

      const response = await fetch(this.ZAPPER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': process.env.ZAPPER_API_KEY || '',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `Zapper API request failed: ${response.status} ${response.statusText}`,
        );
        throw new Error(`Zapper API request failed: ${response.status}`);
      }

      const data: ZapperTokenTrendsResponse = await response.json();

      if (!data.data?.tokenTrends?.edges) {
        this.logger.warn('No trending tokens found');
        return [];
      }

      const tokens = data.data.tokenTrends.edges.map((edge) => edge.node);

      // Cache the results in Redis for 30 minutes
      await this.cacheService.setTrendingTokens(tokens);

      this.logger.log(
        `[REDIS CACHE SET] Successfully fetched and cached ${tokens.length} trending tokens for 30 minutes`,
      );
      return tokens.slice(0, count);
    } catch (error) {
      this.logger.error('Failed to fetch trending tokens:', error);

      // Return cached data if available as fallback
      const cachedTokens = await this.cacheService.getTrendingTokens();
      if (cachedTokens && Array.isArray(cachedTokens)) {
        this.logger.warn(
          `[REDIS CACHE FALLBACK] Returning ${cachedTokens.length} cached tokens after API failure`,
        );
        return cachedTokens.slice(0, count);
      }

      return [];
    }
  }

  async clearCache(): Promise<void> {
    await this.cacheService.del('tokens:trending');
    this.logger.log('Zapper service cache cleared');
  }
}
