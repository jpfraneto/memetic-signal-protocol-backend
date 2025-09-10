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
  Logger,
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
  private readonly logger = new Logger(SignalController.name);

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
          total: 0,
          hasMore: false,
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
      return hasResponse(res, {
        success: true,
        data: {
          signals: result.signals,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getSignalsFeed',
        'Failed to fetch signals feed',
      );
    }
  }

  @Get('ca/:ca')
  @ApiOperation({ summary: 'Get all signals for a specific contract address (token)' })
  @ApiResponse({
    status: 200,
    description: 'All signals for the given contract address in chronological order (most recent first)',
    schema: {
      example: {
        success: true,
        data: {
          signals: [],
          total: 0,
          hasMore: false,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid contract address parameter' })
  @ApiResponse({ status: 404, description: 'No signals found for this contract address' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getSignalsByCA(
    @Param('ca') ca: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status: string | undefined,
    @Res() res: FastifyReply,
  ) {
    try {
      // Validate contract address format (basic Ethereum address validation)
      if (!ca || !/^0x[a-fA-F0-9]{40}$/.test(ca)) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getSignalsByCA',
          'Invalid contract address format. Must be a valid Ethereum address (0x...).',
        );
      }

      // Validate pagination parameters
      const parsedPage = Math.max(1, Number(page) || 1);
      const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));

      // Validate status parameter
      if (
        status &&
        !['resolved', 'direction', 'open', 'closed'].includes(status)
      ) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getSignalsByCA',
          'Invalid status parameter. Must be one of: resolved, direction, open, closed.',
        );
      }

      const result = await this.signalService.getSignalsByCA(
        ca,
        { page: parsedPage, limit: parsedLimit, status },
      );

      return hasResponse(res, {
        success: true,
        data: {
          signals: result.signals,
          total: result.total,
          hasMore: result.hasMore,
          pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total: result.total,
            pages: Math.ceil(result.total / parsedLimit),
          },
          contractAddress: ca,
        },
      });
    } catch (error) {
      this.logger.error(`Error fetching signals for CA ${ca}:`, error);

      if (error.message.includes('not found') || error.message.includes('No signals found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getSignalsByCA',
          `No signals found for contract address ${ca}`,
        );
      }

      if (
        error.message.includes('database') ||
        error.message.includes('connection')
      ) {
        return hasError(
          res,
          HttpStatus.SERVICE_UNAVAILABLE,
          'getSignalsByCA',
          'Database connection error. Please try again later.',
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getSignalsByCA',
        'An unexpected error occurred while fetching signals for this contract address',
      );
    }
  }

  @Get('user/:fid')
  @ApiOperation({ summary: 'Get user signals in chronological order' })
  @ApiResponse({
    status: 200,
    description: 'User signals in chronological order (most recent first)',
    schema: {
      example: {
        success: true,
        data: {
          signals: [],
          total: 0,
          hasMore: false,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid FID parameter' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserSignals(
    @Param('fid') fid: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status: string | undefined,
    @Res() res: FastifyReply,
  ) {
    try {
      // Validate FID
      const parsedFid = Number(fid);
      if (isNaN(parsedFid) || parsedFid <= 0) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getUserSignals',
          'Invalid FID parameter. Must be a positive integer.',
        );
      }

      // Validate pagination parameters
      const parsedPage = Math.max(1, Number(page) || 1);
      const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));

      // Validate status parameter
      if (
        status &&
        !['resolved', 'direction', 'open', 'closed'].includes(status)
      ) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getUserSignals',
          'Invalid status parameter. Must be one of: resolved, direction, open, closed.',
        );
      }

      const result = await this.signalService.getUserSignalsChronological(
        parsedFid,
        { page: parsedPage, limit: parsedLimit, status },
      );

      return hasResponse(res, {
        success: true,
        data: {
          signals: result.signals,
          total: result.total,
          hasMore: result.hasMore,
          pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total: result.total,
            pages: Math.ceil(result.total / parsedLimit),
          },
        },
      });
    } catch (error) {
      this.logger.error(`Error fetching signals for user ${fid}:`, error);

      if (error.message.includes('not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserSignals',
          `User with FID ${fid} not found`,
        );
      }

      if (
        error.message.includes('database') ||
        error.message.includes('connection')
      ) {
        return hasError(
          res,
          HttpStatus.SERVICE_UNAVAILABLE,
          'getUserSignals',
          'Database connection error. Please try again later.',
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserSignals',
        'An unexpected error occurred while fetching user signals',
      );
    }
  }

  // Debug/Admin endpoints for signal resolution
  @Post('admin/trigger-resolution')
  @ApiOperation({ summary: 'Manually trigger signal resolution (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Signal resolution triggered successfully',
  })
  async triggerSignalResolution(@Res() res: FastifyReply) {
    try {
      await this.signalResolutionService.triggerSignalResolution();
      return hasResponse(res, {
        message: 'Signal resolution triggered successfully',
        triggered: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error triggering signal resolution:', error);
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
  @ApiResponse({
    status: 200,
    description: 'Signal resolution statistics retrieved',
  })
  async getResolutionStats(@Res() res: FastifyReply) {
    try {
      const stats = await this.signalResolutionService.getResolutionStats();
      return hasResponse(res, {
        message: 'Resolution statistics retrieved successfully',
        ...stats,
      });
    } catch (error) {
      this.logger.error('Error fetching resolution stats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getResolutionStats',
        'Failed to fetch resolution statistics',
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
}
