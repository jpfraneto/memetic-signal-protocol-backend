// Dependencies
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Body,
  Logger,
} from '@nestjs/common';
import { createWalletClient, http, isAddress, encodeAbiParameters } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';

// Services
import { UserService } from '../user/services';
import { ZapperService } from '../zapper/services';
import { MeEndpointService } from './services/me-endpoint.service';
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

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';
import NeynarService from 'src/utils/neynar';
import { getConfig } from '../../security/config';

// DTOs
import { SyncUserDataDto, UserDailyStatusDto } from './dto/sync-user-data.dto';
import { VerifyWalletDto } from './dto/verify-wallet.dto';
import {
  MeEndpointResponseDto,
  ErrorResponseDto,
} from './dto/me-endpoint-response.dto';
import { SignalService } from '../signal/signal.service';

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
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly userService: UserService,
    private readonly zapperService: ZapperService,
    private readonly signalService: SignalService,
    private readonly meEndpointService: MeEndpointService,
  ) {}

  /**
   * Primary entry point for miniapp - returns complete data for all 3 screens.
   *
   * This endpoint provides all data needed by the frontend including:
   * - User profile and statistics
   * - Signal feed with complete token information and price data
   * - Featured trending tokens from Zapper API
   * - Leaderboard data (top scorers, most signals, champion)
   *
   * Features comprehensive caching, error handling, and fallback strategies.
   * Target response time: < 800ms with 60-second Redis TTL for user data.
   *
   * @param session - Verified QuickAuth JWT payload containing user FID
   * @param res - HTTP response object
   * @returns Complete miniapp data or structured error information
   */
  @Get('/me')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Get complete miniapp data',
    description:
      'Primary endpoint that returns all data needed for the miniapp: user profile, signal feed, trending tokens, and leaderboards. Optimized for <800ms response time with Redis caching.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Farcaster QuickAuth JWT token',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Complete miniapp data retrieved successfully',
    type: MeEndpointResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid FID provided',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'External service unavailable (Neynar, Zapper, Redis)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Database or internal server error',
    type: ErrorResponseDto,
  })
  async getMe(@Session() session: QuickAuthPayload, @Res() res: FastifyReply) {
    const fid = session.sub;
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    // Validate FID first
    if (!fid || fid <= 0) {
      return res.status(400).send({
        success: false,
        error: {
          code: 'INVALID_FID',
          message: 'Invalid user identifier provided',
          details:
            'FID must be a positive integer from Farcaster authentication',
          timestamp,
          fid: fid || null,
          component: 'AUTH_VALIDATION',
          retryable: false,
        },
      });
    }

    try {
      this.logger.log(
        `[/me] Processing complete miniapp data request for FID: ${fid}`,
      );

      // Use the comprehensive service to get all data
      const completeData =
        await this.meEndpointService.getCompleteUserData(fid);

      const duration = Date.now() - startTime;
      this.logger.log(
        `[/me] Successfully completed request for FID ${fid} in ${duration}ms`,
      );

      return res.status(200).send(completeData);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';

      this.logger.error(
        `[/me] Request failed for FID ${fid} after ${duration}ms:`,
        {
          error: errorMessage,
          stack: error.stack,
          fid,
          duration,
        },
      );

      // Parse structured error codes
      if (errorMessage.includes('NEYNAR_API_UNAVAILABLE')) {
        return res.status(503).send({
          success: false,
          error: {
            code: 'NEYNAR_API_UNAVAILABLE',
            message: 'Failed to fetch user profile from Farcaster',
            details:
              'Neynar API is currently unavailable. User profile data may be outdated.',
            timestamp,
            fid,
            component: 'NEYNAR_INTEGRATION',
            retryable: true,
          },
        });
      }

      if (errorMessage.includes('DATABASE_CONNECTION_FAILED')) {
        return res.status(500).send({
          success: false,
          error: {
            code: 'DATABASE_CONNECTION_FAILED',
            message: 'Database connection error',
            details:
              'Unable to connect to the database. Please try again in a few moments.',
            timestamp,
            fid,
            component: 'DATABASE',
            retryable: true,
          },
        });
      }

      if (errorMessage.includes('REDIS_CACHE_UNAVAILABLE')) {
        return res.status(503).send({
          success: false,
          error: {
            code: 'REDIS_CACHE_UNAVAILABLE',
            message: 'Cache service unavailable',
            details:
              'Redis cache is unavailable. Data will be served directly from database.',
            timestamp,
            fid,
            component: 'CACHE',
            retryable: true,
          },
        });
      }

      if (errorMessage.includes('ZAPPER_API_TIMEOUT')) {
        return res.status(503).send({
          success: false,
          error: {
            code: 'ZAPPER_API_TIMEOUT',
            message: 'Trending tokens service unavailable',
            details:
              'Unable to fetch trending tokens. Other features should work normally.',
            timestamp,
            fid,
            component: 'ZAPPER_API',
            retryable: true,
          },
        });
      }

      if (errorMessage.includes('COINGECKO_RATE_LIMIT')) {
        return res.status(429).send({
          success: false,
          error: {
            code: 'COINGECKO_RATE_LIMIT',
            message: 'Price data rate limit exceeded',
            details:
              'Token price data temporarily unavailable due to rate limits.',
            timestamp,
            fid,
            component: 'PRICE_DATA',
            retryable: true,
          },
        });
      }

      if (errorMessage.includes('USER_NOT_FOUND')) {
        return res.status(404).send({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found on Farcaster',
            details: 'The provided FID does not exist on Farcaster network.',
            timestamp,
            fid,
            component: 'USER_VALIDATION',
            retryable: false,
          },
        });
      }

      // Generic fallback error
      return res.status(500).send({
        success: false,
        error: {
          code: 'MINIAPP_DATA_ERROR',
          message: 'Failed to retrieve complete miniapp data',
          details:
            'An unexpected error occurred. Please refresh the app and try again.',
          timestamp,
          fid,
          component: 'GENERAL',
          retryable: true,
        },
      });
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
      this.logger.log(
        `🚀 [POST /me] Starting user data sync for FID: ${session.sub}`,
      );
      this.logger.log('📋 [POST /me] Session data:', {
        sub: session.sub,
        address: session.address,
        iat: session.iat,
        exp: session.exp,
      });
      this.logger.log(
        '📦 [POST /me] Request body:',
        JSON.stringify(body, null, 2),
      );

      // Ensure user exists (create if necessary)
      let user = await this.userService.getByFid(session.sub);
      this.logger.log('👤 [POST /me] Current user state:', {
        exists: !!user,
        fid: user?.fid,
        username: user?.username,
        stateOnTheSystem: user?.state_on_the_system,
        walletAddress: user?.wallet_address,
        jbmBalance: user?.jbm_balance,
      });

      if (!user) {
        this.logger.log(
          `🆕 [POST /me] Creating new user record for FID: ${session.sub}`,
        );
        const neynar = new NeynarService();
        const neynarUser = await neynar.getUserByFid(session.sub);
        this.logger.log('📡 [POST /me] Neynar user data:', neynarUser);

        const { user: newUser } = await this.userService.create(session.sub, {
          username: neynarUser.username,
          pfp_url: neynarUser.pfp_url,
          created_at: new Date(),
          updated_at: new Date(),
          state_on_the_system: UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
        });

        user = newUser;
        this.logger.log('✅ [POST /me] New user created:', {
          fid: user.fid,
          username: user.username,
          stateOnTheSystem: user.state_on_the_system,
        });
      }

      // Process contract account data if provided
      if (body.contractAccount) {
        this.logger.log('📄 [POST /me] Processing contract account data...');
        const contractAccount = body.contractAccount;
        this.logger.log('🏗️ [POST /me] Contract account details:', {
          fid: contractAccount.fid,
          username: contractAccount.username,
          wallet_address: contractAccount.walletAddress,
          is_banned: contractAccount.is_banned,
          created_at: contractAccount.created_at,
        });

        // Validate that contract account FID matches authenticated user
        this.logger.log('🔍 [POST /me] Validating contract account FID...');
        this.logger.log(
          `🔍 [POST /me] Contract FID: ${contractAccount.fid}, Session FID: ${session.sub}`,
        );
        if (parseInt(contractAccount.fid) !== session.sub) {
          this.logger.log('❌ [POST /me] FID mismatch detected!');
          this.logger.warn(
            `Contract account FID mismatch: ${contractAccount.fid} vs ${session.sub}`,
          );
          return hasError(
            res,
            HttpStatus.BAD_REQUEST,
            'syncUserData',
            'Contract account FID does not match authenticated user.',
          );
        }
        this.logger.log('✅ [POST /me] FID validation passed');

        // Validate wallet address format
        this.logger.log('🔍 [POST /me] Validating wallet address format...');
        this.logger.log(
          `🔍 [POST /me] Wallet address: ${contractAccount.walletAddress}`,
        );
        if (!this.isValidEthereumAddress(contractAccount.walletAddress)) {
          this.logger.log('❌ [POST /me] Invalid wallet address format!');
          this.logger.warn(
            `Invalid wallet address format: ${contractAccount.walletAddress}`,
          );
          return hasError(
            res,
            HttpStatus.BAD_REQUEST,
            'syncUserData',
            'Invalid wallet address format.',
          );
        }
        this.logger.log(
          '✅ [POST /me] Wallet address format validation passed',
        );

        // Update user with contract account data
        this.logger.log(
          '💾 [POST /me] Preparing contract account update data...',
        );
        const updateData: any = {
          walletAddress: contractAccount.walletAddress,
          updatedAt: new Date(),
        };

        // Update username and pfpUrl if different
        this.logger.log(
          '🔄 [POST /me] Checking for username/pfpUrl updates...',
        );
        this.logger.log(
          `🔄 [POST /me] Current username: ${user.username}, Contract username: ${contractAccount.username}`,
        );
        this.logger.log(
          `🔄 [POST /me] Current pfpUrl: ${user.pfp_url}, Contract pfpUrl: ${contractAccount.pfp_url}`,
        );

        if (contractAccount.username !== user.username) {
          updateData.username = contractAccount.username;
          this.logger.log(
            `📝 [POST /me] Username will be updated to: ${contractAccount.username}`,
          );
        }
        if (contractAccount.pfp_url !== user.pfp_url) {
          updateData.pfpUrl = contractAccount.pfp_url;
          this.logger.log(
            `📝 [POST /me] PFP URL will be updated to: ${contractAccount.pfp_url}`,
          );
        }

        // Set appropriate state based on current user state
        this.logger.log('🏗️ [POST /me] Checking user state transition...');
        this.logger.log(
          `🏗️ [POST /me] Current state: ${user.state_on_the_system}`,
        );
        if (
          user.state_on_the_system === UserStateOnTheSystemEnum.WITHOUT_ACCOUNT
        ) {
          updateData.state_on_the_system =
            UserStateOnTheSystemEnum.ACCOUNT_CREATED_WELCOME_SCREEN;
          this.logger.log(
            '🎉 [POST /me] Setting welcome screen state for new account!',
          );
          this.logger.log(
            `User ${session.sub} account created - setting welcome screen state`,
          );
        }

        this.logger.log('💾 [POST /me] Final update data:', updateData);
        await this.userService.update(session.sub, updateData);

        // Update local user object
        Object.assign(user, updateData);

        this.logger.log(
          '✅ [POST /me] Contract account data updated successfully',
        );
        this.logger.log(
          `Updated user ${session.sub} with contract account data`,
        );
      }

      // Process daily status if provided
      if (body.userDailyStatus) {
        this.logger.log('📅 [POST /me] Processing daily status data...');
        this.logger.log(
          `📅 [POST /me] Daily status type: ${typeof body.userDailyStatus}`,
        );
        this.logger.log(
          '📅 [POST /me] Daily status value:',
          body.userDailyStatus,
        );

        const dailyUpdateData: any = {
          updatedAt: new Date(),
        };

        // Handle both object and array formats
        if (Array.isArray(body.userDailyStatus)) {
          this.logger.log(
            '📅 [POST /me] Processing array format daily status...',
          );
          // Array format: [ usedToday, isNewDay, ]
          const [usedToday, isNewDay] = body.userDailyStatus;

          this.logger.log('📅 [POST /me] Array values:', {
            usedToday,
            isNewDay,
          });
        } else {
          this.logger.log(
            '📅 [POST /me] Processing object format daily status...',
          );
          // Object format
          const dailyStatus = body.userDailyStatus as UserDailyStatusDto;
          this.logger.log('📅 [POST /me] Object daily status:', dailyStatus);

          dailyUpdateData.lastSignalDate = dailyStatus.lastSignalDate
            ? new Date(dailyStatus.lastSignalDate)
            : null;
        }

        this.logger.log(
          '💾 [POST /me] Daily status update data:',
          dailyUpdateData,
        );
        await this.userService.update(session.sub, dailyUpdateData);

        // Update local user object
        Object.assign(user, dailyUpdateData);

        this.logger.log('✅ [POST /me] Daily status updated successfully');
        this.logger.log(`Updated daily status for user ${session.sub}`);
      }

      // Process active session if provided
      if (body.activeSession) {
        this.logger.log('🕐 [POST /me] Processing active session data...');
        const activeSession = body.activeSession;
        this.logger.log('🕐 [POST /me] Active session details:', {
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

        this.logger.log(
          '💾 [POST /me] Session update data:',
          sessionUpdateData,
        );
        await this.userService.update(session.sub, sessionUpdateData);

        // Update local user object
        Object.assign(user, sessionUpdateData);

        this.logger.log('✅ [POST /me] Session data updated successfully');
        this.logger.log(`Updated session info for user ${session.sub}`);
      }

      // Process JBM balance if provided
      if (body.jbmBalance) {
        this.logger.log('💰 [POST /me] Processing JBM balance data...');
        this.logger.log('💰 [POST /me] JBM balance value:', body.jbmBalance);
        this.logger.log(
          `💰 [POST /me] JBM balance type: ${typeof body.jbmBalance}`,
        );
        this.logger.log(
          `💰 [POST /me] JBM balance length: ${body.jbmBalance.length}`,
        );

        const jbmUpdateData: any = {
          jbmBalance: body.jbmBalance,
          updatedAt: new Date(),
        };

        this.logger.log('💾 [POST /me] JBM update data:', jbmUpdateData);
        await this.userService.update(session.sub, jbmUpdateData);

        // Update local user object
        Object.assign(user, jbmUpdateData);

        this.logger.log('✅ [POST /me] JBM balance updated successfully');
        this.logger.log(
          `Updated JBM balance for user ${session.sub}: ${body.jbmBalance}`,
        );
      }

      // Get updated user data
      this.logger.log('🔄 [POST /me] Fetching updated user data...');
      const updatedUser = await this.userService.getByFid(session.sub);
      this.logger.log('👤 [POST /me] Updated user data:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        stateOnTheSystem: updatedUser.state_on_the_system,
        walletAddress: updatedUser.wallet_address,
      });

      // Get user feed data
      this.logger.log('📰 [POST /me] Fetching user feed data...');
      const userFeedOfSignals = await this.signalService.getSignalsFeedForUser(
        session.sub,
      );
      this.logger.log(
        `📰 [POST /me] User feed signals count: ${userFeedOfSignals.length}`,
      );

      const favoriteTwentySignalers =
        await this.signalService.getFavoriteTwentySignalersForFid(session.sub);
      this.logger.log(
        `⭐ [POST /me] Favorite signalers count: ${favoriteTwentySignalers.length}`,
      );

      // Fetch trending tokens from Zapper API (cached for 30 minutes)
      const trendingTokens = await this.zapperService.getTrendingTokens(
        session.sub,
        8,
      );

      const responseData = {
        ...updatedUser,
        userFeedOfSignals,
        favoriteTwentySignalers,
        trendingTokens,
        isNewUser:
          updatedUser.state_on_the_system ===
          UserStateOnTheSystemEnum.WITHOUT_ACCOUNT,
        syncStatus: {
          contractAccountSynced: !!body.contractAccount,
          dailyStatusSynced: !!body.userDailyStatus,
          sessionSynced: !!body.activeSession,
          jbmBalanceSynced: !!body.jbmBalance,
        },
      };

      this.logger.log(
        '📤 [POST /me] Response sync status:',
        responseData.syncStatus,
      );
      this.logger.log('✅ [POST /me] Request completed successfully!');

      return hasResponse(res, responseData);
    } catch (error) {
      this.logger.log('❌ [POST /me] Error occurred during sync:', error);
      this.logger.log('❌ [POST /me] Error stack:', error.stack);
      this.logger.error('Failed to sync user data:', error);
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

    // Has account, hasn't signaled, has retry available
    return DailySignalState.WITH_ACCOUNT;
  }

  /**
   * Verifies wallet ownership for a Farcaster user and generates authorization signature.
   *
   * This endpoint validates that a wallet address is authorized for a specific Farcaster ID
   * by checking against Farcaster's verified addresses and auth addresses. If valid,
   * it generates an EIP-712 signature that can be used for on-chain authorization.
   *
   * @param body - Request body containing FID and wallet address
   * @param res - HTTP response object
   * @returns Authorization data with signature and deadline
   */
  @Post('/get-signature')
  @UseGuards(AuthorizationGuard)
  async verifyWalletOwnership(
    @Body() body: VerifyWalletDto,
    @Res() res: FastifyReply,
  ) {
    try {
      const { fid, walletAddress } = body;

      this.logger.log(
        `🔍 [verifyWalletOwnership] Starting verification for FID: ${fid}, Wallet: ${walletAddress}`,
      );

      // Validate wallet address format
      if (!isAddress(walletAddress)) {
        this.logger.log(
          `❌ [verifyWalletOwnership] Invalid wallet address format: ${walletAddress}`,
        );
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'verifyWalletOwnership',
          'Invalid wallet address format.',
        );
      }

      this.logger.log(
        `✅ [verifyWalletOwnership] Wallet address format validated`,
      );

      // Fetch user from Farcaster API (Neynar) directly without cache
      let user;
      try {
        this.logger.log(
          `📡 [verifyWalletOwnership] Fetching user data from Neynar API for FID: ${fid}`,
        );
        const neynarService = new NeynarService();
        user = await neynarService.getUserByFid(fid);
        this.logger.log(
          `✅ [verifyWalletOwnership] Successfully fetched user data from Neynar`,
        );
      } catch (error) {
        this.logger.log(
          `❌ [verifyWalletOwnership] Failed to fetch Farcaster user for FID ${fid}:`,
          error,
        );
        this.logger.error(
          `Failed to fetch Farcaster user for FID ${fid}:`,
          error,
        );
        return hasError(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'verifyWalletOwnership',
          'Failed to fetch Farcaster user data.',
        );
      }

      // Check if wallet is in verified or auth addresses
      const userData = user as any; // Type assertion for Neynar user data
      const verifiedAddresses =
        userData.verified_addresses?.eth_addresses.map((address) =>
          address.toLowerCase(),
        ) || [];
      const authAddresses =
        userData.auth_addresses?.map((auth) => auth.address.toLowerCase()) ||
        [];

      this.logger.log(
        `🔍 [verifyWalletOwnership] Checking wallet authorization:`,
      );
      this.logger.log(
        `   - Verified addresses: ${JSON.stringify(verifiedAddresses)}`,
      );
      this.logger.log(`   - Auth addresses: ${JSON.stringify(authAddresses)}`);
      this.logger.log(`   - Target wallet: ${walletAddress}`);

      const isValid =
        verifiedAddresses.includes(walletAddress.toLowerCase()) ||
        authAddresses.includes(walletAddress.toLowerCase());

      this.logger.log(
        `✅ [verifyWalletOwnership] Wallet authorization result: ${isValid}`,
      );

      if (!isValid) {
        this.logger.log(
          `❌ [verifyWalletOwnership] Wallet not authorized for FID ${fid}`,
        );
        return hasError(
          res,
          HttpStatus.UNAUTHORIZED,
          'verifyWalletOwnership',
          'Wallet not authorized for FID.',
        );
      }

      // Generate EIP-712 signature
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      this.logger.log(
        `🔐 [verifyWalletOwnership] Generating EIP-712 signature with deadline: ${deadline}`,
      );

      const authData = await this.generateAuthSignature(
        fid,
        walletAddress,
        deadline,
      );

      this.logger.log(
        `✅ [verifyWalletOwnership] Successfully generated auth signature`,
      );
      this.logger.log(
        `📤 [verifyWalletOwnership] Returning auth data and deadline: ${deadline}`,
      );

      return hasResponse(res, {
        success: true,
        data: {
          signature: authData,
          deadline: deadline.toString(),
          fid: fid,
          walletAddress: walletAddress,
        },
        message: 'Wallet ownership verified successfully',
      });
    } catch (error) {
      this.logger.log(`❌ [verifyWalletOwnership] Unexpected error:`, error);
      this.logger.error('Failed to verify wallet ownership:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'verifyWalletOwnership',
        'An unexpected error occurred during wallet verification.',
      );
    }
  }

  /**
   * Generates EIP-712 signature for wallet authorization
   */
  private async generateAuthSignature(
    fid: number,
    walletAddress: string,
    deadline: number,
  ): Promise<string> {
    this.logger.log(
      `🔐 [generateAuthSignature] Starting signature generation for FID: ${fid}, Wallet: ${walletAddress}, Deadline: ${deadline}`,
    );

    const config = getConfig();

    if (!config.blockchain.backendPrivateKey) {
      this.logger.log(
        `❌ [generateAuthSignature] BACKEND_PRIVATE_KEY environment variable is not set`,
      );
      throw new Error('BACKEND_PRIVATE_KEY environment variable is not set');
    }

    this.logger.log(`✅ [generateAuthSignature] Backend private key found`);

    // Setup wallet client - ensure private key has 0x prefix
    const privateKey = config.blockchain.backendPrivateKey.startsWith('0x')
      ? (config.blockchain.backendPrivateKey as `0x${string}`)
      : (`0x${config.blockchain.backendPrivateKey}` as `0x${string}`);

    const account = privateKeyToAccount(privateKey);
    this.logger.log(
      `🔐 [generateAuthSignature] Created account from private key: ${account.address}`,
    );

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });
    this.logger.log(
      `🔐 [generateAuthSignature] Wallet client created for Base chain`,
    );

    const domain = {
      name: 'MemeticSignalProtocol',
      version: '1',
      chainId: 8453,
      verifyingContract: config.blockchain.contractAddress as `0x${string}`,
    } as const;

    this.logger.log(`🔐 [generateAuthSignature] EIP-712 domain configured:`);
    this.logger.log(`   - Name: ${domain.name}`);
    this.logger.log(`   - Version: ${domain.version}`);
    this.logger.log(`   - Chain ID: ${domain.chainId}`);
    this.logger.log(`   - Contract: ${domain.verifyingContract}`);

    const types = {
      Authorization: [
        { name: 'fid', type: 'uint256' },
        { name: 'wallet', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    } as const;

    this.logger.log(
      `🔐 [generateAuthSignature] EIP-712 types configured for Authorization`,
    );
    this.logger.log(`🔐 [generateAuthSignature] Signing message with:`);
    this.logger.log(`   - FID: ${fid} (as number for uint256)`);
    this.logger.log(`   - Wallet: ${walletAddress}`);
    this.logger.log(
      `   - Deadline: ${deadline} (as BigInt: ${BigInt(deadline)})`,
    );

    // Sign the message
    const signature = await walletClient.signTypedData({
      account,
      domain,
      types,
      primaryType: 'Authorization',
      message: {
        fid: BigInt(fid),
        wallet: walletAddress as `0x${string}`,
        deadline: BigInt(deadline),
      },
    });

    this.logger.log(
      `✅ [generateAuthSignature] EIP-712 signature generated: ${signature}`,
    );

    // Encode for contract consumption
    const authData = encodeAbiParameters(
      [
        { name: 'fid', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'signature', type: 'bytes' },
      ],
      [BigInt(fid), BigInt(deadline), signature], // Convert fid to BigInt for uint256
    );

    this.logger.log(
      `✅ [generateAuthSignature] Auth data encoded for contract: ${authData}`,
    );
    this.logger.log(
      `✅ [generateAuthSignature] Auth data length: ${authData.length} characters`,
    );

    return authData;
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
      res.header(
        'Set-Cookie',
        'Authorization=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      );
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
