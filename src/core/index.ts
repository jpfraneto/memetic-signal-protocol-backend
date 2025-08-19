// Dependencies - SIGIL Core Modules
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { SignalModule } from './signal/signal.module';
import { TokensModule } from './tokens/tokens.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ZapperModule } from './zapper/zapper.module';

/**
 * Core modules for the SIGIL Memetic Layer Protocol
 *
 * Module Responsibilities:
 * - AuthModule: Farcaster QuickAuth integration
 * - UserModule: User management, profiles, stats
 * - SignalModule: Daily 8-token prediction signals with 88-second sessions
 * - TokensModule: Token price and metadata API
 * - LeaderboardModule: User rankings and MFS scoring
 * - BlockchainModule: Smart contract integration and event sync
 * - ZapperModule: Trending tokens from Zapper API integration
 * - AdminModule: Administrative functions
 */
const CoreModules = [
  UserModule, // Foundation - user management
  AuthModule, // Authentication & session management
  AdminModule, // Administrative functions
  SignalModule, // Daily signal predictions and session management
  TokensModule, // Token price and metadata API
  LeaderboardModule, // User rankings and scoring
  BlockchainModule, // Blockchain integration and sync
  ZapperModule, // Trending tokens from Zapper API
];

export default CoreModules;
