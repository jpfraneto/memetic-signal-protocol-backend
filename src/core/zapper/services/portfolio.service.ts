import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface PortfolioTokenBalance {
  balance: string;
  balanceRaw: string;
  balanceUSD: number;
  symbol: string;
  name: string;
}

export interface PortfolioV2Response {
  portfolioV2: {
    tokenBalances: {
      byToken: {
        edges: Array<{
          node: PortfolioTokenBalance;
        }>;
      };
    };
  };
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly ZAPPER_API_URL = 'https://public.zapper.xyz/graphql';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  private portfolioCache: {
    data: PortfolioTokenBalance[];
    timestamp: number;
    addresses: string[];
    networks: string[];
  } | null = null;

  async fetchPortfolio(
    addresses: string[],
    networks: string[] = ['ETHEREUM_MAINNET'],
  ): Promise<PortfolioTokenBalance[]> {
    try {
      // Check cache first
      if (
        this.portfolioCache &&
        this.portfolioCache.addresses.join(',') === addresses.join(',') &&
        this.portfolioCache.networks.join(',') === networks.join(',') &&
        Date.now() - this.portfolioCache.timestamp < this.CACHE_TTL
      ) {
        this.logger.log(
          `Returning cached portfolio data for addresses: ${addresses.join(', ')}`,
        );
        return this.portfolioCache.data;
      }

      this.logger.log(
        `Fetching portfolio data for addresses: ${addresses.join(', ')}`,
      );

      const query = `
        query PortfolioV2($addresses: [Address!]!, $networks: [Network!]) {
          portfolioV2(addresses: $addresses, networks: $networks) {
            tokenBalances {
              byToken {
                edges {
                  node {
                    balance
                    balanceRaw
                    balanceUSD
                    symbol
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const response = await axios({
        url: this.ZAPPER_API_URL,
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': process.env.ZAPPER_API_KEY || '',
        },
        data: {
          query,
          variables: {
            addresses,
            networks,
          },
        },
      });

      if (response.data.errors) {
        throw new Error(
          `GraphQL Errors: ${JSON.stringify(response.data.errors)}`,
        );
      }

      const data: PortfolioV2Response = response.data.data;

      if (!data.portfolioV2?.tokenBalances?.byToken?.edges) {
        this.logger.warn(
          `No portfolio data found for addresses: ${addresses.join(', ')}`,
        );
        return [];
      }

      const tokens = data.portfolioV2.tokenBalances.byToken.edges.map(
        (edge) => edge.node,
      );

      // Cache the results
      this.portfolioCache = {
        data: tokens,
        timestamp: Date.now(),
        addresses,
        networks,
      };

      this.logger.log(
        `Successfully fetched ${tokens.length} token balances for addresses: ${addresses.join(', ')}`,
      );
      return tokens;
    } catch (error) {
      this.logger.error(
        `Failed to fetch portfolio for addresses ${addresses.join(', ')}:`,
        error,
      );

      // Return cached data if available, even if expired, as fallback
      if (
        this.portfolioCache &&
        this.portfolioCache.addresses.join(',') === addresses.join(',') &&
        this.portfolioCache.networks.join(',') === networks.join(',')
      ) {
        this.logger.warn('Returning expired cache data as fallback');
        return this.portfolioCache.data;
      }

      return [];
    }
  }

  async getPortfolioForUser(
    walletAddress: string,
    networks?: string[],
  ): Promise<PortfolioTokenBalance[]> {
    return this.fetchPortfolio([walletAddress], networks);
  }

  async getPortfolioForMultipleUsers(
    walletAddresses: string[],
    networks?: string[],
  ): Promise<PortfolioTokenBalance[]> {
    return this.fetchPortfolio(walletAddresses, networks);
  }

  clearCache(): void {
    this.portfolioCache = null;
    this.logger.log('Portfolio service cache cleared');
  }
}
