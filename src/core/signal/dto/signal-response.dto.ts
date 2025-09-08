import { ApiProperty } from '@nestjs/swagger';

export class SignalResponseDto {
  @ApiProperty({ description: 'Transaction hash' })
  transaction_hash: string;

  @ApiProperty({ description: 'User Farcaster ID' })
  fid: number;

  @ApiProperty({ description: 'Token contract address' })
  ca: string;

  @ApiProperty({
    description: 'Signal direction - true for UP, false for DOWN',
  })
  direction: boolean;

  @ApiProperty({ description: 'Market cap when signal was created' })
  entry_market_cap: number;

  @ApiProperty({ description: 'Signal duration in days' })
  duration: number;

  @ApiProperty({ description: 'Block timestamp' })
  timestamp: string;

  @ApiProperty({ description: 'Block number' })
  block_number: number;

  @ApiProperty({ description: 'Signal status (0=ACTIVE, 1=WON, 2=LOST)' })
  status: number;

  @ApiProperty({ description: 'Signal expiration date' })
  expires_at: Date;

  @ApiProperty({ description: 'User information', required: false })
  user?: {
    fid: number;
    username: string;
    display_name?: string;
    pfp_url?: string;
    total_signals: number;
    win_rate: number;
    mfs_score: number;
  };

  @ApiProperty({ description: 'Token information', required: false })
  token?: {
    ca: string;
    name: string;
    symbol: string;
    image?: string;
  };
}

export class SignalsFeedResponseDto {
  @ApiProperty({ type: [SignalResponseDto] })
  signals: SignalResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  hasMore: boolean;
}

export class SessionStatusDto {
  @ApiProperty()
  isActive: boolean;

  @ApiProperty({
    description: 'Time remaining in milliseconds. -1 indicates no time limit.',
  })
  timeRemaining: number;

  @ApiProperty()
  canSignal: boolean;

  @ApiProperty()
  canRetry: boolean;

  @ApiProperty()
  hasSignaledToday: boolean;

  @ApiProperty()
  hasUsedRetry: boolean;
}
