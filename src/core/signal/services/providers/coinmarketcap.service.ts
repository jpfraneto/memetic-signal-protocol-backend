import { Injectable, Logger } from '@nestjs/common';
import {
  HistoricalDataProvider,
  HistoricalDataPoint,
  TokenLookupProvider,
  TokenMetadata,
} from '../types/historical-data.types';

@Injectable()
export class CoinMarketCapService
  implements HistoricalDataProvider, TokenLookupProvider
{
  private readonly logger = new Logger(CoinMarketCapService.name);
  readonly name = 'CoinMarketCap';
  private readonly baseUrl = 'https://pro-api.coinmarketcap.com/v1';
  private readonly REQUEST_DELAY = 1000; // 1 second between requests
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
      'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || '',
      Accept: 'application/json',
    };
  }

  async lookupToken(contractAddress: string): Promise<TokenMetadata | null> {
    try {
      await this.rateLimit();

      const url = `${this.baseUrl}/cryptocurrency/info?address=${contractAddress}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinMarketCap rate limit hit, waiting longer...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.lookupToken(contractAddress);
        }
        throw new Error(`CoinMarketCap API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.status?.error_code !== 0) {
        throw new Error(data.status?.error_message || 'API error');
      }

      // CMC returns data keyed by contract address
      const tokenData = Object.values(data.data)[0] as any;
      if (!tokenData) {
        return null;
      }

      return {
        symbol: tokenData.symbol,
        name: tokenData.name,
        coinMarketCapId: tokenData.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup token ${contractAddress} on CoinMarketCap:`,
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
      // First, lookup the token to get CMC ID
      const tokenMetadata = await this.lookupToken(contractAddress);
      if (!tokenMetadata?.coinMarketCapId) {
        this.logger.warn(
          `No CoinMarketCap ID found for ${contractAddress}`,
        );
        return null;
      }

      await this.rateLimit();

      // Format timestamp for CMC API (they use YYYY-MM-DD format)
      const dateStr = timestamp.toISOString().split('T')[0];
      
      const url = `${this.baseUrl}/cryptocurrency/quotes/historical?id=${tokenMetadata.coinMarketCapId}&time_start=${dateStr}&time_end=${dateStr}&interval=1d`;
      
      this.logger.log(
        `Fetching historical data from CoinMarketCap for token ID ${tokenMetadata.coinMarketCapId} at ${dateStr}`,
      );

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinMarketCap rate limit hit, waiting longer...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.fetchHistoricalData(contractAddress, timestamp);
        }
        throw new Error(`CoinMarketCap API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.status?.error_code !== 0) {
        throw new Error(data.status?.error_message || 'API error');
      }

      const quotes = data.data?.quotes;
      if (!quotes || quotes.length === 0) {
        this.logger.warn(
          `No historical data found for token ID ${tokenMetadata.coinMarketCapId} at ${dateStr}`,
        );
        return null;
      }

      // Get the closest quote to our timestamp
      let closestQuote = quotes[0];
      let closestTimeDiff = Math.abs(
        new Date(quotes[0].timestamp).getTime() - timestamp.getTime(),
      );

      for (const quote of quotes) {
        const timeDiff = Math.abs(
          new Date(quote.timestamp).getTime() - timestamp.getTime(),
        );
        if (timeDiff < closestTimeDiff) {
          closestQuote = quote;
          closestTimeDiff = timeDiff;
        }
      }

      const usdQuote = closestQuote.quote?.USD;
      if (!usdQuote) {
        this.logger.warn(`No USD quote found for token at ${dateStr}`);
        return null;
      }

      const result = {
        price: usdQuote.price || 0,
        marketCap: usdQuote.market_cap || 0,
        timestamp: new Date(closestQuote.timestamp).getTime(),
      };

      this.logger.log(
        `CoinMarketCap historical data for ${contractAddress}:`,
        result,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical data from CoinMarketCap for ${contractAddress}:`,
        error,
      );
      return null;
    }
  }
}