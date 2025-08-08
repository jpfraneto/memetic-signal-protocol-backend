// Dependencies - RUNNER Core Modules
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { CallModule } from './call/call.module';

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
];

export default CoreModules;
