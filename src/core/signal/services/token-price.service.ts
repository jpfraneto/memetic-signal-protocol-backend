import { Injectable, Logger } from '@nestjs/common';
import { SimpleTokenService } from '../../tokens/services/simple-token.service';

interface TokenPrice {
  [address: string]: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private priceCache = new Map<string, { price: number; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cacheStats = { hits: 0, misses: 0 };

  constructor(private readonly simpleTokenService: SimpleTokenService) {}

  async getTokenPrice(contractAddress: string): Promise<number> {
    try {
      // Check cache first
      const cached = this.priceCache.get(contractAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.cacheStats.hits++;
        return cached.price;
      }

      this.cacheStats.misses++;
      
      // Fetch from SimpleTokenService
      const tokenInfo = await this.simpleTokenService.getTokenInfo(contractAddress);
      const price = tokenInfo.market_data?.current_price || 0;
      
      // Cache the result
      this.priceCache.set(contractAddress, { price, timestamp: Date.now() });
      
      return price;
    } catch (error) {
      this.logger.error(`Error getting token price for ${contractAddress}:`, error);
      return 0;
    }
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
          })
        );
        
        // Small delay between batches
        if (i + batchSize < contractAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      this.logger.error('Error getting token prices:', error);
    }
    
    return priceMap;
  }

  async getTokenInfo(contractAddress: string): Promise<any> {
    try {
      return await this.simpleTokenService.getTokenInfo(contractAddress);
    } catch (error) {
      this.logger.error(`Error getting token info for ${contractAddress}:`, error);
      return null;
    }
  }

  calculatePnL(entryPrice: number, exitPrice: number): number {
    if (entryPrice === 0) return 0;
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }

  cleanupCache(): void {
    const now = Date.now();
    for (const [address, data] of this.priceCache.entries()) {
      if (now - data.timestamp > this.CACHE_TTL) {
        this.priceCache.delete(address);
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
}
