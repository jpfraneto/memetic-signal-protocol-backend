import { ApiProperty } from '@nestjs/swagger';
import { SignalStatus, SignalDirection } from '../../../models/Signal/Signal.types';

export class SignalResponseDto {
  @ApiProperty()
  signalId: string;

  @ApiProperty()
  fid: number;

  @ApiProperty()
  tokenAddress: string;

  @ApiProperty()
  symbol: string;

  @ApiProperty()
  initialMarketCap: string;

  @ApiProperty({ enum: ['UP', 'DOWN'] })
  direction: SignalDirection;

  @ApiProperty()
  timestamp: number;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ enum: ['ACTIVE', 'WON', 'LOST', 'EXPIRED'] })
  status: SignalStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  user: {
    fid: number;
    username: string;
    pfpUrl?: string;
    totalSignals: number;
    winRate: number;
    mfsScore: number;
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

  @ApiProperty()
  timeRemaining: number;

  @ApiProperty()
  canSignal: boolean;

  @ApiProperty()
  canRetry: boolean;

  @ApiProperty()
  hasSignaledToday: boolean;

  @ApiProperty()
  hasUsedRetry: boolean;

  @ApiProperty({ nullable: true })
  suggestedTokens: Array<{
    address: string;
    ticker: string;
  }> | null;
}