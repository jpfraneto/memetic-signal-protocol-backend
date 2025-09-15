import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { Token } from '../../../models/Token/Token.model';
import { ZapperService } from '../../zapper/services/zapper.service';

@Injectable()
export class SimpleTokenService {
  private readonly logger = new Logger(SimpleTokenService.name);
  private readonly COINGECKO_API_URL = 'https://pro-api.coingecko.com/api/v3';
  private readonly BASE_NETWORK_PLATFORM_ID = 'base';
  private readonly PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly METADATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  private lastRequestTime = 0;
  private readonly REQUEST_DELAY = 1200; // 1.2 seconds between requests

  private provider: ethers.JsonRpcProvider;

  private readonly ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
  ];

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly zapperService: ZapperService,
  ) {
    this.provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    );
  }

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

  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  async getTokenInfo(contractAddress: string): Promise<Token> {
    if (!this.isValidEthereumAddress(contractAddress)) {
      throw new Error('Invalid contract address format');
    }

    const normalizedAddress = contractAddress.toLowerCase();

    // Check database first
    let token = await this.fetchAndSaveTokenMetadata(normalizedAddress);

    await this.updateTokenPrice(token);

    // Market data removed from simplified schema

    return token;
  }

  private isMetadataOutdated(token: Token): boolean {
    if (!token.updated_at) return true;
    // Handle string, Date, and BigInt formats
    let updatedAt: number;
    if (typeof token.updated_at === 'string') {
      updatedAt = new Date(token.updated_at).getTime();
    } else if (typeof token.updated_at === 'bigint') {
      updatedAt = Number(token.updated_at);
    } else {
      updatedAt = new Date(token.updated_at).getTime();
    }
    return Date.now() - updatedAt > this.METADATA_CACHE_TTL;
  }

  private isPriceOutdated(token: Token): boolean {
    if (!token.updated_at) return true;
    // Handle string, Date, and BigInt formats
    let updatedAt: number;
    if (typeof token.updated_at === 'string') {
      updatedAt = new Date(token.updated_at).getTime();
    } else if (typeof token.updated_at === 'bigint') {
      updatedAt = Number(token.updated_at);
    } else {
      updatedAt = new Date(token.updated_at).getTime();
    }
    return Date.now() - updatedAt > this.PRICE_CACHE_TTL;
  }

  private async fetchAndSaveTokenMetadata(
    ca: string,
    existingToken?: Token,
  ): Promise<Token> {
    try {
      this.logger.log(`Fetching metadata for token ${ca}`);
      let coinData: any;

      // Try Zapper first
      try {
        this.logger.log(`Trying Zapper for ${ca}`);
        coinData = await this.zapperService.getTokenByAddress(ca);
        if (coinData) {
          this.logger.log(`Successfully fetched from Zapper for ${ca}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch from Zapper for ${ca}:`, error);
      }

      // If Zapper fails, try CoinGecko
      if (!coinData) {
        this.logger.log(`Zapper failed, trying CoinGecko for ${ca}`);
        try {
          await this.rateLimit();
          const coinDataUrl = `${this.COINGECKO_API_URL}/coins/base/contract/${ca}`;
          this.logger.debug('Fetching token data from CoinGecko', {
            coinDataUrl,
          });
          const coinDataResponse = await fetch(coinDataUrl, {
            headers: {
              accept: 'application/json',
              'x-cg-pro-api-key': process.env.COINGECKO_API_KEY || '',
            },
          });
          this.logger.debug('CoinGecko response received', {
            status: coinDataResponse.status,
          });
          if (coinDataResponse.ok) {
            coinData = await coinDataResponse.json();
            this.logger.log(`Successfully fetched from CoinGecko for ${ca}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch from CoinGecko for ${ca}:`, error);
        }
      }

      // If CoinGecko fails, try DexScreener as final fallback
      if (!coinData) {
        this.logger.log(`CoinGecko failed, trying DexScreener for ${ca}`);
        try {
          coinData = await this.fetchFromDexScreener(ca);
          if (coinData) {
            this.logger.log(`Successfully fetched from DexScreener for ${ca}`);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch from DexScreener for ${ca}:`,
            error,
          );
        }
      }

      this.logger.debug('Token data retrieved', {
        tokenName: coinData?.name,
        symbol: coinData?.symbol,
      });

      if (!coinData) {
        throw new Error('Token not found or invalid contract address');
      }

      const now = new Date();
      const tokenData: Partial<Token> = {
        ca,
        name: coinData?.name,
        created_at: now,
        updated_at: now,
        symbol: coinData?.symbol,
        decimals: parseInt(
          coinData?.detail_platforms?.base?.decimal_place?.toString() || 
          coinData?.decimals?.toString() || 
          '18'
        ),
        image: coinData?.image?.large,
        market_cap: coinData?.market_cap ? BigInt(Math.floor(coinData.market_cap)) : null,
      };
      
      this.logger.debug('Token data processed', {
        ca,
        name: tokenData.name,
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        market_cap: tokenData.market_cap?.toString(),
      });

      if (existingToken) {
        Object.assign(existingToken, tokenData);
        return await this.tokenRepository.save(existingToken);
      } else {
        const newToken = this.tokenRepository.create(tokenData);
        return await this.tokenRepository.save(newToken);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch token metadata for ${ca}:`, error);
      this.logger.error('Failed to fetch token metadata', {
        ca,
        error: error.message,
      });
      throw new Error('Token not found or invalid contract address');
    }
  }

  private async fetchFromDexScreener(ca: string): Promise<any> {
    try {
      const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/base/${ca}`;
      this.logger.debug('Fetching from DexScreener', { dexScreenerUrl });

      const response = await fetch(dexScreenerUrl);
      this.logger.debug('DexScreener response received', {
        status: response.status,
      });

      if (!response.ok) {
        throw new Error(`DexScreener API returned ${response.status}`);
      }

      const data = await response.json();
      this.logger.debug('DexScreener data retrieved', {
        dataLength: Array.isArray(data) ? data.length : 'not array',
      });

      // DexScreener returns an array, we want the first (most relevant) result
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No token data found in DexScreener response');
      }

      const tokenData = data[0];

      // Transform DexScreener data to match CoinGecko format
      return {
        name: tokenData.baseToken?.name,
        symbol: tokenData.baseToken?.symbol,
        image: {
          large: tokenData.info?.imageUrl,
          small: tokenData.info?.imageUrl,
          thumb: tokenData.info?.imageUrl,
        },
        detail_platforms: {
          base: {
            decimal_place: 18, // Default to 18 decimals for most ERC20 tokens
          },
        },
        market_cap: tokenData.marketCap || 0,
        categories: [],
        description: {
          en: `Token on Base network with symbol ${tokenData.baseToken?.symbol}`,
        },
        market_cap_rank: null,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch from DexScreener for ${ca}:`, error);
      throw error;
    }
  }

  private async fetchPriceFromDexScreener(ca: string): Promise<any> {
    try {
      const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/base/${ca}`;

      const response = await fetch(dexScreenerUrl);

      if (!response.ok) {
        throw new Error(`DexScreener API returned ${response.status}`);
      }

      const data = await response.json();

      // DexScreener returns an array, we want the first (most relevant) result
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No token data found in DexScreener response');
      }

      const tokenData = data[0];

      // Return only price-related data
      return {
        price: parseFloat(tokenData.priceUsd) || 0,
        price_change_24h: tokenData.priceChange?.h24 || 0,
        market_cap: tokenData.marketCap || 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch price from DexScreener for ${ca}:`,
        error,
      );
      throw error;
    }
  }

  private async updateTokenPrice(token: Token): Promise<void> {
    try {
      await this.rateLimit();

      const url = `${this.COINGECKO_API_URL}/simple/token_price/${this.BASE_NETWORK_PLATFORM_ID}?contract_addresses=${token.ca}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

      const response = await fetch(url, {
        headers: {
          'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
        },
      });

      let priceUpdated = false;

      // Market data removed from simplified schema
      let marketData: any = {};

      if (response.ok) {
        const data = await response.json();
        const tokenData = data[token.ca];

        if (tokenData) {
          // Market data no longer stored in token
          priceUpdated = true;
        }
      } else if (response.status === 429) {
        this.logger.warn('CoinGecko rate limit hit');
      } else {
        this.logger.warn(
          `CoinGecko price update failed for ${token.ca}, trying DexScreener`,
        );
      }

      // If CoinGecko failed, try DexScreener as fallback
      if (!priceUpdated) {
        try {
          const dexScreenerPriceData = await this.fetchPriceFromDexScreener(
            token.ca,
          );
          if (dexScreenerPriceData) {
            marketData.current_price = dexScreenerPriceData.price || 0;
            marketData.price_change_24h =
              dexScreenerPriceData.price_change_24h || 0;
            marketData.market_cap = dexScreenerPriceData.market_cap || 0;
            // Market data no longer stored in token
            priceUpdated = true;
            this.logger.log(
              `Updated price for ${token.ca} using DexScreener fallback`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `DexScreener fallback also failed for ${token.ca}:`,
            error,
          );
        }
      }

      if (priceUpdated) {
        await this.tokenRepository.save(token);
      }
    } catch (error) {
      this.logger.error(`Failed to update price for token ${token.ca}:`, error);
    }
  }
}
