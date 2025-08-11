import { Controller, Get, Param, HttpStatus, Res, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

import { TokenPriceService } from '../call/services/token-price.service';
import { hasError } from '../../utils';

@ApiTags('tokens-service')
@Controller('tokens-service')
export class TokensController {
  constructor(private readonly tokenPriceService: TokenPriceService) {}

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
      for (const [address, price] of priceMap.entries()) {
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
}
