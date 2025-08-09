// Dependencies
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { UserService } from './services';

// DTOs
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UserCallsQueryDto } from './dto/user-calls-query.dto';
import {
  UsersListResponseDto,
  UserDetailResponseDto,
  UserCallsResponseDto,
  UserStatsResponseDto,
} from './dto/user-response.dto';

// Models
import { User } from '../../models';

// Utils
import { hasError } from '../../utils';

@ApiTags('users-service')
@Controller('users-service')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get paginated list of users with metrics' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users with their performance metrics',
    type: UsersListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUsers(@Query() query: GetUsersQueryDto, @Res() res: Response) {
    try {
      const result = await this.userService.getUsers(query);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [UserController] Error fetching users:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUsers',
        'Failed to fetch users',
      );
    }
  }

  @Get('users/:fid')
  @ApiOperation({
    summary: 'Get user details by FID with recent calls and stats',
  })
  @ApiResponse({
    status: 200,
    description: 'User details with recent calls and statistics',
    type: UserDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserById(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      const result = await this.userService.getUserWithDetails(fid);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [UserController] Error getting user by FID:', error);

      if (error.message.includes('not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserById',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserById',
        'Failed to retrieve user information',
      );
    }
  }

  @Get('users/:fid/calls')
  @ApiOperation({ summary: 'Get user calls with pagination and filtering' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user calls',
    type: UserCallsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserCalls(
    @Param('fid', ParseIntPipe) fid: number,
    @Query() query: UserCallsQueryDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.userService.getUserCalls(fid, query);

      return res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [UserController] Error fetching user calls:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserCalls',
        'Failed to fetch user calls',
      );
    }
  }

  @Get('users/:fid/recalculate-calls')
  @ApiOperation({ summary: 'Recalculate total calls for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'Total calls recalculated successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async recalculateUserCalls(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      await this.userService.recalculateUserTotalCalls(fid);

      return res.status(HttpStatus.OK).json({
        success: true,
        message: `Total calls recalculated for user ${fid}`,
      });
    } catch (error) {
      console.error(
        '❌ [UserController] Error recalculating user calls:',
        error,
      );

      if (error.message.includes('not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'recalculateUserCalls',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'recalculateUserCalls',
        'Failed to recalculate user calls',
      );
    }
  }
}
