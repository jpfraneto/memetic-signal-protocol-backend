import { Injectable, Logger } from '@nestjs/common';

export interface TokenPrice {
  address: string;
  price: number;
  timestamp: number;
}

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private readonly priceCache = new Map<
    string,
    { price: TokenPrice; expires: number }
  >();
  private readonly CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    const cacheKey = tokenAddress.toLowerCase();

    // Check cache first
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.price.price;
    }

    try {
      // TODO: Integrate with actual price API (CoinGecko, DEX APIs, etc.)
      // For now, return a mock price
      const mockPrice = Math.random() * 100 + 1; // Random price between 1-101

      const tokenPrice: TokenPrice = {
        address: tokenAddress,
        price: mockPrice,
        timestamp: Date.now(),
      };

      // Cache the result
      this.priceCache.set(cacheKey, {
        price: tokenPrice,
        expires: Date.now() + this.CACHE_TTL,
      });

      return mockPrice;
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

    // Process in parallel with rate limiting
    const promises = tokenAddresses.map(async (address) => {
      const price = await this.getTokenPrice(address);
      return { address: address.toLowerCase(), price };
    });

    try {
      const results = await Promise.allSettled(promises);
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.price !== null) {
          priceMap.set(result.value.address, result.value.price);
        }
      });
    } catch (error) {
      this.logger.error('Failed to fetch token prices batch:', error);
    }

    return priceMap;
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
  private cleanupCache(): void {
    const now = Date.now();
    for (const [address, cached] of this.priceCache.entries()) {
      if (cached.expires <= now) {
        this.priceCache.delete(address);
      }
    }
  }
}
