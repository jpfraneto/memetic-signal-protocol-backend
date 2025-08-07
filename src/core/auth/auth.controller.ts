// Dependencies
import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { UserService } from '../user/services';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

import { logger } from '../../main';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';
import NeynarService from 'src/utils/neynar';

/**
 * Authentication controller for Farcaster miniapp integration.
 *
 * This controller handles user authentication and profile management using
 * Farcaster's QuickAuth system. The design is optimized for miniapp contexts
 * where users are implicitly authenticated through the Farcaster platform.
 *
 * Key architectural decisions:
 * - No explicit login/registration flow (handled automatically in /me)
 * - QuickAuth JWT tokens are verified but not regenerated
 * - User records are created/updated transparently on first access
 * - Logout only clears cookies (tokens remain valid until expiration)
 */
@ApiTags('auth-service')
@Controller('auth-service')
export class AuthController {
  constructor(private readonly userService: UserService) {}

  /**
   * Retrieves current user information with automatic user provisioning.
   *
   * This endpoint serves as the primary authentication mechanism for the miniapp.
   * It leverages Farcaster's QuickAuth system where users are always authenticated
   * within the miniapp context, eliminating the need for separate login flows.
   *
   * The endpoint returns runner profile data including:
   * - Total stats (distance, runs, time, streaks)
   * - Weekly statistics for the last 10 weeks
   * - Recent runs (last 10-20 runs)
   * - User profile information
   *
   * @param session - Verified QuickAuth JWT payload containing user FID and address
   * @param res - HTTP response object
   * @returns Runner profile data in the format expected by the frontend
   */
  @Get('/me')
  @UseGuards(AuthorizationGuard)
  async getMe(@Session() session: QuickAuthPayload, @Res() res: Response) {
    try {
      logger.log('Processing user profile request for FID:', session.sub);

      // Ensure user exists (create if necessary)
      let user = await this.userService.getByFid(session.sub, [
        'fid',
        'username',
        'pfpUrl',
        'totalRuns',
        'totalDistance',
        'createdAt',
        'updatedAt',
      ]);

      if (!user) {
        // Create new user if doesn't exist
        logger.log('Creating new user record for FID:', session.sub);
        const neynar = new NeynarService();
        const neynarUser = await neynar.getUserByFid(session.sub);

        const { user: newUser } = await this.userService.upsert(session.sub, {
          username: neynarUser.username,
          pfpUrl: neynarUser.pfp_url,
          totalRuns: 0,
          totalDistance: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        user = newUser;
      }

      return hasResponse(res, user);
    } catch (error) {
      logger.error('Failed to process user profile request:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMe',
        'Unable to retrieve user profile.',
      );
    }
  }

  /**
   * Clears authentication cookies for logout functionality.
   *
   * Note: This endpoint only clears server-side cookies. QuickAuth tokens
   * remain valid until their expiration time since they are stateless JWTs.
   * Frontend applications should discard tokens locally for complete logout.
   *
   * @param req - Incoming HTTP request (used by guard for authentication)
   * @param res - HTTP response object for cookie manipulation
   * @returns Success confirmation
   */
  @Post('/logout')
  @UseGuards(AuthorizationGuard)
  async logOut(@Req() req: Request, @Res() res: Response) {
    try {
      res.clearCookie('Authorization');
      return hasResponse(res, 'Successfully logged out.');
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'logOut',
        'An unexpected error occurred during logout.',
      );
    }
  }
}
