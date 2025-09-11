import { Injectable, Logger } from '@nestjs/common';
import {
  HistoricalDataProvider,
  HistoricalDataPoint,
  TokenLookupProvider,
  TokenMetadata,
} from '../types/historical-data.types';

@Injectable()
export class CryptoCompareService
  implements HistoricalDataProvider, TokenLookupProvider
{
  private readonly logger = new Logger(CryptoCompareService.name);
  readonly name = 'CoinDesk';
  private readonly baseUrl = 'https://api.coindesk.com/v2';
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
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (process.env.COINDESK_API_KEY) {
      headers['X-API-KEY'] = process.env.COINDESK_API_KEY;
    }
    return headers;
  }

  async lookupToken(contractAddress: string): Promise<TokenMetadata | null> {
    // CoinDesk primarily covers Bitcoin and major cryptocurrencies
    // Limited support for individual token contracts on Base
    this.logger.warn(
      `CoinDesk has limited support for contract-specific tokens like ${contractAddress}`,
    );
    
    // Only return metadata for well-known tokens
    const knownTokens: Record<string, TokenMetadata> = {
      // Add major Base tokens here if CoinDesk covers them
      // For now, return null to indicate no support
    };

    const result = knownTokens[contractAddress.toLowerCase()] || null;
    if (!result) {
      this.logger.warn(
        `Token ${contractAddress} not supported by CoinDesk API`,
      );
    }
    
    return result;
  }

  async fetchHistoricalData(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataPoint | null> {
    // CoinDesk API primarily covers Bitcoin and major cryptocurrencies
    // It doesn't support individual token contracts on Base networks
    this.logger.warn(
      `CoinDesk API doesn't support Base token ${contractAddress} - skipping`,
    );
    
    // CoinDesk focuses on Bitcoin price data and crypto market news
    // For Base network tokens, this provider will typically return null
    // which is expected behavior for this fallback chain
    
    return null;
  }

}