import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { Token } from '../../../models/Token/Token.model';
import { TokenDto } from '../dto/token-response.dto';

@Injectable()
export class SimpleTokenService {
  private readonly logger = new Logger(SimpleTokenService.name);
  private readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
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
    'function totalSupply() view returns (uint256)'
  ];

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {
    this.provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://mainnet.base.org'
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

  async getTokenInfo(contractAddress: string): Promise<TokenDto> {
    if (!this.isValidEthereumAddress(contractAddress)) {
      throw new Error('Invalid contract address format');
    }

    const normalizedAddress = contractAddress.toLowerCase();
    
    // Check database first
    let token = await this.tokenRepository.findOne({
      where: { address: normalizedAddress }
    });

    // If token doesn't exist or metadata is outdated, fetch from blockchain
    if (!token || this.isMetadataOutdated(token)) {
      token = await this.fetchAndSaveTokenMetadata(normalizedAddress, token);
    }

    // If price is outdated, fetch from CoinGecko
    if (this.isPriceOutdated(token)) {
      await this.updateTokenPrice(token);
    }

    return {
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      price: token.price || 0,
      change24h: token.change24h,
      image: token.image,
      marketCap: token.marketCap,
      totalSupply: token.totalSupply,
      decimals: token.decimals,
    };
  }

  private isMetadataOutdated(token: Token): boolean {
    if (!token.lastMetadataUpdate) return true;
    return Date.now() - token.lastMetadataUpdate.getTime() > this.METADATA_CACHE_TTL;
  }

  private isPriceOutdated(token: Token): boolean {
    if (!token.lastPriceUpdate) return true;
    return Date.now() - token.lastPriceUpdate.getTime() > this.PRICE_CACHE_TTL;
  }

  private async fetchAndSaveTokenMetadata(address: string, existingToken?: Token): Promise<Token> {
    try {
      this.logger.log(`Fetching metadata for token ${address}`);
      
      const contract = new ethers.Contract(address, this.ERC20_ABI, this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name().catch(() => 'Unknown Token'),
        contract.symbol().catch(() => 'UNKNOWN'),
        contract.decimals().catch(() => 18),
        contract.totalSupply().catch(() => 0n),
      ]);

      let image: string | undefined;
      
      try {
        await this.rateLimit();
        const coinListUrl = `${this.COINGECKO_API_URL}/coins/list?include_platform=true`;
        const coinListResponse = await fetch(coinListUrl);
        
        if (coinListResponse.ok) {
          const coinList = await coinListResponse.json();
          const coinData = coinList.find((coin: any) => 
            coin.platforms && 
            coin.platforms[this.BASE_NETWORK_PLATFORM_ID] === address.toLowerCase()
          );
          
          if (coinData) {
            await this.rateLimit();
            const coinDetailUrl = `${this.COINGECKO_API_URL}/coins/${coinData.id}`;
            const coinDetailResponse = await fetch(coinDetailUrl);
            
            if (coinDetailResponse.ok) {
              const coinDetail = await coinDetailResponse.json();
              image = coinDetail.image?.large || coinDetail.image?.small;
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch image from CoinGecko for ${address}`);
      }

      const tokenData = {
        address,
        name,
        symbol,
        decimals: parseInt(decimals.toString()),
        totalSupply: totalSupply.toString(),
        image,
        lastMetadataUpdate: new Date(),
      };

      if (existingToken) {
        Object.assign(existingToken, tokenData);
        return await this.tokenRepository.save(existingToken);
      } else {
        const newToken = this.tokenRepository.create(tokenData);
        return await this.tokenRepository.save(newToken);
      }

    } catch (error) {
      this.logger.error(`Failed to fetch token metadata for ${address}:`, error);
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
        token.price = tokenData.usd || 0;
        token.change24h = tokenData.usd_24h_change;
        token.marketCap = tokenData.usd_market_cap;
        token.lastPriceUpdate = new Date();
        
        await this.tokenRepository.save(token);
      }

    } catch (error) {
      this.logger.error(`Failed to update price for token ${token.address}:`, error);
    }
  }

  async updateAllTokenPrices(): Promise<void> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - this.PRICE_CACHE_TTL);
      const tokens = await this.tokenRepository.createQueryBuilder('token')
        .where('token.lastPriceUpdate IS NULL OR token.lastPriceUpdate < :fiveMinutesAgo', { fiveMinutesAgo })
        .limit(20)
        .getMany();
      
      if (tokens.length === 0) return;

      this.logger.log(`Updating prices for ${tokens.length} tokens`);

      for (const token of tokens) {
        try {
          await this.updateTokenPrice(token);
        } catch (error) {
          this.logger.error(`Failed to update price for token ${token.address}:`, error);
        }
      }

    } catch (error) {
      this.logger.error('Error updating token prices:', error);
    }
  }
}