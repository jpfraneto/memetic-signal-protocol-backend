import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/models';

export class CallDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  signalId: string;

  @ApiProperty()
  fid: number;

  @ApiProperty()
  ca: string;

  @ApiProperty()
  ticker: string;

  @ApiProperty()
  direction: string;

  @ApiProperty()
  timestamp: number;

  @ApiProperty()
  callPrice: number;

  @ApiProperty()
  transactionHash: string;
}

export class UserStatsDto {
  @ApiProperty()
  totalPnl: number;

  @ApiProperty()
  bestCall: CallDto;

  @ApiProperty()
  worstCall: CallDto;

  @ApiProperty()
  averageStake: number;

  @ApiProperty()
  callsThisWeek: number;
}

export class TopTokenDto {
  @ApiProperty()
  ticker: string;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  totalCalls: number;

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
      user: { $ref: '#/components/schemas/User' },
      recentCalls: {
        type: 'array',
        items: { $ref: '#/components/schemas/CallDto' },
      },
      stats: { $ref: '#/components/schemas/UserStatsDto' },
    },
  })
  data: {
    user: User;
    recentCalls: CallDto[];
    stats: UserStatsDto;
  };
}

export class UserCallsResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      calls: { type: 'array', items: { $ref: '#/components/schemas/CallDto' } },
      total: { type: 'number' },
      hasMore: { type: 'boolean' },
    },
  })
  data: {
    calls: CallDto[];
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
