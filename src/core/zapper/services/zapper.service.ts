import { Injectable, Logger } from '@nestjs/common';

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
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  private tokenTrendsCache: {
    data: ZapperTokenTrend[];
    timestamp: number;
    fid: number;
  } | null = null;

  async getTrendingTokens(
    fid: number,
    count: number = 8,
  ): Promise<ZapperTokenTrend[]> {
    try {
      // Check cache first
      if (
        this.tokenTrendsCache &&
        this.tokenTrendsCache.fid === fid &&
        Date.now() - this.tokenTrendsCache.timestamp < this.CACHE_TTL
      ) {
        this.logger.log(`Returning cached trending tokens for FID ${fid}`);
        return this.tokenTrendsCache.data.slice(0, count);
      }

      this.logger.log(
        `Fetching trending tokens for FID ${fid} from Zapper API`,
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
                    latestRelevantFarcasterSwaps(fid: $fid, first: 1) {
                      edges {
                        node {
                          timestamp
                          volumeUsd
                          amount
                          isBuy
                          profile {
                            username
                            fid
                            metadata {
                              displayName
                              imageUrl
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        fid,
        first: Math.max(count, 30), // Always fetch at least 16 to have a good selection
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
        this.logger.warn(`No trending tokens found for FID ${fid}`);
        return [];
      }

      const tokens = data.data.tokenTrends.edges.map((edge) => edge.node);
      this.logger.log('FETCHED TOKENS', tokens);

      // Cache the results
      this.tokenTrendsCache = {
        data: tokens,
        timestamp: Date.now(),
        fid,
      };

      this.logger.log(
        `Successfully fetched ${tokens.length} trending tokens for FID ${fid}`,
      );
      return tokens.slice(0, count);
    } catch (error) {
      this.logger.error(
        `Failed to fetch trending tokens for FID ${fid}:`,
        error,
      );

      // Return cached data if available, even if expired, as fallback
      if (this.tokenTrendsCache && this.tokenTrendsCache.fid === fid) {
        this.logger.warn('Returning expired cache data as fallback');
        return this.tokenTrendsCache.data.slice(0, count);
      }

      return [];
    }
  }

  clearCache(): void {
    this.tokenTrendsCache = null;
    this.logger.log('Zapper service cache cleared');
  }
}
