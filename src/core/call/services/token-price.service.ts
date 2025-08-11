import { Injectable, Logger } from '@nestjs/common';

export interface TokenPrice {
  address: string;
  price: number;
  timestamp: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  image?: string;
  marketCap?: number;
  volume24h?: number;
}

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private readonly priceCache = new Map<
    string,
    { price: TokenPrice; expires: number }
  >();
  private readonly tokenInfoCache = new Map<
    string,
    { info: TokenInfo; expires: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes for prices
  private readonly INFO_CACHE_TTL = 60 * 60 * 1000; // 1 hour for token info
  private readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
  private readonly BASE_NETWORK_PLATFORM_ID = 'base';

  private lastRequestTime = 0;
  private readonly REQUEST_DELAY = 1200; // 1.2 seconds between requests (50 calls/min limit)

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

  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    const cacheKey = tokenAddress.toLowerCase();

    // Check cache first
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.price.price;
    }

    try {
      await this.rateLimit();

      // Try CoinGecko API for Base network tokens
      const url = `${this.COINGECKO_API_URL}/simple/token_price/${this.BASE_NETWORK_PLATFORM_ID}?contract_addresses=${tokenAddress}&vs_currencies=usd`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinGecko rate limit hit, waiting...');
          await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
          return await this.getTokenPrice(tokenAddress);
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const tokenData = data[tokenAddress.toLowerCase()];

      if (!tokenData || !tokenData.usd) {
        this.logger.warn(`No price data found for token ${tokenAddress}`);
        return null;
      }

      const price = tokenData.usd;
      const tokenPrice: TokenPrice = {
        address: tokenAddress,
        price: price,
        timestamp: Date.now(),
      };

      // Cache the result
      this.priceCache.set(cacheKey, {
        price: tokenPrice,
        expires: Date.now() + this.CACHE_TTL,
      });

      return price;
    } catch (error) {
      this.logger.error(
        `Failed to fetch price for token ${tokenAddress}:`,
        error,
      );
      return null;
    }
  }

  async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    // Batch API call to reduce requests
    try {
      await this.rateLimit();

      const contractAddresses = tokenAddresses
        .map((addr) => addr.toLowerCase())
        .join(',');
      const url = `${this.COINGECKO_API_URL}/simple/token_price/${this.BASE_NETWORK_PLATFORM_ID}?contract_addresses=${contractAddresses}&vs_currencies=usd`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      tokenAddresses.forEach((address) => {
        const tokenData = data[address.toLowerCase()];
        if (tokenData && tokenData.usd) {
          priceMap.set(address.toLowerCase(), tokenData.usd);

          // Cache individual results
          const tokenPrice: TokenPrice = {
            address: address,
            price: tokenData.usd,
            timestamp: Date.now(),
          };

          this.priceCache.set(address.toLowerCase(), {
            price: tokenPrice,
            expires: Date.now() + this.CACHE_TTL,
          });
        }
      });
    } catch (error) {
      this.logger.error('Failed to fetch token prices batch:', error);

      // Fallback to individual requests
      const promises = tokenAddresses.map(async (address) => {
        const price = await this.getTokenPrice(address);
        return { address: address.toLowerCase(), price };
      });

      const results = await Promise.allSettled(promises);
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.price !== null) {
          priceMap.set(result.value.address, result.value.price);
        }
      });
    }

    return priceMap;
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    const cacheKey = tokenAddress.toLowerCase();

    // Check cache first
    const cached = this.tokenInfoCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.info;
    }

    try {
      await this.rateLimit();

      const url = `${this.COINGECKO_API_URL}/coins/${this.BASE_NETWORK_PLATFORM_ID}/contract/${tokenAddress}`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`Token info not found for ${tokenAddress}`);
          return null;
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      const tokenInfo: TokenInfo = {
        address: tokenAddress,
        symbol: data.symbol?.toUpperCase() || 'UNKNOWN',
        name: data.name || 'Unknown Token',
        image: data.image?.large || data.image?.small,
        marketCap: data.market_data?.market_cap?.usd,
        volume24h: data.market_data?.total_volume?.usd,
      };

      // Cache the result
      this.tokenInfoCache.set(cacheKey, {
        info: tokenInfo,
        expires: Date.now() + this.INFO_CACHE_TTL,
      });

      return tokenInfo;
    } catch (error) {
      this.logger.error(
        `Failed to fetch token info for ${tokenAddress}:`,
        error,
      );
      return null;
    }
  }

  calculatePnL(
    callPrice: number,
    currentPrice: number,
    direction: 'up' | 'down',
  ): number {
    if (direction === 'up') {
      return ((currentPrice - callPrice) / callPrice) * 100;
    } else {
      return ((callPrice - currentPrice) / callPrice) * 100;
    }
  }

  // Clear expired entries from cache
  cleanupCache(): void {
    const now = Date.now();

    // Cleanup price cache
    for (const [address, cached] of this.priceCache.entries()) {
      if (cached.expires <= now) {
        this.priceCache.delete(address);
      }
    }

    // Cleanup token info cache
    for (const [address, cached] of this.tokenInfoCache.entries()) {
      if (cached.expires <= now) {
        this.tokenInfoCache.delete(address);
      }
    }
  }

  getCacheStats(): { priceCache: number; tokenInfoCache: number } {
    return {
      priceCache: this.priceCache.size,
      tokenInfoCache: this.tokenInfoCache.size,
    };
  }
}
