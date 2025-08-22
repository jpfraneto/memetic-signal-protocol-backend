import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Token } from '../../../models/Token/Token.model';
import { SimpleTokenService } from './simple-token.service';

interface MarketCapAnalytics {
  totalMarketCap: number;
  averageMarketCap: number;
  topGainers24h: Token[];
  topLosers24h: Token[];
  marketCapDistribution: {
    micro: number; // < 1M
    small: number; // 1M - 100M
    mid: number;   // 100M - 1B
    large: number; // > 1B
  };
  trending: Token[];
}

interface MarketCapPrediction {
  tokenAddress: string;
  currentMarketCap: number;
  predictedMarketCap: number;
  confidence: number;
  timeframe: '24h' | '7d' | '30d';
  factors: string[];
}

@Injectable()
export class MarketCapitalService {
  private readonly logger = new Logger(MarketCapitalService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly simpleTokenService: SimpleTokenService,
  ) {}

  async updateMarketCapData(tokenAddress: string): Promise<Token> {
    try {
      // Get fresh token data from CoinGecko
      const token = await this.simpleTokenService.getTokenInfo(tokenAddress);
      
      if (!token) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }

      // The token already has all market data from CoinGecko
      // Just update the market cap rank if needed
      await this.updateMarketCapRanks();

      return token;
    } catch (error) {
      this.logger.error(`Failed to update market cap data for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async getMarketCapAnalytics(): Promise<MarketCapAnalytics> {
    // Get all tokens with market data
    const tokens = await this.tokenRepository.find({
      where: { market_data: MoreThan(null) }
    });

    // Filter tokens that have market cap data
    const tokensWithMarketCap = tokens.filter(token => 
      token.market_data?.market_cap && token.market_data.market_cap > 0
    );

    const totalMarketCap = tokensWithMarketCap.reduce((sum, token) => 
      sum + (token.market_data?.market_cap || 0), 0
    );
    const averageMarketCap = tokensWithMarketCap.length > 0 ? totalMarketCap / tokensWithMarketCap.length : 0;

    // Sort by market cap for further analysis
    const sortedTokens = tokensWithMarketCap.sort((a, b) => 
      (b.market_data?.market_cap || 0) - (a.market_data?.market_cap || 0)
    );

    // Top gainers and losers based on 24h price change
    const topGainers24h = tokensWithMarketCap
      .filter(token => token.market_data?.price_change_24h && token.market_data.price_change_24h > 0)
      .sort((a, b) => (b.market_data?.price_change_24h || 0) - (a.market_data?.price_change_24h || 0))
      .slice(0, 10);

    const topLosers24h = tokensWithMarketCap
      .filter(token => token.market_data?.price_change_24h && token.market_data.price_change_24h < 0)
      .sort((a, b) => (a.market_data?.price_change_24h || 0) - (b.market_data?.price_change_24h || 0))
      .slice(0, 10);

    const distribution = {
      micro: tokensWithMarketCap.filter(t => (t.market_data?.market_cap || 0) < 1_000_000).length,
      small: tokensWithMarketCap.filter(t => {
        const mc = t.market_data?.market_cap || 0;
        return mc >= 1_000_000 && mc < 100_000_000;
      }).length,
      mid: tokensWithMarketCap.filter(t => {
        const mc = t.market_data?.market_cap || 0;
        return mc >= 100_000_000 && mc < 1_000_000_000;
      }).length,
      large: tokensWithMarketCap.filter(t => (t.market_data?.market_cap || 0) >= 1_000_000_000).length,
    };

    // Trending tokens with significant 24h price changes
    const trending = tokensWithMarketCap
      .filter(token => token.market_data?.price_change_24h && Math.abs(token.market_data.price_change_24h) > 10)
      .sort((a, b) => Math.abs(b.market_data?.price_change_24h || 0) - Math.abs(a.market_data?.price_change_24h || 0))
      .slice(0, 20);

    return {
      totalMarketCap,
      averageMarketCap,
      topGainers24h,
      topLosers24h,
      marketCapDistribution: distribution,
      trending,
    };
  }

  async getMarketCapLeaderboard(limit = 100): Promise<Token[]> {
    const tokens = await this.tokenRepository.find({
      where: { market_data: MoreThan(null) }
    });

    // Filter and sort by market cap
    return tokens
      .filter(token => token.market_data?.market_cap && token.market_data.market_cap > 0)
      .sort((a, b) => (b.market_data?.market_cap || 0) - (a.market_data?.market_cap || 0))
      .slice(0, limit);
  }

  async updateMarketCapRanks(): Promise<void> {
    const tokens = await this.tokenRepository.find({
      where: { market_data: MoreThan(null) }
    });

    // Filter and sort by market cap
    const tokensWithMarketCap = tokens
      .filter(token => token.market_data?.market_cap && token.market_data.market_cap > 0)
      .sort((a, b) => (b.market_data?.market_cap || 0) - (a.market_data?.market_cap || 0));

    const updatePromises = tokensWithMarketCap.map((token, index) => {
      token.market_cap_rank = index + 1;
      return this.tokenRepository.save(token);
    });

    await Promise.all(updatePromises);
    this.logger.log(`Updated market cap ranks for ${tokensWithMarketCap.length} tokens`);
  }

  async getMarketCapPredictions(tokenAddress: string): Promise<MarketCapPrediction[]> {
    const token = await this.tokenRepository.findOne({
      where: { address: tokenAddress }
    });

    if (!token || !token.market_data?.market_cap) {
      return [];
    }

    const predictions: MarketCapPrediction[] = [];
    const currentMarketCap = token.market_data.market_cap;
    const priceChange24h = token.market_data.price_change_24h || 0;

    // Simple predictions based on current price trends
    // 24h prediction based on current momentum
    const trend24h = priceChange24h / 100; // Convert percentage to decimal
    const prediction24h = currentMarketCap * (1 + trend24h * 0.5); // Conservative estimate

    predictions.push({
      tokenAddress: token.address,
      currentMarketCap,
      predictedMarketCap: prediction24h,
      confidence: this.calculateBasicConfidence(priceChange24h),
      timeframe: '24h',
      factors: this.analyzePredictionFactors(token),
    });

    // 7d prediction with dampened momentum
    const prediction7d = currentMarketCap * (1 + trend24h * 0.3);
    predictions.push({
      tokenAddress: token.address,
      currentMarketCap,
      predictedMarketCap: prediction7d,
      confidence: this.calculateBasicConfidence(priceChange24h) * 0.7,
      timeframe: '7d',
      factors: this.analyzePredictionFactors(token),
    });

    return predictions;
  }

  private calculateBasicConfidence(priceChange24h: number): number {
    // Lower confidence for high volatility
    const volatility = Math.abs(priceChange24h);
    if (volatility > 50) return 0.2;
    if (volatility > 25) return 0.4;
    if (volatility > 10) return 0.6;
    return 0.8;
  }

  private analyzePredictionFactors(token: Token): string[] {
    const factors = [];
    const priceChange24h = token.market_data?.price_change_24h || 0;
    const athChangePercentage = token.market_data?.ath_change_percentage || 0;
    
    if (priceChange24h > 10) {
      factors.push('Strong 24h momentum');
    } else if (priceChange24h < -10) {
      factors.push('Negative 24h momentum');
    }
    
    if (athChangePercentage > -20) {
      factors.push('Near all-time high');
    } else if (athChangePercentage < -80) {
      factors.push('Far from all-time high');
    }
    
    if (token.market_cap_rank && token.market_cap_rank <= 100) {
      factors.push('Top 100 by market cap');
    }

    const marketCap = token.market_data?.market_cap || 0;
    if (marketCap > 1_000_000_000) {
      factors.push('Large cap token');
    } else if (marketCap > 100_000_000) {
      factors.push('Mid cap token');
    } else if (marketCap > 1_000_000) {
      factors.push('Small cap token');
    } else {
      factors.push('Micro cap token');
    }
    
    return factors;
  }
}