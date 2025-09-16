import { Injectable, Logger } from '@nestjs/common';
import {
  HistoricalDataProvider,
  HistoricalDataPoint,
  TokenLookupProvider,
  TokenMetadata,
} from '../types/historical-data.types';

const ZAPPER_API_URL = 'https://public.zapper.xyz/graphql';
const BASE_CHAIN_ID = 8453;

export interface ZapperTokenData {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  imageUrlV2: string;
  priceData: {
    historicalPrice?: {
      timestamp: number;
      price: number;
    };
    marketCap?: number;
    price?: number;
  };
}

@Injectable()
export class ZapperProvider
  implements HistoricalDataProvider, TokenLookupProvider
{
  readonly name = 'Zapper';
  private readonly logger = new Logger(ZapperProvider.name);

  async fetchHistoricalData(
    contractAddress: string,
    timestamp: Date,
  ): Promise<HistoricalDataPoint | null> {
    try {
      const zapperData = await this.fetchZapperTokenData(
        contractAddress.toLowerCase(),
        timestamp,
      );

      if (!zapperData) {
        this.logger.warn(`No Zapper data found for ${contractAddress}`);
        return null;
      }

      const historicalPriceData = zapperData.priceData.historicalPrice;
      if (!historicalPriceData) {
        this.logger.warn(
          `No historical price data found for ${contractAddress} at ${timestamp}`,
        );
        return null;
      }

      const currentMarketCap = zapperData.priceData.marketCap || 0;
      const currentPrice = zapperData.priceData.price || 0;
      const historicalPrice = historicalPriceData.price || 0;

      let historicalMarketCap = 0;
      if (currentPrice > 0 && currentMarketCap > 0) {
        historicalMarketCap =
          (currentMarketCap / currentPrice) * historicalPrice;
      }

      this.logger.log(
        `Zapper data for ${contractAddress}: price=${historicalPrice}, marketCap=${historicalMarketCap}`,
      );

      return {
        price: historicalPrice,
        marketCap: Math.floor(historicalMarketCap),
        timestamp: historicalPriceData.timestamp,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch Zapper historical data for ${contractAddress}:`,
        error,
      );
      return null;
    }
  }

  async lookupToken(contractAddress: string): Promise<TokenMetadata | null> {
    try {
      const zapperData = await this.fetchZapperTokenData(
        contractAddress.toLowerCase(),
        new Date(),
      );

      if (!zapperData) {
        return null;
      }

      return {
        symbol: zapperData.symbol || 'UNKNOWN',
        name: zapperData.name || 'Unknown Token',
      };
    } catch (error) {
      this.logger.error(
        `Failed to lookup token metadata for ${contractAddress}:`,
        error,
      );
      return null;
    }
  }

  private async fetchZapperTokenData(
    ca: string,
    timestamp: Date,
  ): Promise<ZapperTokenData | null> {
    try {
      const query = `
        query TokenPriceData($address: Address!, $chainId: Int!) {
          fungibleTokenV2(address: $address, chainId: $chainId) {
            address
            symbol
            name
            decimals
            imageUrlV2
            priceData {
              historicalPrice(timestamp: ${timestamp.getTime()}) {
                timestamp
                price
              }
              marketCap
              price
            }
          }
        }
      `;

      const variables = {
        address: ca,
        chainId: BASE_CHAIN_ID,
      };

      this.logger.debug(
        `Fetching Zapper data for ${ca} at ${timestamp.getTime()}`,
      );

      const response = await fetch(ZAPPER_API_URL, {
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
        this.logger.warn(`Zapper API returned ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.errors) {
        this.logger.warn('Zapper GraphQL errors:', data.errors);
        return null;
      }

      const tokenData = data.data?.fungibleTokenV2;
      if (!tokenData?.priceData) {
        this.logger.warn(`No price data found for ${ca} on Zapper`);
        return null;
      }

      return tokenData;
    } catch (error) {
      this.logger.error(`Failed to fetch Zapper data for ${ca}:`, error);
      return null;
    }
  }
}
