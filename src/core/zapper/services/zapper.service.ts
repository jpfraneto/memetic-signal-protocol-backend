import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../../cache/cache.service';

export interface ZapperTokenTrend {
  token: {
    address: string;
    chainId: number;
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
      this.logger.log('[DEBUG] Making Zapper API request with:', {
        url: this.ZAPPER_API_URL,
        fid: 99,
        first: 20,
        hasApiKey: !!process.env.ZAPPER_API_KEY,
        apiKeyLength: process.env.ZAPPER_API_KEY?.length || 0,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': process.env.ZAPPER_API_KEY
            ? '[PRESENT]'
            : '[MISSING]',
        },
      });

      const query = `
        query TokenTrends($fid: Int!, $first: Int) {
          tokenTrends(fid: $fid, first: $first) {
            edges {
              node {
                token {
                  address
                  chainId
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
        fid: 99, // Hardcoded FID as requested
        first: 20, // Fetch 20 tokens
      };

      this.logger.log('[DEBUG] GraphQL Query:', query);
      this.logger.log('[DEBUG] GraphQL Variables:', variables);

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

      this.logger.log('[DEBUG] Response status:', response.status);
      this.logger.log(
        '[DEBUG] Response headers:',
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[DEBUG] Zapper API request failed: ${response.status} ${response.statusText}`,
          {
            responseBody: errorText,
            url: this.ZAPPER_API_URL,
            requestHeaders: {
              'Content-Type': 'application/json',
              'x-zapper-api-key': process.env.ZAPPER_API_KEY
                ? '[PRESENT]'
                : '[MISSING]',
            },
          },
        );
        throw new Error(`Zapper API request failed: ${response.status}`);
      }

      const data: ZapperTokenTrendsResponse = await response.json();

      this.logger.log(
        '[DEBUG] Raw Zapper API Response:',
        JSON.stringify(data, null, 2),
      );

      if (!data.data?.tokenTrends?.edges) {
        this.logger.warn('[DEBUG] No trending tokens found in response:', {
          hasData: !!data.data,
          hasTokenTrends: !!data.data?.tokenTrends,
          hasEdges: !!data.data?.tokenTrends?.edges,
          dataKeys: data.data ? Object.keys(data.data) : null,
        });
        return [];
      }

      const tokens = data.data.tokenTrends.edges.map((edge) => edge.node);

      this.logger.log('[DEBUG] Processed trending tokens:', {
        totalTokens: tokens.length,
        sampleToken: tokens[0]
          ? {
              name: tokens[0].token?.name,
              symbol: tokens[0].token?.symbol,
              address: tokens[0].token?.address,
              chainId: tokens[0].token?.chainId,
              price: tokens[0].token?.priceData?.price,
            }
          : null,
        allTokenNames: tokens.map((t) => t.token?.name).filter(Boolean),
      });

      // Cache the results in Redis for 5 minutes
      await this.cacheService.setTrendingTokens(tokens);

      this.logger.log(
        `[REDIS CACHE SET] Successfully fetched and cached ${tokens.length} trending tokens for 5 minutes`,
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

  async getTokenByAddress(contractAddress: string): Promise<any> {
    try {
      this.logger.log(`Fetching token data from Zapper for ${contractAddress}`);

      const query = `
        query TokenPriceData($address: Address!, $chainId: Int!) {
          fungibleTokenV2(address: $address, chainId: $chainId) {
            address
            symbol
            name
            decimals
            imageUrlV2
            priceData {
              marketCap
            }
          }
        }
      `;

      const variables = {
        address: contractAddress,
        chainId: 8453, // Base mainnet chain ID
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
        this.logger.warn(`Zapper API request failed: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (!data.data?.fungibleTokenV2) {
        this.logger.warn(
          `No token data found in Zapper response for ${contractAddress}`,
        );
        return null;
      }

      const token = data.data.fungibleTokenV2;

      // Transform to match expected format
      return {
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        image: {
          large: token.imageUrlV2,
          small: token.imageUrlV2,
          thumb: token.imageUrlV2,
        },
        market_cap: token.priceData?.marketCap || 0,
        detail_platforms: {
          base: {
            decimal_place: token.decimals || 18,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch token from Zapper for ${contractAddress}:`,
        error,
      );
      return null;
    }
  }
}
