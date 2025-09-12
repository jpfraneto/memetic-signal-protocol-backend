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
import { FastifyReply } from 'fastify';

// Services
import { UserService } from './services';

// DTOs
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UserSignalsQueryDto } from './dto/user-signals-query.dto';
import {
  UsersListResponseDto,
  UserDetailResponseDto,
  UserSignalsResponseDto,
} from './dto/user-response.dto';

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
  async getUsers(@Query() query: GetUsersQueryDto, @Res() res: FastifyReply) {
    try {
      const result = await this.userService.getUsers(query);

      return res.status(HttpStatus.OK).send({
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

  @Get(':fid')
  @ApiOperation({
    summary: 'Get user details by FID with recent signals and stats',
  })
  @ApiResponse({
    status: 200,
    description: 'User details with recent signals and statistics',
    type: UserDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserById(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.userService.getUserWithDetailsEnhanced(fid);

      return res.status(HttpStatus.OK).send({
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

  @Get(':fid/signals')
  @ApiOperation({ summary: 'Get user signals with pagination and filtering' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user signals',
    type: UserSignalsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUserSignals(
    @Param('fid', ParseIntPipe) fid: number,
    @Query() query: UserSignalsQueryDto,
    @Res() res: FastifyReply,
  ) {
    try {
      const result = await this.userService.getUserSignals(fid, query);

      return res.status(HttpStatus.OK).send({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('❌ [UserController] Error fetching user signals:', error);

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserSignals',
        'Failed to fetch user signals',
      );
    }
  }

  @Get(':fid/recalculate-signals')
  @ApiOperation({ summary: 'Recalculate total signals for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'Total signals recalculated successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async recalculateUserSignals(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: FastifyReply,
  ) {
    try {
      await this.userService.recalculateUserTotalSignals(fid);

      return res.status(HttpStatus.OK).send({
        success: true,
        message: `Total signals recalculated for user ${fid}`,
      });
    } catch (error) {
      console.error(
        '❌ [UserController] Error recalculating user signals:',
        error,
      );

      if (error.message.includes('not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'recalculateUserSignals',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'recalculateUserSignals',
        'Failed to recalculate user signals',
      );
    }
  }
}
