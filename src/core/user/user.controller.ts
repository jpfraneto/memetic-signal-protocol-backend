// Dependencies
import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { UserService } from './services';

// Security

// Models
import { User } from '../../models';

// Utils
import { hasError, hasResponse } from '../../utils';

@ApiTags('user-service')
@Controller('user-service')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Retrieves a user by their FID with their last 10 training sessions.
   * If the user doesn't exist, creates them from Neynar data.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @returns {Promise<User>} The user with the specified FID and recent sessions.
   */
  @Get('/:fid')
  async getUserById(@Param('fid') fid: User['fid'], @Res() res: Response) {
    try {
      const user = await this.userService.getByFid(fid);

      return hasResponse(res, user);
    } catch (error) {
      console.error('❌ [UserController] Error getting user by FID:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserById',
        'Failed to retrieve user information',
      );
    }
  }
}
