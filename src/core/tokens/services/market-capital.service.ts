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
      const token = await this.simpleTokenService.getTokenInfo(tokenAddress);
      
      if (!token) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }

      const existingToken = await this.tokenRepository.findOne({
        where: { address: tokenAddress }
      });

      const now = new Date();
      const marketCapHistory = existingToken?.marketCapHistory || [];
      
      // Add current market cap to history
      if (token.marketCap) {
        marketCapHistory.push({
          timestamp: now,
          marketCap: token.marketCap
        });

        // Keep only last 90 days of history
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        token.marketCapHistory = marketCapHistory.filter(
          entry => entry.timestamp > ninetyDaysAgo
        );
      }

      // Calculate market cap changes
      if (marketCapHistory.length > 0) {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const oneDayMarketCap = this.findClosestMarketCap(marketCapHistory, oneDayAgo);
        const sevenDayMarketCap = this.findClosestMarketCap(marketCapHistory, sevenDaysAgo);
        const thirtyDayMarketCap = this.findClosestMarketCap(marketCapHistory, thirtyDaysAgo);

        if (oneDayMarketCap && token.marketCap) {
          token.marketCapChange24h = ((token.marketCap - oneDayMarketCap) / oneDayMarketCap) * 100;
        }

        if (sevenDayMarketCap && token.marketCap) {
          token.marketCapChange7d = ((token.marketCap - sevenDayMarketCap) / sevenDayMarketCap) * 100;
        }

        if (thirtyDayMarketCap && token.marketCap) {
          token.marketCapChange30d = ((token.marketCap - thirtyDayMarketCap) / thirtyDayMarketCap) * 100;
        }

        // Calculate averages
        const sevenDayEntries = marketCapHistory.filter(entry => entry.timestamp > sevenDaysAgo);
        const thirtyDayEntries = marketCapHistory.filter(entry => entry.timestamp > thirtyDaysAgo);

        if (sevenDayEntries.length > 0) {
          token.avgMarketCap7d = sevenDayEntries.reduce((sum, entry) => sum + entry.marketCap, 0) / sevenDayEntries.length;
        }

        if (thirtyDayEntries.length > 0) {
          token.avgMarketCap30d = thirtyDayEntries.reduce((sum, entry) => sum + entry.marketCap, 0) / thirtyDayEntries.length;
        }
      }

      // Update peak market cap
      if (!existingToken?.peakMarketCap || (token.marketCap && token.marketCap > existingToken.peakMarketCap)) {
        token.peakMarketCap = token.marketCap;
        token.peakMarketCapDate = now;
      } else if (existingToken) {
        token.peakMarketCap = existingToken.peakMarketCap;
        token.peakMarketCapDate = existingToken.peakMarketCapDate;
      }

      // Update existing token or create new one
      if (existingToken) {
        // Update existing token with new data
        Object.assign(existingToken, {
          marketCap: token.marketCap,
          marketCapHistory: token.marketCapHistory,
          marketCapChange24h: token.marketCapChange24h,
          marketCapChange7d: token.marketCapChange7d,
          marketCapChange30d: token.marketCapChange30d,
          avgMarketCap7d: token.avgMarketCap7d,
          avgMarketCap30d: token.avgMarketCap30d,
          peakMarketCap: token.peakMarketCap,
          peakMarketCapDate: token.peakMarketCapDate,
          lastMarketCapUpdate: now,
          price: token.price,
          change24h: token.change24h,
          image: token.image,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          totalSupply: token.totalSupply,
        });
        
        return await this.tokenRepository.save(existingToken);
      } else {
        // Create new token entity
        const newToken = this.tokenRepository.create({
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          totalSupply: token.totalSupply,
          image: token.image,
          price: token.price,
          change24h: token.change24h,
          marketCap: token.marketCap,
          marketCapHistory: token.marketCapHistory,
          marketCapChange24h: token.marketCapChange24h,
          marketCapChange7d: token.marketCapChange7d,
          marketCapChange30d: token.marketCapChange30d,
          avgMarketCap7d: token.avgMarketCap7d,
          avgMarketCap30d: token.avgMarketCap30d,
          peakMarketCap: token.peakMarketCap,
          peakMarketCapDate: token.peakMarketCapDate,
          lastMarketCapUpdate: now,
        });
        
        return await this.tokenRepository.save(newToken);
      }
    } catch (error) {
      this.logger.error(`Failed to update market cap data for ${tokenAddress}:`, error);
      throw error;
    }
  }

  private findClosestMarketCap(history: { timestamp: Date; marketCap: number }[], targetDate: Date): number | null {
    if (history.length === 0) return null;

    let closest = history[0];
    let minDiff = Math.abs(closest.timestamp.getTime() - targetDate.getTime());

    for (const entry of history) {
      const diff = Math.abs(entry.timestamp.getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    return closest.marketCap;
  }

  async getMarketCapAnalytics(): Promise<MarketCapAnalytics> {
    const tokens = await this.tokenRepository.find({
      where: { marketCap: MoreThan(0) },
      order: { marketCap: 'DESC' }
    });

    const totalMarketCap = tokens.reduce((sum, token) => sum + (token.marketCap || 0), 0);
    const averageMarketCap = tokens.length > 0 ? totalMarketCap / tokens.length : 0;

    const topGainers24h = tokens
      .filter(token => token.marketCapChange24h && token.marketCapChange24h > 0)
      .sort((a, b) => (b.marketCapChange24h || 0) - (a.marketCapChange24h || 0))
      .slice(0, 10);

    const topLosers24h = tokens
      .filter(token => token.marketCapChange24h && token.marketCapChange24h < 0)
      .sort((a, b) => (a.marketCapChange24h || 0) - (b.marketCapChange24h || 0))
      .slice(0, 10);

    const distribution = {
      micro: tokens.filter(t => (t.marketCap || 0) < 1_000_000).length,
      small: tokens.filter(t => (t.marketCap || 0) >= 1_000_000 && (t.marketCap || 0) < 100_000_000).length,
      mid: tokens.filter(t => (t.marketCap || 0) >= 100_000_000 && (t.marketCap || 0) < 1_000_000_000).length,
      large: tokens.filter(t => (t.marketCap || 0) >= 1_000_000_000).length,
    };

    const trending = tokens
      .filter(token => token.marketCapChange24h && Math.abs(token.marketCapChange24h) > 10)
      .sort((a, b) => Math.abs(b.marketCapChange24h || 0) - Math.abs(a.marketCapChange24h || 0))
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
    return await this.tokenRepository.find({
      where: { marketCap: MoreThan(0) },
      order: { marketCap: 'DESC' },
      take: limit,
    });
  }

  async updateMarketCapRanks(): Promise<void> {
    const tokens = await this.tokenRepository.find({
      where: { marketCap: MoreThan(0) },
      order: { marketCap: 'DESC' },
    });

    const updatePromises = tokens.map((token, index) => {
      token.marketCapRank = index + 1;
      return this.tokenRepository.save(token);
    });

    await Promise.all(updatePromises);
    this.logger.log(`Updated market cap ranks for ${tokens.length} tokens`);
  }

  async getMarketCapPredictions(tokenAddress: string): Promise<MarketCapPrediction[]> {
    const token = await this.tokenRepository.findOne({
      where: { address: tokenAddress }
    });

    if (!token || !token.marketCapHistory) {
      return [];
    }

    const predictions: MarketCapPrediction[] = [];
    const history = token.marketCapHistory;

    if (history.length < 7) {
      return predictions;
    }

    // Simple trend-based predictions
    const recentData = history.slice(-7);
    const trend = this.calculateTrend(recentData.map(h => h.marketCap));
    
    const currentMarketCap = token.marketCap || 0;

    // 24h prediction
    const prediction24h = currentMarketCap * (1 + trend * 0.1);
    predictions.push({
      tokenAddress: token.address,
      currentMarketCap,
      predictedMarketCap: prediction24h,
      confidence: this.calculateConfidence(recentData),
      timeframe: '24h',
      factors: this.analyzePredictionFactors(token),
    });

    // 7d prediction
    const prediction7d = currentMarketCap * (1 + trend * 0.5);
    predictions.push({
      tokenAddress: token.address,
      currentMarketCap,
      predictedMarketCap: prediction7d,
      confidence: this.calculateConfidence(recentData) * 0.8,
      timeframe: '7d',
      factors: this.analyzePredictionFactors(token),
    });

    return predictions;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + index * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private calculateConfidence(data: { timestamp: Date; marketCap: number }[]): number {
    if (data.length < 3) return 0.1;
    
    const values = data.map(d => d.marketCap);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const volatility = Math.sqrt(variance) / mean;
    
    return Math.max(0.1, Math.min(0.9, 1 - volatility));
  }

  private analyzePredictionFactors(token: Token): string[] {
    const factors = [];
    
    if (token.marketCapChange24h && token.marketCapChange24h > 10) {
      factors.push('Strong 24h momentum');
    }
    
    if (token.marketCapChange7d && token.marketCapChange7d > 20) {
      factors.push('Positive weekly trend');
    }
    
    if (token.peakMarketCap && token.marketCap && token.marketCap > token.peakMarketCap * 0.8) {
      factors.push('Near all-time high');
    }
    
    if (token.marketCapRank && token.marketCapRank <= 100) {
      factors.push('Top 100 by market cap');
    }
    
    return factors;
  }
}