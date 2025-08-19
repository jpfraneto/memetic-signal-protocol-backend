import {
  Controller,
  Get,
  Param,
  HttpStatus,
  Res,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from './services/simple-token.service';
import { MarketCapitalService } from './services/market-capital.service';
import { TokenResponseDto } from './dto/token-response.dto';
import { hasError } from '../../utils';

@ApiTags('token-service')
@Controller('token-service')
export class TokensController {
  constructor(
    private readonly tokenPriceService: TokenPriceService,
    private readonly simpleTokenService: SimpleTokenService,
    private readonly marketCapitalService: MarketCapitalService,
  ) {}

  @Get('price/:contractAddress')
  @ApiOperation({ summary: 'Get token price by contract address' })
  @ApiResponse({
    status: 200,
    description: 'Token price in USD',
    schema: {
      example: {
        success: true,
        data: {
          address: '0x123...',
          price: 1.25,
          timestamp: 1234567890,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTokenPrice(
    @Param('contractAddress') contractAddress: string,
    @Res() res: Response,
  ) {
    try {
      const price = await this.tokenPriceService.getTokenPrice(contractAddress);

      if (price === null) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getTokenPrice',
          'Token price not found',
        );
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        data: {
          address: contractAddress,
          price: price,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching token price:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTokenPrice',
        'Failed to fetch token price',
      );
    }
  }

  @Get('info/:contractAddress')
  @ApiOperation({ summary: 'Get token metadata by contract address' })
  @ApiResponse({
    status: 200,
    description: 'Token metadata',
    schema: {
      example: {
        success: true,
        data: {
          address: '0x123...',
          symbol: 'TOKEN',
          name: 'Token Name',
          image: 'https://...',
          marketCap: 1000000,
          volume24h: 50000,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTokenInfo(
    @Param('contractAddress') contractAddress: string,
    @Res() res: Response,
  ) {
    try {
      const tokenInfo =
        await this.tokenPriceService.getTokenInfo(contractAddress);

      if (!tokenInfo) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getTokenInfo',
          'Token info not found',
        );
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        data: tokenInfo,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching token info:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTokenInfo',
        'Failed to fetch token info',
      );
    }
  }

  @Get('prices')
  @ApiOperation({ summary: 'Get multiple token prices' })
  @ApiResponse({
    status: 200,
    description: 'Multiple token prices',
    schema: {
      example: {
        success: true,
        data: {
          '0x123...': 1.25,
          '0x456...': 0.95,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid addresses provided' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTokenPrices(
    @Query('addresses') addresses: string,
    @Res() res: Response,
  ) {
    try {
      if (!addresses) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getTokenPrices',
          'addresses query parameter is required',
        );
      }

      const addressList = addresses.split(',').map((addr) => addr.trim());

      if (addressList.length === 0) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getTokenPrices',
          'No valid addresses provided',
        );
      }

      if (addressList.length > 20) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getTokenPrices',
          'Maximum 20 addresses allowed',
        );
      }

      const priceMap = await this.tokenPriceService.getTokenPrices(addressList);

      const prices: Record<string, number> = {};
      for (const [address, price] of Object.entries(priceMap)) {
        prices[address] = price;
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        data: prices,
      });
    } catch (error) {
      console.error(
        '❌ [TokensController] Error fetching token prices:',
        error,
      );

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTokenPrices',
        'Failed to fetch token prices',
      );
    }
  }

  @Get('ca/:ca')
  @ApiOperation({
    summary: 'Get comprehensive token information by contract address',
    description: 'Fetches token metadata, price, market cap and other information for a given contract address on Base network',
  })
  @ApiResponse({
    status: 200,
    description: 'Token information successfully retrieved',
    type: TokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid contract address format' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTokenByContractAddress(
    @Param('ca') contractAddress: string,
    @Res() res: Response,
  ) {
    try {
      const tokenInfo = await this.simpleTokenService.getTokenInfo(contractAddress);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: tokenInfo,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching token info:', error);

      if (error.message?.includes('Invalid contract address format')) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getTokenByContractAddress',
          'Invalid contract address format',
        );
      }

      if (error.message?.includes('Token not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getTokenByContractAddress',
          'Token not found',
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTokenByContractAddress',
        'Failed to fetch token information',
      );
    }
  }

  @Get('market-cap/analytics')
  @ApiOperation({ summary: 'Get market capital analytics' })
  @ApiResponse({
    status: 200,
    description: 'Market capital analytics including top gainers, losers, and distribution',
    schema: {
      example: {
        success: true,
        data: {
          totalMarketCap: 1000000000,
          averageMarketCap: 5000000,
          topGainers24h: [],
          topLosers24h: [],
          marketCapDistribution: {
            micro: 150,
            small: 50,
            mid: 10,
            large: 5
          },
          trending: []
        },
      },
    },
  })
  async getMarketCapAnalytics(@Res() res: Response) {
    try {
      const analytics = await this.marketCapitalService.getMarketCapAnalytics();
      
      return res.status(HttpStatus.OK).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching market cap analytics:', error);
      
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMarketCapAnalytics',
        'Failed to fetch market cap analytics',
      );
    }
  }

  @Get('market-cap/leaderboard')
  @ApiOperation({ summary: 'Get market capital leaderboard' })
  @ApiResponse({
    status: 200,
    description: 'Tokens ranked by market capitalization',
    schema: {
      example: {
        success: true,
        data: [
          {
            address: '0x123...',
            symbol: 'TOKEN1',
            name: 'Token One',
            marketCap: 1000000000,
            marketCapRank: 1,
            marketCapChange24h: 5.2
          }
        ],
      },
    },
  })
  async getMarketCapLeaderboard(
    @Query('limit') limit: number = 100,
    @Res() res: Response,
  ) {
    try {
      const leaderboard = await this.marketCapitalService.getMarketCapLeaderboard(
        limit || 100
      );
      
      return res.status(HttpStatus.OK).json({
        success: true,
        data: leaderboard,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching market cap leaderboard:', error);
      
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMarketCapLeaderboard',
        'Failed to fetch market cap leaderboard',
      );
    }
  }

  @Get('market-cap/predictions/:contractAddress')
  @ApiOperation({ summary: 'Get market capital predictions for a token' })
  @ApiResponse({
    status: 200,
    description: 'Market capital predictions for different timeframes',
    schema: {
      example: {
        success: true,
        data: [
          {
            tokenAddress: '0x123...',
            currentMarketCap: 1000000,
            predictedMarketCap: 1200000,
            confidence: 0.75,
            timeframe: '24h',
            factors: ['Strong 24h momentum', 'Positive weekly trend']
          }
        ],
      },
    },
  })
  async getMarketCapPredictions(
    @Param('contractAddress') contractAddress: string,
    @Res() res: Response,
  ) {
    try {
      const predictions = await this.marketCapitalService.getMarketCapPredictions(contractAddress);
      
      return res.status(HttpStatus.OK).json({
        success: true,
        data: predictions,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error fetching market cap predictions:', error);
      
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMarketCapPredictions',
        'Failed to fetch market cap predictions',
      );
    }
  }

  @Get('market-cap/update/:contractAddress')
  @ApiOperation({ summary: 'Update market capital data for a token' })
  @ApiResponse({
    status: 200,
    description: 'Market capital data updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          address: '0x123...',
          marketCap: 1000000,
          marketCapChange24h: 5.2,
          marketCapRank: 42,
          lastMarketCapUpdate: '2024-01-01T00:00:00.000Z'
        },
      },
    },
  })
  async updateMarketCapData(
    @Param('contractAddress') contractAddress: string,
    @Res() res: Response,
  ) {
    try {
      const updatedToken = await this.marketCapitalService.updateMarketCapData(contractAddress);
      
      return res.status(HttpStatus.OK).json({
        success: true,
        data: updatedToken,
      });
    } catch (error) {
      console.error('❌ [TokensController] Error updating market cap data:', error);
      
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'updateMarketCapData',
        'Failed to update market cap data',
      );
    }
  }
}
