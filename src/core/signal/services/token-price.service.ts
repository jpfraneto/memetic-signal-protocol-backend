import { Injectable, Logger } from '@nestjs/common';
import { HistoricalDataManagerService } from './historical-data-manager.service';

interface TokenPrice {
  [address: string]: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface TokenInfo {
  price: number;
  marketCap: number;
  volume24h?: number;
  source?: string;
  attempts?: string[];
}

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private priceCache = new Map<
    string,
    { tokenInfo: TokenInfo; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private cacheStats = { hits: 0, misses: 0 };
  private readonly COINGECKO_API_URL = 'https://pro-api.coingecko.com/api/v3';
  private readonly REQUEST_DELAY = 1200;
  private lastRequestTime = 0;
  private lastFallbackResult: any = null;

  constructor(
    private historicalDataManager: HistoricalDataManagerService,
  ) {}

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.REQUEST_DELAY - timeSinceLastRequest),
      );
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchTokenMetadata(ca: string): Promise<any> {
    try {
      await this.rateLimit();
      const coinDataUrl = `${this.COINGECKO_API_URL}/coins/base/contract/${ca}`;

      const coinDataResponse = await fetch(coinDataUrl, {
        headers: {
          accept: 'application/json',
          'x-cg-pro-api-key': process.env.COINGECKO_API_KEY || '',
        },
      });

      if (coinDataResponse.ok) {
        const coinData = await coinDataResponse.json();
        return coinData;
      } else if (coinDataResponse.status === 429) {
        this.logger.warn('CoinGecko rate limit hit, waiting longer...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return await this.fetchTokenMetadata(ca);
      } else {
        this.logger.warn(
          `CoinGecko metadata fetch failed for ${ca}:`,
          coinDataResponse.status,
        );
        return null;
      }
    } catch (error) {
      this.logger.error(`Failed to fetch token metadata for ${ca}:`, error);
      return null;
    }
  }

  private async fetchHistoricalMarketData(
    coinId: string,
    timestamp: Date,
  ): Promise<{ price: number; marketCap: number }> {
    try {
      await this.rateLimit();

      const unixTimestamp = Math.floor(timestamp.getTime() / 1000);
      const fromTimestamp = unixTimestamp - 3600;
      const toTimestamp = unixTimestamp + 3600;

      const url = `${this.COINGECKO_API_URL}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`;
      this.logger.log('Fetching historical market data from:', url);

      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-cg-pro-api-key': process.env.COINGECKO_API_KEY || '',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as any;

        if (
          data.prices &&
          data.prices.length > 0 &&
          data.market_caps &&
          data.market_caps.length > 0
        ) {
          let closestPrice = data.prices[0];
          let closestMarketCap = data.market_caps[0];
          let closestTimeDiff = Math.abs(
            data.prices[0][0] - unixTimestamp * 1000,
          );

          for (let i = 0; i < data.prices.length; i++) {
            const pricePoint = data.prices[i];
            const marketCapPoint = data.market_caps[i];
            const timeDiff = Math.abs(pricePoint[0] - unixTimestamp * 1000);

            if (timeDiff < closestTimeDiff) {
              closestPrice = pricePoint;
              closestMarketCap = marketCapPoint;
              closestTimeDiff = timeDiff;
            }
          }

          this.logger.log(
            `Historical data found for ${coinId} at ${timestamp}:`,
            `Price: ${closestPrice[1]}, Market Cap: ${closestMarketCap[1]}`,
          );

          return {
            price: closestPrice[1],
            marketCap: closestMarketCap[1],
          };
        }
      } else if (response.status === 429) {
        this.logger.warn('CoinGecko rate limit hit for historical market data');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return await this.fetchHistoricalMarketData(coinId, timestamp);
      }

      this.logger.warn(
        `No historical market data found for ${coinId} at ${timestamp}`,
      );
      return { price: 0, marketCap: 0 };
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical market data for ${coinId}:`,
        error,
      );
      return { price: 0, marketCap: 0 };
    }
  }


  private async fetchFromDexScreener(ca: string): Promise<any> {
    try {
      const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/base/${ca}`;
      this.logger.log('Fetching from DexScreener:', dexScreenerUrl);

      const response = await fetch(dexScreenerUrl);

      if (!response.ok) {
        throw new Error(`DexScreener API returned ${response.status}`);
      }

      const data = await response.json();

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No token data found in DexScreener response');
      }

      const tokenData = data[0];

      return {
        name: tokenData.baseToken?.name,
        symbol: tokenData.baseToken?.symbol,
        market_data: {
          current_price: {
            usd: parseFloat(tokenData.priceUsd) || 0,
          },
          market_cap: {
            usd: tokenData.marketCap || 0,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch from DexScreener for ${ca}:`, error);
      throw error;
    }
  }

  async getTokenPrice(contractAddress: string): Promise<number> {
    const tokenInfo = await this.getTokenInfo(contractAddress);
    return tokenInfo?.price || 0;
  }

  async getTokenPrices(contractAddresses: string[]): Promise<TokenPrice> {
    const priceMap: TokenPrice = {};

    try {
      // Process addresses in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < contractAddresses.length; i += batchSize) {
        const batch = contractAddresses.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (address) => {
            try {
              priceMap[address] = await this.getTokenPrice(address);
            } catch (error) {
              this.logger.warn(`Failed to get price for ${address}:`, error);
              priceMap[address] = 0;
            }
          }),
        );

        // Small delay between batches
        if (i + batchSize < contractAddresses.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      this.logger.error('Error getting token prices:', error);
    }

    return priceMap;
  }

  async getTokenInfo(
    contractAddress: string,
    timestamp?: Date,
  ): Promise<TokenInfo | null> {
    try {
      const normalizedAddress = contractAddress.toLowerCase();
      const cacheKey = timestamp
        ? `${normalizedAddress}-${timestamp.getTime()}`
        : normalizedAddress;

      // Check cache first
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.cacheStats.hits++;
        return cached.tokenInfo;
      }

      this.cacheStats.misses++;

      this.logger.log(
        `Fetching token information for ${normalizedAddress}${timestamp ? ` at ${timestamp}` : ''}`,
      );

      // Step 1: Get token metadata from CoinGecko
      let coinData = await this.fetchTokenMetadata(normalizedAddress);

      // Step 2: If CoinGecko fails, try DexScreener as fallback (current price only)
      if (!coinData && !timestamp) {
        this.logger.log(
          `CoinGecko failed, trying DexScreener for ${normalizedAddress}`,
        );
        try {
          coinData = await this.fetchFromDexScreener(normalizedAddress);
        } catch (error) {
          this.logger.warn(
            `DexScreener also failed for ${normalizedAddress}:`,
            error,
          );
          // Return zeros if both fail
          const fallbackResult = { price: 0, marketCap: 0, volume24h: 0 };
          this.priceCache.set(cacheKey, {
            tokenInfo: fallbackResult,
            timestamp: Date.now(),
          });
          return fallbackResult;
        }
      }

      // Step 3: Get historical market data if timestamp provided
      let price = 0;
      let marketCap = 0;
      let volume24h = 0;

      if (timestamp) {
        // Use the historical data manager with Zapper as primary
        this.logger.log(
          `Fetching historical data for ${normalizedAddress} at ${timestamp} using Zapper-first fallback chain...`,
        );
        const fallbackResult = await this.historicalDataManager.fetchHistoricalDataWithFallbacks(
          normalizedAddress,
          timestamp,
        );
        
        price = fallbackResult.price;
        marketCap = fallbackResult.marketCap;
        volume24h = 0;
        
        // Store the fallback result for the resolution service to access
        this.lastFallbackResult = fallbackResult;
      } else if (coinData?.market_data) {
        // Use current price data
        price = coinData.market_data.current_price?.usd || 0;
        marketCap = coinData.market_data.market_cap?.usd || 0;
        volume24h = coinData.market_data.total_volume?.usd || 0;
      }

      // If no data found, return zeros (fallback)
      if (!coinData) {
        this.logger.warn(
          `No token data found for ${normalizedAddress}, returning zeros`,
        );
        const fallbackResult = { price: 0, marketCap: 0, volume24h: 0 };
        this.priceCache.set(cacheKey, {
          tokenInfo: fallbackResult,
          timestamp: Date.now(),
        });
        return fallbackResult;
      }

      const result: TokenInfo = {
        price,
        marketCap,
        volume24h,
      };

      // Cache the result
      this.priceCache.set(cacheKey, {
        tokenInfo: result,
        timestamp: Date.now(),
      });

      this.logger.log(`Token information complete for ${normalizedAddress}:`, {
        price,
        marketCap,
        volume24h,
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Error getting token info for ${contractAddress}:`,
        error,
      );
      // Return zeros on any error
      return { price: 0, marketCap: 0, volume24h: 0 };
    }
  }

  calculatePnL(entryPrice: number, exitPrice: number): number {
    if (entryPrice === 0) return 0;
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }

  cleanupCache(): void {
    const now = Date.now();
    for (const [key, data] of this.priceCache.entries()) {
      if (now - data.timestamp > this.CACHE_TTL) {
        this.priceCache.delete(key);
      }
    }
  }

  getCacheStats(): CacheStats {
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      size: this.priceCache.size,
    };
  }

  /**
   * Get the result of the last historical data resolution attempt
   * Used by SignalResolutionService to track data sources
   */
  getLastResolutionResult(): any {
    return this.lastFallbackResult;
  }
}
