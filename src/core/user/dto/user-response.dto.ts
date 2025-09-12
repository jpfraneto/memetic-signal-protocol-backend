import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/models';

export class UserSignalDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  signalId: number;

  @ApiProperty()
  fid: number;

  @ApiProperty()
  tokenAddress: string;

  @ApiProperty()
  ticker: string;

  @ApiProperty()
  direction: 'up' | 'down';

  @ApiProperty()
  timestamp: number;

  @ApiProperty()
  entryPrice: number;

  @ApiProperty({ nullable: true })
  currentPrice?: number;

  @ApiProperty({ nullable: true })
  exitPrice?: number;

  @ApiProperty({ nullable: true })
  pnl?: number;

  @ApiProperty()
  stake: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  transactionHash: string;
}

export class SignalDto extends UserSignalDto {}

export class UserStatsDto {
  @ApiProperty()
  totalPnl: number;

  @ApiProperty({ nullable: true })
  bestSignal?: UserSignalDto;

  @ApiProperty({ nullable: true })
  worstSignal?: UserSignalDto;

  @ApiProperty()
  averageStake: number;

  @ApiProperty()
  latestSignalsCount: number;
}

export class TopTokenDto {
  @ApiProperty()
  ticker: string;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  totalSignals: number;

  @ApiProperty()
  pnl: number;
}

export class DetailedUserStatsDto {
  @ApiProperty()
  totalPnl: number;

  @ApiProperty()
  weeklyPnl: number;

  @ApiProperty()
  monthlyPnl: number;

  @ApiProperty()
  bestStreak: number;

  @ApiProperty()
  currentStreak: number;

  @ApiProperty({ type: [TopTokenDto] })
  topTokens: TopTokenDto[];
}

export class EnhancedUserDto {
  @ApiProperty()
  fid: number;

  @ApiProperty()
  username: string;

  @ApiProperty({ nullable: true })
  displayName?: string;

  @ApiProperty({ nullable: true })
  avatar?: string;

  @ApiProperty({ nullable: true })
  pfpUrl?: string;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  mfsScore: number;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  totalSignals: number;

  @ApiProperty()
  rank: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class UsersListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      users: { type: 'array', items: { $ref: '#/components/schemas/UserDto' } },
      total: { type: 'number' },
      hasMore: { type: 'boolean' },
    },
  })
  data: {
    users: User[];
    total: number;
    hasMore: boolean;
  };
}

export class UserDetailResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/EnhancedUserDto' },
      recentSignals: {
        type: 'array',
        items: { $ref: '#/components/schemas/UserSignalDto' },
      },
      stats: { $ref: '#/components/schemas/UserStatsDto' },
    },
  })
  data: {
    user: EnhancedUserDto;
    recentSignals: UserSignalDto[];
    stats: UserStatsDto;
  };
}

export class UserSignalsResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      signals: { type: 'array', items: { $ref: '#/components/schemas/SignalDto' } },
      total: { type: 'number' },
      hasMore: { type: 'boolean' },
    },
  })
  data: {
    signals: SignalDto[];
    total: number;
    hasMore: boolean;
  };
}

export class UserStatsResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: DetailedUserStatsDto })
  data: DetailedUserStatsDto;
}
