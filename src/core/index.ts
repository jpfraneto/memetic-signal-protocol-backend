// Dependencies - SIGIL Core Modules
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { SignalModule } from './signal/signal.module';
import { TokensModule } from './tokens/tokens.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ZapperModule } from './zapper/zapper.module';
import { PricingModule } from './pricing/pricing.module';
import { BankrModule } from './bankr/bankr.module';

/**
 * Core modules for the SIGIL Memetic Layer Protocol
 *
 * Module Responsibilities:
 * - AuthModule: Farcaster QuickAuth integration
 * - UserModule: User management, profiles, stats
 * - SignalModule: Single token prediction signals with hourly batch resolution
 * - TokensModule: Token price and metadata API
 * - LeaderboardModule: User rankings and MFS scoring
 * - ZapperModule: Trending tokens from Zapper API integration
 * - PricingModule: Background price tracking and scoring
 * - AdminModule: Administrative functions
 */
const CoreModules = [
  UserModule, // Foundation - user management
  AuthModule, // Authentication & session management
  AdminModule, // Administrative functions
  SignalModule, // Single token signal predictions with hourly batch resolution
  TokensModule, // Token price and metadata API
  LeaderboardModule, // User rankings and scoring
  ZapperModule, // Trending tokens from Zapper API
  PricingModule, // Background price tracking and exponential decay scoring
  BankrModule, // Bankr x402 integration & hourly trending refresh
];

export default CoreModules;
