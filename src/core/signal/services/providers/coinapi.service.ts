import { Injectable, Logger } from '@nestjs/common';
import {
  HistoricalDataProvider,
  HistoricalDataPoint,
  TokenLookupProvider,
  TokenMetadata,
} from '../types/historical-data.types';

@Injectable()
export class CoinAPIService
  implements HistoricalDataProvider, TokenLookupProvider
{
  private readonly logger = new Logger(CoinAPIService.name);
  readonly name = 'CoinAPI';
  private readonly baseUrl = 'https://rest.coinapi.io/v1';
  private readonly REQUEST_DELAY = 1000; // 1 second between requests (free tier limit)
  private lastRequestTime = 0;

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

  private getHeaders() {
    return {
      'X-CoinAPI-Key': process.env.COINAPI_KEY || '',
    };
  }

  async lookupToken(contractAddress: string): Promise<TokenMetadata | null> {
    try {
      await this.rateLimit();

      // CoinAPI uses asset IDs in the format SYMBOL_BASE (e.g., ETH_BASE, USDC_BASE)
      // We need to find the asset by searching through their assets
      const url = `${this.baseUrl}/assets`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinAPI rate limit hit, waiting longer...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.lookupToken(contractAddress);
        }
        throw new Error(`CoinAPI returned ${response.status}`);
      }

      const assets = await response.json();

      // Look for the token by contract address (this might not work directly)
      // CoinAPI doesn't have great contract address support for Base tokens
      const baseAssets = assets.filter((asset: any) => 
        asset.asset_id?.includes('_BASE') || 
        asset.data_quote_start && 
        asset.asset_id?.length < 10 // Likely a symbol rather than address
      );

      // This is a fallback - in reality, CoinAPI might not have many Base tokens
      // We'll return null and let other providers handle it
      this.logger.warn(
        `CoinAPI doesn't support direct contract address lookup for ${contractAddress}. Found ${baseAssets.length} Base assets.`,
      );
      
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to lookup token ${contractAddress} on CoinAPI:`,
        error,
      );
      return null;
    }
  }

  async fetchHistoricalData(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataPoint | null> {
    try {
      // CoinAPI is primarily for major cryptocurrencies and might not have
      // contract-specific data for Base tokens. We'll try a few approaches.

      // First try to lookup the token
      const tokenMetadata = await this.lookupToken(contractAddress);
      if (!tokenMetadata?.coinId) {
        // Try using common patterns for Base tokens
        return this.tryCommonBasePatterns(contractAddress, timestamp);
      }

      await this.rateLimit();

      // Format the timestamp to CoinAPI format (ISO 8601)
      const timeString = timestamp.toISOString();
      
      const url = `${this.baseUrl}/quotes/${tokenMetadata.coinId}/USD/history?time_start=${timeString}&time_end=${timeString}&limit=1`;
      
      this.logger.log(
        `Fetching historical data from CoinAPI for ${tokenMetadata.coinId} at ${timeString}`,
      );

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinAPI rate limit hit, waiting longer...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.fetchHistoricalData(contractAddress, timestamp);
        }
        throw new Error(`CoinAPI returned ${response.status}`);
      }

      const quotes = await response.json();

      if (!quotes || quotes.length === 0) {
        this.logger.warn(
          `No historical data found for ${tokenMetadata.coinId} at ${timeString}`,
        );
        return null;
      }

      const quote = quotes[0];
      
      // CoinAPI doesn't always provide market cap directly
      const result = {
        price: quote.price || 0,
        marketCap: 0, // CoinAPI might not have market cap for smaller tokens
        timestamp: new Date(quote.time_exchange).getTime(),
      };

      this.logger.log(
        `CoinAPI historical data for ${contractAddress}:`,
        result,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical data from CoinAPI for ${contractAddress}:`,
        error,
      );
      return null;
    }
  }

  private async tryCommonBasePatterns(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataPoint | null> {
    // CoinAPI might have some Base tokens with predictable patterns
    const possibleAssetIds = [
      `${contractAddress.toUpperCase()}_BASE`,
      `${contractAddress.toLowerCase()}_BASE`,
      contractAddress.toUpperCase(),
      contractAddress.toLowerCase(),
    ];

    for (const assetId of possibleAssetIds) {
      try {
        await this.rateLimit();

        const timeString = timestamp.toISOString();
        const url = `${this.baseUrl}/quotes/${assetId}/USD/history?time_start=${timeString}&time_end=${timeString}&limit=1`;
        
        const response = await fetch(url, {
          headers: this.getHeaders(),
        });

        if (response.ok) {
          const quotes = await response.json();
          if (quotes && quotes.length > 0) {
            const quote = quotes[0];
            return {
              price: quote.price || 0,
              marketCap: 0,
              timestamp: new Date(quote.time_exchange).getTime(),
            };
          }
        }
      } catch (error) {
        // Continue to next pattern
        continue;
      }
    }

    this.logger.warn(
      `None of the common patterns worked for ${contractAddress} on CoinAPI`,
    );
    return null;
  }
}