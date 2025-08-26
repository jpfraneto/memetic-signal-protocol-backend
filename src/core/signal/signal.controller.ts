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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { SignalService } from './signal.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import { GetSignalsFeedDto } from './dto/get-signals-feed.dto';
import {
  SignalResponseDto,
  SignalsFeedResponseDto,
  SessionStatusDto,
} from './dto/signal-response.dto';
import { hasResponse, hasError } from '../../utils';
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

@ApiTags('signal-service')
@Controller('signal-service')
export class SignalController {
  constructor(private readonly signalService: SignalService) {}

  @Get('session/start/:transactionHash?')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Start 88-second signal session with optional transaction hash',
  })
  async startSession(
    @Session() session: QuickAuthPayload,
    @Param('transactionHash') transactionHash: string | undefined,
    @Res() res: FastifyReply,
  ) {
    try {
      console.log('IN HERE THE TRANSACTION HASH IS', transactionHash);
      const result = await this.signalService.startSession(
        session.sub,
        false,
        transactionHash || undefined,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'startSession',
        error.message,
      );
    }
  }

  @Post('session/retry')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Start retry session with JBM payment' })
  async startRetrySession(
    @Session() session: QuickAuthPayload,
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.signalService.startSession(session.sub, true);
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'startRetrySession',
        error.message,
      );
    }
  }

  @Get('session/status')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get current session status' })
  async getSessionStatus(
    @Session() session: QuickAuthPayload,
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.signalService.getSessionStatus(session.sub);
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'getSessionStatus',
        error.message,
      );
    }
  }

  @Put('default-tokens')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Set user default 8 tokens' })
  async setDefaultTokens(
    @Session() session: QuickAuthPayload,
    @Body() body: { tokens: Array<{ ca: string; ticker: string }> },
    @Res() res: FastifyReply,
  ) {
    try {
      await this.signalService.setDefaultTokens(session.sub, body.tokens);
      return hasResponse(res, { success: true });
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'setDefaultTokens',
        error.message,
      );
    }
  }

  @Post('signal')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Submit daily signal with 8 token predictions' })
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
    @Session() session: QuickAuthPayload,
    @Body() createSignalDto: CreateSignalDto,
    @Res() res: FastifyReply,
  ) {
    try {
      // Override FID from session
      createSignalDto.fid = session.sub;

      const signal = await this.signalService.createSignal(createSignalDto);
      return hasResponse(res, signal);
    } catch (error) {
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
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.signalService.getSignalsFeed(query);
      return hasResponse(res, result);
    } catch (error) {
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
    @Res() res: FastifyReply,
  ) {
    try {
      const signal = await this.signalService.getSignalById(signalId);
      return hasResponse(res, signal);
    } catch (error) {
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
  @ApiOperation({ summary: 'Manually settle signal (admin only)' })
  @ApiResponse({ status: 200, description: 'Signal settled successfully' })
  @ApiResponse({ status: 404, description: 'Signal not found' })
  @ApiResponse({ status: 409, description: 'Signal already settled' })
  async settleSignal(
    @Param('signalId') signalId: string,
    @Body() body: { exitMarketCaps: string[]; correctPredictions: number },
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.signalService.settleSignal(
        signalId,
        body.exitMarketCaps,
        body.correctPredictions,
      );
      return hasResponse(res, result);
    } catch (error) {
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
