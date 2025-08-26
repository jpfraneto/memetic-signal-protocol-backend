import {
  Controller,
  Get,
  HttpStatus,
  Res,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { MarketCapitalService } from '../tokens/services/market-capital.service';
import { hasError } from '../../utils';

interface MarketCapLeaderboardResponse {
  rank: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  marketCap: number;
  marketCapChange24h: number;
  marketCapChange7d: number;
  peakMarketCap: number;
  image?: string;
}

@ApiTags('market-cap-leaderboard')
@Controller('market-cap-leaderboard')
export class MarketCapLeaderboardController {
  constructor(
    private readonly marketCapitalService: MarketCapitalService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get market capitalization leaderboard' })
  @ApiResponse({
    status: 200,
    description: 'Market cap leaderboard with token rankings',
    schema: {
      example: {
        success: true,
        data: {
          tokens: [
            {
              rank: 1,
              tokenAddress: '0x123...',
              symbol: 'TOKEN1',
              name: 'Token One',
              marketCap: 1000000000,
              marketCapChange24h: 5.2,
              marketCapChange7d: 15.8,
              peakMarketCap: 1200000000,
              image: 'https://...'
            }
          ],
          totalTokens: 250,
          totalMarketCap: 5000000000,
          averageMarketCap: 20000000
        },
      },
    },
  })
  async getMarketCapLeaderboard(
    @Query('limit') limit: number = 100,
    @Query('offset') offset: number = 0,
    @Res() res: FastifyReply,
  ) {
    try {
      const limitNum = Math.min(Number(limit) || 100, 500);
      const offsetNum = Number(offset) || 0;

      const leaderboard = await this.marketCapitalService.getMarketCapLeaderboard(limitNum + offsetNum);
      const analytics = await this.marketCapitalService.getMarketCapAnalytics();

      const paginatedTokens = leaderboard.slice(offsetNum, offsetNum + limitNum);

      const response = {
        tokens: paginatedTokens.map((token, index) => ({
          rank: offsetNum + index + 1,
          tokenAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          marketCap: token.market_data?.market_cap || 0,
          marketCapChange24h: token.market_data?.price_change_24h || 0,
          marketCapChange7d: 0, // Not available in simplified model
          peakMarketCap: token.market_data?.ath || 0,
          image: token.image,
        })),
        totalTokens: leaderboard.length,
        totalMarketCap: analytics.totalMarketCap,
        averageMarketCap: analytics.averageMarketCap,
      };

      return res.status(HttpStatus.OK).send({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('❌ [MarketCapLeaderboardController] Error fetching leaderboard:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMarketCapLeaderboard',
        'Failed to fetch market cap leaderboard',
      );
    }
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending tokens by market cap changes' })
  @ApiResponse({
    status: 200,
    description: 'Trending tokens based on market cap momentum',
    schema: {
      example: {
        success: true,
        data: {
          gainers24h: [],
          losers24h: [],
          trending: [],
          distribution: {
            micro: 150,
            small: 50,
            mid: 10,
            large: 5
          }
        },
      },
    },
  })
  async getTrendingTokens(@Res() res: FastifyReply) {
    try {
      const analytics = await this.marketCapitalService.getMarketCapAnalytics();

      const response = {
        gainers24h: analytics.topGainers24h.map((token, index) => ({
          rank: index + 1,
          tokenAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          marketCap: token.market_data?.market_cap || 0,
          marketCapChange24h: token.market_data?.price_change_24h || 0,
          image: token.image,
        })),
        losers24h: analytics.topLosers24h.map((token, index) => ({
          rank: index + 1,
          tokenAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          marketCap: token.market_data?.market_cap || 0,
          marketCapChange24h: token.market_data?.price_change_24h || 0,
          image: token.image,
        })),
        trending: analytics.trending.map((token, index) => ({
          rank: index + 1,
          tokenAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          marketCap: token.market_data?.market_cap || 0,
          marketCapChange24h: token.market_data?.price_change_24h || 0,
          image: token.image,
        })),
        distribution: analytics.marketCapDistribution,
      };

      return res.status(HttpStatus.OK).send({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('❌ [MarketCapLeaderboardController] Error fetching trending tokens:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTrendingTokens',
        'Failed to fetch trending tokens',
      );
    }
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get comprehensive market cap analytics' })
  @ApiResponse({
    status: 200,
    description: 'Comprehensive market capitalization analytics',
    schema: {
      example: {
        success: true,
        data: {
          totalMarketCap: 5000000000,
          averageMarketCap: 20000000,
          marketCapDistribution: {
            micro: 150,
            small: 50,
            mid: 10,
            large: 5
          },
          topPerformers: {
            byGrowth24h: [],
            byGrowth7d: [],
            byVolatility: []
          }
        },
      },
    },
  })
  async getMarketCapAnalytics(@Res() res: FastifyReply) {
    try {
      const analytics = await this.marketCapitalService.getMarketCapAnalytics();

      const response = {
        totalMarketCap: analytics.totalMarketCap,
        averageMarketCap: analytics.averageMarketCap,
        marketCapDistribution: analytics.marketCapDistribution,
        topPerformers: {
          byGrowth24h: analytics.topGainers24h.slice(0, 5),
          byGrowth7d: analytics.topGainers24h.filter(token => 
            token.market_data?.price_change_24h && token.market_data.price_change_24h > 0
          ).slice(0, 5),
          byVolatility: analytics.trending.slice(0, 5),
        }
      };

      return res.status(HttpStatus.OK).send({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('❌ [MarketCapLeaderboardController] Error fetching analytics:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMarketCapAnalytics',
        'Failed to fetch market cap analytics',
      );
    }
  }
}