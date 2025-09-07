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
  Headers,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { SignalService } from './signal.service';
import { SignalResolutionService } from './signal-resolution.service';
import { GetSignalsFeedDto } from './dto/get-signals-feed.dto';

import { hasResponse, hasError } from '../../utils';
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

@ApiTags('signal-service')
@Controller('signal-service')
export class SignalController {
  constructor(
    private readonly signalService: SignalService,
    private readonly signalResolutionService: SignalResolutionService,
  ) {}

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
      console.log('THE RESULT HEREEEE', result);
      console.log(
        'TOKENSSS',
        result.signals.map((signal) => console.log('TOKEN NNN', signal.token)),
      );
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

  // Debug/Admin endpoints for signal resolution
  @Post('admin/trigger-resolution')
  @ApiOperation({ summary: 'Manually trigger signal resolution (Admin only)' })
  @ApiResponse({ status: 200, description: 'Signal resolution triggered successfully' })
  async triggerSignalResolution(@Res() res: FastifyReply) {
    try {
      await this.signalResolutionService.triggerSignalResolution();
      return hasResponse(res, {
        message: 'Signal resolution triggered successfully',
        triggered: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error triggering signal resolution:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'triggerSignalResolution',
        'Failed to trigger signal resolution',
      );
    }
  }

  @Get('admin/resolution-stats')
  @ApiOperation({ summary: 'Get signal resolution statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Signal resolution statistics retrieved' })
  async getResolutionStats(@Res() res: FastifyReply) {
    try {
      const stats = await this.signalResolutionService.getResolutionStats();
      return hasResponse(res, {
        message: 'Resolution statistics retrieved successfully',
        ...stats
      });
    } catch (error) {
      console.error('Error fetching resolution stats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getResolutionStats',
        'Failed to fetch resolution statistics',
      );
    }
  }
}
