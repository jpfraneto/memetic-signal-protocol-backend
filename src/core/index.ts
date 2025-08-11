// Dependencies - RUNNER Core Modules
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { CallModule } from './call/call.module';
import { SignalModule } from './signal/signal.module';
import { TokensModule } from './tokens/tokens.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { BlockchainModule } from './blockchain/blockchain.module';

/**
 * Core modules for the RUNNER Farcaster miniapp
 *
 * Module Responsibilities:
 * - AuthModule: Farcaster QuickAuth integration
 * - UserModule: User management, profiles, stats
 * - TrainingModule: Training plans, weekly missions, AI plan generation
 * - CoachModule: AI coach interactions, motivational messages
 * - AchievementModule: Streak tracking, milestones, gamification
 * - SocialModule: Share image generation, Farcaster posts, community feed
 * - NotificationModule: Daily reminders, streak notifications, achievement alerts
 * - EmbedsModule: Dynamic embeds for workout shares, achievements
 * - TokenModule: $RUNNER token rewards, claiming system, Base integration
 */
const CoreModules = [
  UserModule, // Foundation - user management
  AuthModule, // Authentication & session management
  AdminModule,
  CallModule, // Blockchain call data management
  SignalModule, // Signal/prediction management
  TokensModule, // Token price and metadata API
  LeaderboardModule, // User rankings and scoring
  BlockchainModule, // Blockchain integration and sync
];

export default CoreModules;
