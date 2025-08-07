// Dependencies
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';

// Guards
import { AuthorizationGuard, QuickAuthPayload } from './authorization.guard';

// Services
import { AuthService } from '../../core/auth/services';
import { UserService } from '../../core/user/services';

/**
 * Ban guard that extends AuthorizationGuard to check if user is banned.
 *
 * This guard first authenticates the user using the AuthorizationGuard,
 * then checks if the authenticated user is banned from the platform.
 * If the user is banned, access is denied with a ForbiddenException.
 *
 * Usage: Apply this guard to routes where banned users should be blocked
 * from performing actions (e.g., submitting workouts, posting comments).
 */
@Injectable()
export class BanGuard extends AuthorizationGuard implements CanActivate {
  constructor(
    authService: AuthService,
    private readonly userService: UserService,
  ) {
    super(authService);
  }

  /**
   * Validates request authorization and checks if user is banned.
   *
   * This method:
   * 1. Runs parent authentication check
   * 2. Retrieves user from database using FID from token
   * 3. Checks if user is banned
   * 4. Allows or denies access based on ban status
   *
   * @param context - NestJS execution context
   * @returns Promise<boolean> - true if user is authenticated and not banned
   * @throws ForbiddenException if user is banned
   * @throws UnauthorizedException if authentication fails
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, run the parent authentication check
    const isAuthenticated = await super.canActivate(context);

    if (!isAuthenticated) {
      return false;
    }

    try {
      const req = context
        .switchToHttp()
        .getRequest<Request & { user: QuickAuthPayload }>();

      // Get the authenticated user's FID from the token payload
      const userFid = req.user.sub;

      // Check if user exists and is banned
      const user = await this.userService.getByFid(userFid, [
        'isBanned',
        'bannedAt',
        'username',
      ]);

      if (!user) {
        // User doesn't exist in database - this shouldn't happen after auth
        // but we'll allow it to proceed and let the route handler deal with user creation
        return true;
      }

      if (user.isBanned) {
        throw new ForbiddenException(
          `Access denied. User ${user.username} (FID: ${userFid}) is banned from the platform.`,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      console.error('❌ [BanGuard] Error checking user ban status:', error);
      throw new InternalServerErrorException(
        'Failed to verify user access permissions',
      );
    }
  }
}
