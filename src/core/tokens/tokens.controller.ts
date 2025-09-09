import {
  Controller,
  Get,
  Param,
  HttpStatus,
  Res,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { TokenPriceService } from '../signal/services/token-price.service';
import { SimpleTokenService } from './services/simple-token.service';
import { ZapperService } from '../zapper/services/zapper.service';
import { hasError, hasResponse } from '../../utils';

@ApiTags('token-service')
@Controller('token-service')
export class TokensController {
  private readonly logger = new Logger(TokensController.name);

  constructor(
    private readonly tokenPriceService: TokenPriceService,
    private readonly simpleTokenService: SimpleTokenService,
    private readonly zapperService: ZapperService,
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
    @Res() res: FastifyReply,
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

      return res.status(HttpStatus.OK).send({
        success: true,
        data: {
          address: contractAddress,
          price: price,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      this.logger.error(
        '❌ [TokensController] Error fetching token price:',
        error,
      );

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
    @Res() res: FastifyReply,
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

      return res.status(HttpStatus.OK).send({
        success: true,
        data: tokenInfo,
      });
    } catch (error) {
      this.logger.error(
        '❌ [TokensController] Error fetching token info:',
        error,
      );

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
    @Res() res: FastifyReply,
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

      return res.status(HttpStatus.OK).send({
        success: true,
        data: prices,
      });
    } catch (error) {
      this.logger.error(
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
    description:
      'Fetches token metadata, price, market cap and other information for a given contract address on Base network',
  })
  @ApiResponse({ status: 400, description: 'Invalid contract address format' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTokenByContractAddress(
    @Param('ca') contractAddress: string,
    @Res() res: FastifyReply,
  ) {
    try {
      const tokenInfo =
        await this.simpleTokenService.getTokenInfo(contractAddress);

      return res.status(HttpStatus.OK).send({
        success: true,
        data: { token: tokenInfo },
      });
    } catch (error) {
      this.logger.error(
        '❌ [TokensController] Error fetching token info:',
        error,
      );

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

  /**
   * Token search endpoint for miniapp
   *
   * Logic:
   * - If query is 42-character hex string (0x + 40 chars) → search by contract address
   * - Otherwise → search by name/symbol via existing token services
   * - Debounced calls (frontend waits 3s after user stops typing)
   *
   * @param query - Search query (contract address or token name/symbol)
   * @param res - HTTP response object
   * @returns Array of matching tokens with complete information
   */
  @Get('search')
  @ApiOperation({
    summary: 'Search tokens by address or name/symbol',
    description:
      'Smart search that detects contract addresses (42 chars) vs name/symbol queries',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of matching tokens',
    schema: {
      example: {
        success: true,
        data: [
          {
            address: '0x123...',
            symbol: 'ETH',
            name: 'Ethereum',
            image: 'https://...',
            marketCap: 450000000000,
            price: 3500.45,
            volume24h: 15000000,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Query parameter required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async searchTokens(@Query('q') query: string, @Res() res: FastifyReply) {
    try {
      if (!query || query.trim().length === 0) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'MISSING_QUERY',
          'Search query parameter "q" is required',
        );
      }

      const trimmedQuery = query.trim();

      // Check if query is a 42-character hex string (0x + 40 chars)
      const isContractAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmedQuery);

      if (isContractAddress) {
        // Search by contract address
        try {
          const tokenInfo =
            await this.simpleTokenService.getTokenInfo(trimmedQuery);

          if (tokenInfo) {
            return hasResponse(res, {
              success: true,
              data: [tokenInfo], // Return as array for consistent format
            });
          } else {
            return hasResponse(res, {
              success: true,
              data: [], // No results found
            });
          }
        } catch (addressError) {
          this.logger.error(
            '❌ [TokenSearch] Error searching by address:',
            addressError,
          );
          // Return empty results rather than error for better UX
          return hasResponse(res, {
            success: true,
            data: [],
          });
        }
      } else {
        // Search by name/symbol using Zapper service
        try {
          // Get trending tokens and filter by query
          const trendingTokens = await this.zapperService.getTrendingTokens(
            1,
            50,
          );

          const filteredTokens = trendingTokens.filter((token) => {
            const tokenData = token.token;
            const name = tokenData.name?.toLowerCase() || '';
            const symbol = tokenData.symbol?.toLowerCase() || '';
            const searchQuery = trimmedQuery.toLowerCase();

            return name.includes(searchQuery) || symbol.includes(searchQuery);
          });

          // Transform to expected format
          const searchResults = filteredTokens.slice(0, 10).map((item) => ({
            address: item.tokenAddress,
            symbol: item.token.symbol,
            name: item.token.name,
            image: item.token.imageUrlV2,
            marketCap: item.token.priceData?.marketCap || 0,
            price: item.token.priceData?.price || 0,
            volume24h: item.token.priceData?.volume24h || 0,
          }));

          return hasResponse(res, {
            success: true,
            data: searchResults,
          });
        } catch (nameError) {
          this.logger.error(
            '❌ [TokenSearch] Error searching by name/symbol:',
            nameError,
          );

          // Fallback: try to search using token service if it has search capabilities
          return hasResponse(res, {
            success: true,
            data: [],
            warning: 'Search temporarily unavailable, please try again',
          });
        }
      }
    } catch (error) {
      this.logger.error('❌ [TokenSearch] Unexpected error:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'TOKEN_SEARCH_ERROR',
        'Failed to search tokens. Please try again.',
      );
    }
  }
}
