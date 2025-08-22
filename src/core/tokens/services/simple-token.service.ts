import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { Token } from '../../../models/Token/Token.model';

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
    let token = await this.tokenRepository.findOne({
      where: { address: normalizedAddress },
    });

    // If token doesn't exist or metadata is outdated, fetch from blockchain
    if (!token || this.isMetadataOutdated(token)) {
      token = await this.fetchAndSaveTokenMetadata(normalizedAddress, token);
    }

    // If price is outdated, fetch from CoinGecko
    if (this.isPriceOutdated(token)) {
      await this.updateTokenPrice(token);
    }

    return token;
  }

  private isMetadataOutdated(token: Token): boolean {
    if (!token.updatedAt) return true;
    return Date.now() - token.updatedAt.getTime() > this.METADATA_CACHE_TTL;
  }

  private isPriceOutdated(token: Token): boolean {
    if (!token.updatedAt) return true;
    return Date.now() - token.updatedAt.getTime() > this.PRICE_CACHE_TTL;
  }

  private async fetchAndSaveTokenMetadata(
    address: string,
    existingToken?: Token,
  ): Promise<Token> {
    try {
      this.logger.log(`Fetching metadata for token ${address}`);
      let coinData: any;
      try {
        await this.rateLimit();
        const coinDataUrl = `${this.COINGECKO_API_URL}/coins/base/contract/${address}`;
        const coinDataResponse = await fetch(coinDataUrl, {
          headers: {
            accept: 'application/json',
            'x-cg-pro-api-key': process.env.COINGECKO_API_KEY || '',
          },
        });

        if (coinDataResponse.ok) {
          coinData = await coinDataResponse.json();
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch image from CoinGecko for ${address}`);
      }

      console.log('THE COIN DATA IS', coinData);

      const tokenData: Token = {
        createdAt: new Date(),
        updatedAt: new Date(),
        address,
        name: coinData?.name,
        symbol: coinData?.symbol,
        decimals: parseInt(
          coinData?.detail_platforms?.base?.decimal_place.toString(),
        ),
        categories: coinData?.categories,
        description: coinData?.description?.en,
        image: coinData?.image?.large,
        image_small: coinData?.image?.small,
        image_thumb: coinData?.image?.thumb,
        market_cap_rank: coinData?.market_cap_rank,
        market_data: {
          current_price: coinData?.market_data?.current_price?.usd,
          ath: coinData?.market_data?.ath?.usd,
          ath_change_percentage:
            coinData?.market_data?.ath_change_percentage?.usd,
          ath_date: coinData?.market_data?.ath_date?.usd,
          market_cap: coinData?.market_data?.market_cap?.usd,
          price_change_24h: coinData?.market_data?.price_change_24h,
        },
      };
      console.log('THE TOKEN DATA', tokenData);

      if (existingToken) {
        Object.assign(existingToken, tokenData);
        return await this.tokenRepository.save(existingToken);
      } else {
        const newToken = this.tokenRepository.create(tokenData);
        return await this.tokenRepository.save(newToken);
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch token metadata for ${address}:`,
        error,
      );
      console.log('THE ERROR IS:', error);
      throw new Error('Token not found or invalid contract address');
    }
  }

  private async updateTokenPrice(token: Token): Promise<void> {
    try {
      await this.rateLimit();

      const url = `${this.COINGECKO_API_URL}/simple/token_price/${this.BASE_NETWORK_PLATFORM_ID}?contract_addresses=${token.address}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

      const response = await fetch(url, {
        headers: {
          'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('CoinGecko rate limit hit');
          return;
        }
        return;
      }

      const data = await response.json();
      const tokenData = data[token.address];

      if (tokenData) {
        token.market_data.current_price = tokenData.usd || 0;
        token.market_data.price_change_24h = tokenData.usd_24h_change;
        token.market_data.market_cap = tokenData.usd_market_cap;
        token.updatedAt = new Date();

        await this.tokenRepository.save(token);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update price for token ${token.address}:`,
        error,
      );
    }
  }
}
