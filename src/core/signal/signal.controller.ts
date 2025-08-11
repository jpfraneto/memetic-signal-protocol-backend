import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

import { SignalService } from './signal.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import { GetSignalsFeedDto } from './dto/get-signals-feed.dto';
import { hasError } from '../../utils';

@ApiTags('signal-service')
@Controller('signal-service')
export class SignalController {
  constructor(private readonly signalService: SignalService) {}

  @Post('signal')
  @ApiOperation({ summary: 'Create new prediction call' })
  @ApiResponse({
    status: 201,
    description: 'Signal created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'signal-123',
          fid: 12345,
          username: 'trader1',
          tokenAddress: '0x123...',
          tokenSymbol: 'TOKEN',
          direction: 'up',
          entryPrice: 1.25,
          timeframe: '24h',
          status: 'active',
          expiresAt: '2024-01-02T00:00:00.000Z',
          txHash: '0x456...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createSignal(
    @Body() createSignalDto: CreateSignalDto,
    @Res() res: Response,
  ) {
    try {
      const signal = await this.signalService.createSignal(createSignalDto);

      return res.status(HttpStatus.CREATED).json({
        success: true,
        data: signal,
      });
    } catch (error) {
      console.error('❌ [SignalController] Error creating signal:', error);

      if (error.status === 409) {
        return hasError(
          res,
          HttpStatus.CONFLICT,
          'createSignal',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'createSignal',
        'Failed to create signal',
      );
    }
  }

  @Get('feed')
  @ApiOperation({ summary: 'Get signal feed with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of signals',
    schema: {
      example: {
        success: true,
        data: {
          signals: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 100,
            pages: 5,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getSignalsFeed(
    @Query() query: GetSignalsFeedDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.signalService.getSignalsFeed(query);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        '❌ [SignalController] Error fetching signals feed:',
        error,
      );

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getSignalsFeed',
        'Failed to fetch signals feed',
      );
    }
  }

  @Get(':signalId')
  @ApiOperation({ summary: 'Get specific signal by ID' })
  @ApiResponse({
    status: 200,
    description: 'Signal details',
  })
  @ApiResponse({ status: 404, description: 'Signal not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getSignalById(
    @Param('signalId') signalId: string,
    @Res() res: Response,
  ) {
    try {
      const signal = await this.signalService.getSignalById(signalId);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: signal,
      });
    } catch (error) {
      console.error('❌ [SignalController] Error fetching signal:', error);

      if (error.status === 404) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getSignalById',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getSignalById',
        'Failed to fetch signal details',
      );
    }
  }

  @Put(':signalId/settle')
  @ApiOperation({ summary: 'Manually settle expired signal' })
  @ApiResponse({
    status: 200,
    description: 'Signal settled successfully',
  })
  @ApiResponse({ status: 404, description: 'Signal not found' })
  @ApiResponse({ status: 409, description: 'Signal already settled' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async settleSignal(
    @Param('signalId') signalId: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.signalService.settleSignal(signalId);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [SignalController] Error settling signal:', error);

      if (error.status === 404) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'settleSignal',
          error.message,
        );
      }

      if (error.status === 409) {
        return hasError(
          res,
          HttpStatus.CONFLICT,
          'settleSignal',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'settleSignal',
        'Failed to settle signal',
      );
    }
  }
}
