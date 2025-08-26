// Dependencies
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiTags } from '@nestjs/swagger';

// Services
import { UserService } from '../user/services';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ZapperService } from '../zapper/services';
import { UserStateOnTheSystemEnum } from '../../models/User/User.types';

enum DailySignalState {
  WITHOUT_ACCOUNT = 'WITHOUT_ACCOUNT',
  WITH_ACCOUNT = 'WITH_ACCOUNT',
  SIGNALED_TODAY = 'SIGNALED_TODAY',
  ONE_RETRY_LEFT = 'ONE_RETRY_LEFT',
  FAILED_TODAY = 'FAILED_TODAY',
  FRESH_TODAY = 'FRESH_TODAY',
}

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

import { logger } from '../../main';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';
import NeynarService from 'src/utils/neynar';

// DTOs
import { CreateAccountDto } from './dto/create-account.dto';
import { SyncUserDataDto, UserDailyStatusDto } from './dto/sync-user-data.dto';

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
 * - First-time users trigger a blockchain transaction for trust and transparency
 */
@ApiTags('auth-service')
@Controller('auth-service')
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly blockchainService: BlockchainService,
    private readonly zapperService: ZapperService,
  ) {}

  /**
   * Retrieves current user information with automatic user provisioning.
   *
   * This endpoint serves as the primary authentication mechanism for the miniapp.
   * It leverages Farcaster's QuickAuth system where users are always authenticated
   * within the miniapp context, eliminating the need for separate login flows.
   *
   * For first-time users (stateOnTheSystem: 'ZERO'), this endpoint:
   * 1. Creates a user record in the database
   * 2. Initiates a blockchain transaction to record the user's first interaction
   * 3. Returns user data with state 'ZERO' to trigger frontend "create account" flow
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
  async getMe(
    @Session() session: QuickAuthPayload,
    @Res() res: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    try {
      logger.log('Processing user profile request for FID:', session.sub);

      // Ensure user exists (create if necessary)
      let user = await this.userService.getByFid(session.sub, [
        'fid',
        'username',
        'pfpUrl',
        'createdAt',
        'updatedAt',
        'stateOnTheSystem',
      ]);
      console.log('IN HERE THE USER IS', user);

      if (!user) {
        // Create new user if doesn't exist
        logger.log('Creating new user record for FID:', session.sub);
        const neynar = new NeynarService();
        const neynarUser = await neynar.getUserByFid(session.sub);

        const { user: newUser } = await this.userService.create(session.sub, {
          username: neynarUser.username,
          pfpUrl: neynarUser.pfp_url,
          createdAt: new Date(),
          updatedAt: new Date(),
          stateOnTheSystem: UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
        });

        user = newUser;
      }

      // Handle query parameters from frontend (smart contract data)
      const queryParams = req.query as any;
      console.log('🔍 [GET /me] Query parameters:', queryParams);

      // Process contract account data from query params if provided
      if (queryParams?.fid || queryParams?.isBanned !== undefined) {
        console.log(
          '📄 [GET /me] Processing contract account data from query params...',
        );

        const contractAccount = {
          fid: queryParams?.fid ? parseInt(queryParams?.fid as string) : 0,
          isBanned: queryParams?.isBanned === 'true',
        };

        console.log('🏗️ [GET /me] Contract account details:', contractAccount);

        // Validate that contract account FID matches authenticated user
        if (contractAccount.fid !== session.sub) {
          console.log('❌ [GET /me] FID mismatch detected!');
          logger.warn(
            `Contract account FID mismatch: ${contractAccount.fid} vs ${session.sub}`,
          );
          return hasError(
            res,
            HttpStatus.BAD_REQUEST,
            'getMe',
            'Contract account FID does not match authenticated user.',
          );
        }

        // Update user with contract account data
        const updateData: any = {
          walletAddress: queryParams?.userAddress
            ? (queryParams?.userAddress as string).toLowerCase()
            : null,
          updatedAt: new Date(),
          isSubscriber: false, // Default to false, will be updated by blockchain events
        };

        // Set appropriate state based on current user state
        if (
          user.stateOnTheSystem === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT
        ) {
          updateData.stateOnTheSystem = UserStateOnTheSystemEnum.WITH_ACCOUNT;
          console.log(
            '🎉 [GET /me] Setting WITH_ACCOUNT state for new account!',
          );
        }

        await this.userService.update(session.sub, updateData);
        Object.assign(user, updateData);

        console.log(
          '✅ [GET /me] Contract account data updated from query params',
        );
      } else {
        // Fallback: Check if user has an account on the smart contract
        if (queryParams?.userAddress) {
          logger.log(
            'Checking smart contract account for wallet:',
            queryParams?.userAddress,
          );
          const blockchainAccount =
            await this.blockchainService.getAccountFromBlockchain(
              queryParams?.userAddress as string,
            );

          if (blockchainAccount && blockchainAccount.fid > 0) {
            // User has an account on smart contract, update database state
            logger.log(
              'User has smart contract account, updating state to WITH_ACCOUNT',
            );

            // Update user state if it's currently WITHOUT_ACCOUNT
            if (
              user.stateOnTheSystem === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT
            ) {
              const updatedData = {
                stateOnTheSystem: UserStateOnTheSystemEnum.WITH_ACCOUNT,
                walletAddress: (
                  queryParams?.userAddress as string
                ).toLowerCase(),
                updatedAt: new Date(),
                isSubscriber: blockchainAccount.isSubscriber,
              };

              await this.userService.update(session.sub, updatedData);

              // Update the local user object to reflect the changes
              user.stateOnTheSystem = UserStateOnTheSystemEnum.WITH_ACCOUNT;
              user.walletAddress = (
                queryParams?.userAddress as string
              ).toLowerCase();
              user.isSubscriber = blockchainAccount.isSubscriber;

              logger.log(
                `Updated user FID ${session.sub} state to WITH_ACCOUNT with wallet ${queryParams?.userAddress}`,
              );
            }
          } else {
            logger.log(
              'No smart contract account found for wallet:',
              queryParams?.userAddress,
            );
          }
        }
      }

      // Process daily status from query params if provided
      if (
        queryParams?.hasSignaledToday !== undefined ||
        queryParams?.hasUsedRetry !== undefined
      ) {
        console.log(
          '📅 [GET /me] Processing daily status from query params...',
        );

        const dailyUpdateData: any = {
          submittedSignalToday: queryParams?.hasSignaledToday === 'true',
          usedRetryToday: queryParams?.hasUsedRetry === 'true',
          updatedAt: new Date(),
        };

        await this.userService.update(session.sub, dailyUpdateData);
        Object.assign(user, dailyUpdateData);

        console.log('✅ [GET /me] Daily status updated from query params');
      }

      // Process JBM balance from query params if provided
      if (queryParams?.jbmBalance) {
        console.log('💰 [GET /me] Processing JBM balance from query params...');
        console.log('💰 [GET /me] JBM balance value:', queryParams?.jbmBalance);

        const jbmUpdateData: any = {
          jbmBalance: queryParams?.jbmBalance,
          updatedAt: new Date(),
        };

        await this.userService.update(session.sub, jbmUpdateData);
        Object.assign(user, jbmUpdateData);

        console.log('✅ [GET /me] JBM balance updated from query params');
      }
      const userFeedOfSignals =
        await this.blockchainService.getLastSignalsForUsersHomeFeed(
          session.sub,
        );
      const favoriteTwentySignelers =
        await this.blockchainService.getFavoriteTwentySignelersForFid(
          session.sub,
        );

      // Fetch trending tokens from Zapper API
      const trendingTokens = await this.zapperService.getTrendingTokens(
        session.sub,
        8,
      );

      // Check subscription status
      const subscriptionStatus =
        await this.blockchainService.checkUserSubscriptionStatus(session.sub);

      return hasResponse(res, {
        ...user,
        userFeedOfSignals,
        favoriteTwentySignelers,
        trendingTokens,
        subscriptionStatus,
        isNewUser:
          user.stateOnTheSystem === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
      });
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
   * Synchronizes user data with smart contract information and manages user state.
   *
   * This endpoint handles the complete user data synchronization flow including:
   * - Smart contract account verification and creation
   * - Daily status tracking and limits
   * - Active session management
   * - JBM balance tracking
   *
   * @param session - Verified QuickAuth JWT payload containing user FID and address
   * @param body - Smart contract data and user status information
   * @param res - HTTP response object
   * @returns Updated user profile with synchronization status
   */
  @Post('/me')
  @UseGuards(AuthorizationGuard)
  async syncUserData(
    @Session() session: QuickAuthPayload,
    @Body() body: SyncUserDataDto,
    @Res() res: FastifyReply,
  ) {
    try {
      console.log(
        '🚀 [POST /me] Starting user data sync for FID:',
        session.sub,
      );
      console.log('📋 [POST /me] Session data:', {
        sub: session.sub,
        address: session.address,
        iat: session.iat,
        exp: session.exp,
      });
      console.log('📦 [POST /me] Request body:', JSON.stringify(body, null, 2));

      // Ensure user exists (create if necessary)
      let user = await this.userService.getByFid(session.sub);
      console.log('👤 [POST /me] Current user state:', {
        exists: !!user,
        fid: user?.fid,
        username: user?.username,
        stateOnTheSystem: user?.stateOnTheSystem,
        walletAddress: user?.walletAddress,
        jbmBalance: user?.jbmBalance,
      });

      if (!user) {
        console.log(
          '🆕 [POST /me] Creating new user record for FID:',
          session.sub,
        );
        const neynar = new NeynarService();
        const neynarUser = await neynar.getUserByFid(session.sub);
        console.log('📡 [POST /me] Neynar user data:', neynarUser);

        const { user: newUser } = await this.userService.create(session.sub, {
          username: neynarUser.username,
          pfpUrl: neynarUser.pfp_url,
          createdAt: new Date(),
          updatedAt: new Date(),
          stateOnTheSystem: UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
        });

        user = newUser;
        console.log('✅ [POST /me] New user created:', {
          fid: user.fid,
          username: user.username,
          stateOnTheSystem: user.stateOnTheSystem,
        });
      }

      // Process contract account data if provided
      if (body.contractAccount) {
        console.log('📄 [POST /me] Processing contract account data...');
        const contractAccount = body.contractAccount;
        console.log('🏗️ [POST /me] Contract account details:', {
          fid: contractAccount.fid,
          username: contractAccount.username,
          walletAddress: contractAccount.walletAddress,
          isBanned: contractAccount.isBanned,
          createdAt: contractAccount.createdAt,
        });

        // Validate that contract account FID matches authenticated user
        console.log('🔍 [POST /me] Validating contract account FID...');
        console.log(
          '🔍 [POST /me] Contract FID:',
          contractAccount.fid,
          'Session FID:',
          session.sub,
        );
        if (parseInt(contractAccount.fid) !== session.sub) {
          console.log('❌ [POST /me] FID mismatch detected!');
          logger.warn(
            `Contract account FID mismatch: ${contractAccount.fid} vs ${session.sub}`,
          );
          return hasError(
            res,
            HttpStatus.BAD_REQUEST,
            'syncUserData',
            'Contract account FID does not match authenticated user.',
          );
        }
        console.log('✅ [POST /me] FID validation passed');

        // Validate wallet address format
        console.log('🔍 [POST /me] Validating wallet address format...');
        console.log(
          '🔍 [POST /me] Wallet address:',
          contractAccount.walletAddress,
        );
        if (!this.isValidEthereumAddress(contractAccount.walletAddress)) {
          console.log('❌ [POST /me] Invalid wallet address format!');
          logger.warn(
            `Invalid wallet address format: ${contractAccount.walletAddress}`,
          );
          return hasError(
            res,
            HttpStatus.BAD_REQUEST,
            'syncUserData',
            'Invalid wallet address format.',
          );
        }
        console.log('✅ [POST /me] Wallet address format validation passed');

        // Update user with contract account data
        console.log('💾 [POST /me] Preparing contract account update data...');
        const updateData: any = {
          walletAddress: contractAccount.walletAddress,
          updatedAt: new Date(),
        };

        // Update username and pfpUrl if different
        console.log('🔄 [POST /me] Checking for username/pfpUrl updates...');
        console.log(
          '🔄 [POST /me] Current username:',
          user.username,
          'Contract username:',
          contractAccount.username,
        );
        console.log(
          '🔄 [POST /me] Current pfpUrl:',
          user.pfpUrl,
          'Contract pfpUrl:',
          contractAccount.pfpUrl,
        );

        if (contractAccount.username !== user.username) {
          updateData.username = contractAccount.username;
          console.log(
            '📝 [POST /me] Username will be updated to:',
            contractAccount.username,
          );
        }
        if (contractAccount.pfpUrl !== user.pfpUrl) {
          updateData.pfpUrl = contractAccount.pfpUrl;
          console.log(
            '📝 [POST /me] PFP URL will be updated to:',
            contractAccount.pfpUrl,
          );
        }

        // Set appropriate state based on current user state
        console.log('🏗️ [POST /me] Checking user state transition...');
        console.log('🏗️ [POST /me] Current state:', user.stateOnTheSystem);
        if (
          user.stateOnTheSystem === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT
        ) {
          updateData.stateOnTheSystem =
            UserStateOnTheSystemEnum.ACCOUNT_CREATED_WELCOME_SCREEN;
          console.log(
            '🎉 [POST /me] Setting welcome screen state for new account!',
          );
          logger.log(
            `User ${session.sub} account created - setting welcome screen state`,
          );
        }

        console.log('💾 [POST /me] Final update data:', updateData);
        await this.userService.update(session.sub, updateData);

        // Update local user object
        Object.assign(user, updateData);

        console.log('✅ [POST /me] Contract account data updated successfully');
        logger.log(`Updated user ${session.sub} with contract account data`);
      }

      // Process daily status if provided
      if (body.userDailyStatus) {
        console.log('📅 [POST /me] Processing daily status data...');
        console.log(
          '📅 [POST /me] Daily status type:',
          typeof body.userDailyStatus,
        );
        console.log('📅 [POST /me] Daily status value:', body.userDailyStatus);

        let dailyUpdateData: any = {
          updatedAt: new Date(),
        };

        // Handle both object and array formats
        if (Array.isArray(body.userDailyStatus)) {
          console.log('📅 [POST /me] Processing array format daily status...');
          // Array format: [submittedSignalToday, usedRetryToday, isNewDay, hasRetryAvailable]
          const [
            submittedSignalToday,
            usedRetryToday,
            isNewDay,
            hasRetryAvailable,
          ] = body.userDailyStatus;

          console.log('📅 [POST /me] Array values:', {
            submittedSignalToday,
            usedRetryToday,
            isNewDay,
            hasRetryAvailable,
          });

          dailyUpdateData.submittedSignalToday = submittedSignalToday;
          dailyUpdateData.usedRetryToday = usedRetryToday;

          // If it's a new day, update the last signal date
          if (isNewDay) {
            dailyUpdateData.lastSignalDate = new Date();
            console.log(
              '📅 [POST /me] New day detected, updating lastSignalDate',
            );
          }
        } else {
          console.log('📅 [POST /me] Processing object format daily status...');
          // Object format
          const dailyStatus = body.userDailyStatus as UserDailyStatusDto;
          console.log('📅 [POST /me] Object daily status:', dailyStatus);

          dailyUpdateData.submittedSignalToday =
            dailyStatus.submittedSignalToday;
          dailyUpdateData.usedRetryToday = dailyStatus.usedRetryToday;
          dailyUpdateData.lastSignalDate = dailyStatus.lastSignalDate
            ? new Date(dailyStatus.lastSignalDate)
            : null;
        }

        console.log('💾 [POST /me] Daily status update data:', dailyUpdateData);
        await this.userService.update(session.sub, dailyUpdateData);

        // Update local user object
        Object.assign(user, dailyUpdateData);

        console.log('✅ [POST /me] Daily status updated successfully');
        logger.log(`Updated daily status for user ${session.sub}`);
      }

      // Process active session if provided
      if (body.activeSession) {
        console.log('🕐 [POST /me] Processing active session data...');
        const activeSession = body.activeSession;
        console.log('🕐 [POST /me] Active session details:', {
          sessionId: activeSession.sessionId,
          startTime: activeSession.startTime,
          expiresAt: activeSession.expiresAt,
          userAgent: activeSession.userAgent,
          source: activeSession.source,
        });

        // Store session information in user metadata or separate table
        // For now, we'll store it in the user record as metadata
        const sessionUpdateData: any = {
          lastActiveAt: new Date(activeSession.startTime * 1000),
          updatedAt: new Date(),
        };

        console.log('💾 [POST /me] Session update data:', sessionUpdateData);
        await this.userService.update(session.sub, sessionUpdateData);

        // Update local user object
        Object.assign(user, sessionUpdateData);

        console.log('✅ [POST /me] Session data updated successfully');
        logger.log(`Updated session info for user ${session.sub}`);
      }

      // Process JBM balance if provided
      if (body.jbmBalance) {
        console.log('💰 [POST /me] Processing JBM balance data...');
        console.log('💰 [POST /me] JBM balance value:', body.jbmBalance);
        console.log('💰 [POST /me] JBM balance type:', typeof body.jbmBalance);
        console.log(
          '💰 [POST /me] JBM balance length:',
          body.jbmBalance.length,
        );

        const jbmUpdateData: any = {
          jbmBalance: body.jbmBalance,
          updatedAt: new Date(),
        };

        console.log('💾 [POST /me] JBM update data:', jbmUpdateData);
        await this.userService.update(session.sub, jbmUpdateData);

        // Update local user object
        Object.assign(user, jbmUpdateData);

        console.log('✅ [POST /me] JBM balance updated successfully');
        logger.log(
          `Updated JBM balance for user ${session.sub}: ${body.jbmBalance}`,
        );
      }

      // Get updated user data
      console.log('🔄 [POST /me] Fetching updated user data...');
      const updatedUser = await this.userService.getByFid(session.sub);
      console.log('👤 [POST /me] Updated user data:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        stateOnTheSystem: updatedUser.stateOnTheSystem,
        walletAddress: updatedUser.walletAddress,
        jbmBalance: updatedUser.jbmBalance,
        submittedSignalToday: updatedUser.submittedSignalToday,
        usedRetryToday: updatedUser.usedRetryToday,
      });

      // Get user feed data
      console.log('📰 [POST /me] Fetching user feed data...');
      const userFeedOfSignals =
        await this.blockchainService.getLastSignalsForUsersHomeFeed(
          session.sub,
        );
      console.log(
        '📰 [POST /me] User feed signals count:',
        userFeedOfSignals.length,
      );

      const favoriteTwentySignelers =
        await this.blockchainService.getFavoriteTwentySignelersForFid(
          session.sub,
        );
      console.log(
        '⭐ [POST /me] Favorite signalers count:',
        favoriteTwentySignelers.length,
      );

      // Fetch trending tokens from Zapper API
      const trendingTokens = await this.zapperService.getTrendingTokens(
        session.sub,
        8,
      );

      // Check subscription status
      const subscriptionStatus =
        await this.blockchainService.checkUserSubscriptionStatus(session.sub);

      const responseData = {
        ...updatedUser,
        userFeedOfSignals,
        favoriteTwentySignelers,
        trendingTokens,
        subscriptionStatus,
        isNewUser:
          updatedUser.stateOnTheSystem ===
          UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
        syncStatus: {
          contractAccountSynced: !!body.contractAccount,
          dailyStatusSynced: !!body.userDailyStatus,
          sessionSynced: !!body.activeSession,
          jbmBalanceSynced: !!body.jbmBalance,
        },
      };

      console.log(
        '📤 [POST /me] Response sync status:',
        responseData.syncStatus,
      );
      console.log('✅ [POST /me] Request completed successfully!');

      return hasResponse(res, responseData);
    } catch (error) {
      console.log('❌ [POST /me] Error occurred during sync:', error);
      console.log('❌ [POST /me] Error stack:', error.stack);
      logger.error('Failed to sync user data:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'syncUserData',
        'Unable to sync user data.',
      );
    }
  }

  /**
   * Validates if a string is a valid Ethereum address format
   */
  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Calculate user's daily signal state based on blockchain contract rules
   */
  private async calculateDailySignalState(
    user: any,
  ): Promise<DailySignalState> {
    // Get contract deployment timestamp (for day calculation)
    const CONTRACT_DEPLOYMENT = 1734434580; // Replace with actual deployment timestamp
    const SECONDS_IN_DAY = 24 * 60 * 60;

    const currentTime = Math.floor(Date.now() / 1000);
    const currentDay = Math.floor(
      (currentTime - CONTRACT_DEPLOYMENT) / SECONDS_IN_DAY,
    );
    const userLastDay = user.lastSignalDate
      ? Math.floor(
          (new Date(user.lastSignalDate).getTime() / 1000 -
            CONTRACT_DEPLOYMENT) /
            SECONDS_IN_DAY,
        )
      : -1;

    // If no account on blockchain
    if (user.stateOnTheSystem === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT) {
      return DailySignalState.WITHOUT_ACCOUNT;
    }

    // If new day since last signal
    if (currentDay > userLastDay) {
      return DailySignalState.FRESH_TODAY;
    }

    // Same day logic
    if (user.submittedSignalToday) {
      return DailySignalState.SIGNALED_TODAY;
    }

    // Failed states
    if (user.usedRetryToday) {
      return DailySignalState.FAILED_TODAY;
    }

    // Has account, hasn't signaled, has retry available
    return DailySignalState.WITH_ACCOUNT;
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
  async logOut(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    try {
      res.header('Set-Cookie', 'Authorization=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
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
