import { Injectable, Logger } from '@nestjs/common';
import { ZapperProvider } from './providers/zapper.service';
import { CoinMarketCapService } from './providers/coinmarketcap.service';
import { CryptoCompareService } from './providers/cryptocompare.service';
import { CoinAPIService } from './providers/coinapi.service';
import { HistoricalDataProvider, HistoricalDataPoint } from './types/historical-data.types';

export interface HistoricalDataResult {
  price: number;
  marketCap: number;
  timestamp: number;
  source: string;
  attempts: string[];
  success: boolean;
}

@Injectable()
export class HistoricalDataManagerService {
  private readonly logger = new Logger(HistoricalDataManagerService.name);
  private readonly providers: HistoricalDataProvider[];
  
  constructor(
    private zapperProvider: ZapperProvider,
    private coinMarketCapService: CoinMarketCapService,
    private cryptoCompareService: CryptoCompareService,
    private coinAPIService: CoinAPIService,
  ) {
    this.providers = [
      this.zapperProvider,
      this.coinMarketCapService,
      this.cryptoCompareService,
      this.coinAPIService,
    ];
  }

  /**
   * Attempts to fetch historical data with comprehensive error handling and logging
   */
  async fetchHistoricalDataWithFallbacks(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataResult> {
    const attempts: string[] = [];
    let lastError: Error | null = null;

    this.logger.log(
      `Starting historical data fetch for ${contractAddress} at ${timestamp.toISOString()}`,
    );

    for (const provider of this.providers) {
      try {
        attempts.push(provider.name);
        this.logger.log(`Attempting ${provider.name} for ${contractAddress}`);
        
        const startTime = Date.now();
        const result = await provider.fetchHistoricalData(
          contractAddress,
          timestamp,
        );
        const duration = Date.now() - startTime;

        if (result && (result.price > 0 || result.marketCap > 0)) {
          this.logger.log(
            `✅ ${provider.name} succeeded for ${contractAddress} in ${duration}ms:`,
            {
              price: result.price,
              marketCap: result.marketCap,
              timestamp: new Date(result.timestamp).toISOString(),
            },
          );

          return {
            price: result.price,
            marketCap: result.marketCap,
            timestamp: result.timestamp,
            source: provider.name,
            attempts,
            success: true,
          };
        } else {
          this.logger.warn(
            `❌ ${provider.name} returned empty data for ${contractAddress} (${duration}ms)`,
          );
        }
      } catch (error) {
        lastError = error as Error;
        this.logger.error(
          `💥 ${provider.name} failed for ${contractAddress}:`,
          {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n')[0], // Just first line of stack
          },
        );
        continue;
      }
    }

    // All providers failed
    this.logger.error(
      `🚨 All providers failed for ${contractAddress} at ${timestamp.toISOString()}`,
      {
        attempts,
        lastError: lastError?.message,
        contractAddress,
        timestamp: timestamp.toISOString(),
      },
    );

    return {
      price: 0,
      marketCap: 0,
      timestamp: timestamp.getTime(),
      source: 'none',
      attempts,
      success: false,
    };
  }

  /**
   * Get service health status
   */
  async getServiceHealth(): Promise<{
    providers: Array<{
      name: string;
      available: boolean;
      hasApiKey: boolean;
      lastError?: string;
    }>;
    totalAvailable: number;
  }> {
    const testAddress = '0x4200000000000000000000000000000000000006'; // WETH Base
    const testTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
    
    const providerStatuses = await Promise.all(
      this.providers.map(async (provider) => {
        const hasApiKey = this.checkApiKeyForProvider(provider.name);
        
        if (!hasApiKey) {
          return {
            name: provider.name,
            available: false,
            hasApiKey: false,
            lastError: 'Missing API key',
          };
        }

        try {
          const result = await Promise.race([
            provider.fetchHistoricalData(testAddress, testTimestamp),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 10000)
            ),
          ]);
          
          return {
            name: provider.name,
            available: !!result,
            hasApiKey: true,
          };
        } catch (error) {
          return {
            name: provider.name,
            available: false,
            hasApiKey: true,
            lastError: error.message,
          };
        }
      }),
    );

    const totalAvailable = providerStatuses.filter(p => p.available).length;

    return {
      providers: providerStatuses,
      totalAvailable,
    };
  }

  private checkApiKeyForProvider(providerName: string): boolean {
    switch (providerName) {
      case 'Zapper':
        return !!process.env.ZAPPER_API_KEY;
      case 'CoinMarketCap':
        return !!process.env.COINMARKETCAP_API_KEY;
      case 'CryptoCompare':
        return !!process.env.CRYPTOCOMPARE_API_KEY;
      case 'CoinAPI':
        return !!process.env.COINAPI_KEY;
      default:
        return false;
    }
  }
}