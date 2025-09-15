// DTOs for the comprehensive /me endpoint response
import { ApiProperty } from '@nestjs/swagger';
import { Signal } from 'src/models';

export class UserProfileDto {
  @ApiProperty({ description: 'User Farcaster ID' })
  fid: number;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Display name', nullable: true })
  displayName: string | null;

  @ApiProperty({ description: 'Profile picture URL', nullable: true })
  pfpUrl: string | null;

  @ApiProperty({
    description: 'Profile picture URL (alias for compatibility)',
    nullable: true,
  })
  pfp_url: string | null;

  @ApiProperty({ description: 'MFS Score' })
  mfsScore: number;

  @ApiProperty({ description: 'MFS Score (alias for compatibility)' })
  mfs_score: number;

  @ApiProperty({ description: 'Total accumulated score' })
  totalScore: number;

  @ApiProperty({ description: 'Total number of signals made' })
  totalSignals: number;

  @ApiProperty({ description: 'Total signals (alias for compatibility)' })
  total_signals: number;

  @ApiProperty({ description: 'Number of active signals' })
  activeSignals: number;

  @ApiProperty({ description: 'Active signals (alias for compatibility)' })
  active_signals: number;

  @ApiProperty({ description: 'Number of settled signals' })
  settledSignals: number;

  @ApiProperty({ description: 'Settled signals (alias for compatibility)' })
  settled_signals: number;

  @ApiProperty({ description: 'User rank on leaderboard', nullable: true })
  rank: number | null;

  @ApiProperty({ description: 'Win rate percentage' })
  winRate: number;

  @ApiProperty({ description: 'Win rate (alias for compatibility)' })
  win_rate: number;

  @ApiProperty({ description: 'Whether user is verified on Farcaster' })
  isVerified: boolean;

  @ApiProperty({ description: 'Number of followers' })
  followerCount: number;

  @ApiProperty({ description: 'Number of following' })
  followingCount: number;
}

export class TokenPriceDataDto {
  @ApiProperty({ description: 'Current token price' })
  price: number;

  @ApiProperty({ description: '24h price change percentage' })
  priceChange24h: number;

  @ApiProperty({ description: '24h trading volume' })
  volume24h: number;

  @ApiProperty({ description: 'Market capitalization' })
  marketCap: number;
}

export class FeaturedTokenDto {
  @ApiProperty({ description: 'Token contract address' })
  ca: string;

  @ApiProperty({ description: 'Chain ID' })
  chainId: number;

  @ApiProperty({ description: 'Token information' })
  token: {
    name: string;
    symbol: string;
    image: string;
    decimals: number;
    market_cap: number;
  };
}

export class LeaderboardUserDto {
  @ApiProperty({ description: 'User FID' })
  fid: number;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Display name', nullable: true })
  displayName: string | null;

  @ApiProperty({ description: 'Profile picture URL', nullable: true })
  pfpUrl: string | null;

  @ApiProperty({ description: 'Total score', required: false })
  totalScore?: number;

  @ApiProperty({ description: 'Total signals', required: false })
  totalSignals?: number;

  @ApiProperty({ description: 'Win rate', required: false })
  winRate?: number;
}

export class TodaySignalDto {
  @ApiProperty({ description: 'Signal ID from contract' })
  signalId: number;

  @ApiProperty({ description: 'Token contract address' })
  ca: string;

  @ApiProperty({ description: 'Signal direction: up or down' })
  direction: 'up' | 'down';

  @ApiProperty({ description: 'Duration in days', nullable: true })
  timeframe?: number;

  @ApiProperty({ description: 'Entry market cap' })
  entry_market_cap: number;

  @ApiProperty({ description: 'Duration in days' })
  duration: number;

  @ApiProperty({ description: 'Resolved' })
  resolved: boolean;

  @ApiProperty({ description: 'Signal creation timestamp (Unix seconds)' })
  createdAt: number;

  @ApiProperty({ description: 'Signal expiration timestamp (Unix seconds)' })
  expiresAt: number;

  @ApiProperty({ description: 'Transaction hash' })
  transactionHash: string;

  @ApiProperty({ description: 'Block number' })
  blockNumber: string;

  @ApiProperty({ description: 'Token information', required: false })
  token?: {
    name: string;
    symbol: string;
    image?: string;
  };
}

export class MeEndpointResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'User profile data', type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({
    description: 'Feed data with signals',
  })
  feedData: { signals: Signal[]; totalCount: number };

  @ApiProperty({
    description: 'Featured/trending tokens',
    type: [FeaturedTokenDto],
  })
  featuredTokens: FeaturedTokenDto[];

  @ApiProperty({ description: 'Leaderboard data', type: [LeaderboardUserDto] })
  leaderboard: LeaderboardUserDto[];

  @ApiProperty({
    description: "Today's signal for the user (null if no signal today)",
    type: TodaySignalDto,
    nullable: true,
  })
  todaySignal: TodaySignalDto | null;
}

export class ErrorDetailsDto {
  @ApiProperty({ description: 'Specific error code' })
  code: string;

  @ApiProperty({ description: 'User-friendly error message' })
  message: string;

  @ApiProperty({ description: 'Technical details for debugging' })
  details: string;

  @ApiProperty({ description: 'ISO timestamp when error occurred' })
  timestamp: string;

  @ApiProperty({ description: 'User FID if available', nullable: true })
  fid: number | null;

  @ApiProperty({ description: 'Component that failed' })
  component: string;

  @ApiProperty({ description: 'Whether the user should retry' })
  retryable: boolean;
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Success status - always false for errors' })
  success: false;

  @ApiProperty({ description: 'Error details', type: ErrorDetailsDto })
  error: ErrorDetailsDto;
}
