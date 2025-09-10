import { Controller, Get, Query, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { LeaderboardService } from './leaderboard.service';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { hasError } from '../../utils';

@ApiTags('leaderboard-service')
@Controller('leaderboard-service')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('')
  @ApiOperation({ summary: 'Get leaderboard of top performers' })
  @ApiResponse({
    status: 200,
    description: 'Ranked list of top users by MFS score',
    schema: {
      example: {
        success: true,
        data: {
          users: [
            {
              fid: 12345,
              username: 'trader1',
              totalCalls: 25,
              activeCalls: 3,
              settledCalls: 22,
              winRate: 68.2,
              mfsScore: 0.756,
              rank: 1,
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 50,
            pages: 3,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getLeaderboard(
    @Query() query: GetLeaderboardDto,
    @Res() res: FastifyReply,
  ) {
    try {
      // Validate query parameters
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

      const validatedQuery = {
        ...query,
        page,
        limit,
      };

      const result =
        await this.leaderboardService.getLeaderboard(validatedQuery);

      return res.status(HttpStatus.OK).send({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        '❌ [LeaderboardController] Error fetching leaderboard:',
        error,
      );

      if (
        error.message.includes('database') ||
        error.message.includes('connection')
      ) {
        return hasError(
          res,
          HttpStatus.SERVICE_UNAVAILABLE,
          'getLeaderboard',
          'Database connection error. Please try again later.',
        );
      }

      if (error.message.includes('timeout')) {
        return hasError(
          res,
          HttpStatus.REQUEST_TIMEOUT,
          'getLeaderboard',
          'Request timed out. Please try again.',
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboard',
        'An unexpected error occurred while fetching the leaderboard',
      );
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get overall leaderboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Overall leaderboard statistics',
    schema: {
      example: {
        success: true,
        data: {
          totalUsers: 150,
          qualifiedUsers: 45,
          totalCalls: 1250,
          avgWinRate: 52.3,
          topMfsScore: 0.892,
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getLeaderboardStats(@Res() res: FastifyReply) {
    try {
      const stats = await this.leaderboardService.getLeaderboardStats();

      return res.status(HttpStatus.OK).send({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error(
        '❌ [LeaderboardController] Error fetching leaderboard stats:',
        error,
      );

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboardStats',
        'Failed to fetch leaderboard statistics',
      );
    }
  }
}
