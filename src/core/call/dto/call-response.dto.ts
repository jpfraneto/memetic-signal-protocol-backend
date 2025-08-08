import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallDirection } from '../../../models';

export class UserDto {
  @ApiProperty({ description: "User's Farcaster ID" })
  fid: number;

  @ApiProperty({ description: "User's display name from Farcaster" })
  username: string;

  @ApiPropertyOptional({ description: "User's avatar URL from Farcaster" })
  pfpUrl?: string;

  @ApiPropertyOptional({ description: "User's role in the system" })
  role?: string;

  @ApiPropertyOptional({ description: 'When user was created' })
  createdAt?: Date;

  @ApiPropertyOptional({ description: 'When user was last active' })
  lastActiveAt?: Date;
}

export class CallResponseDto {
  @ApiProperty({ description: 'Database ID (same as signalId)' })
  id: string;

  @ApiProperty({ description: 'Signal ID' })
  signalId: string;

  @ApiProperty({ description: "User's Farcaster ID" })
  fid: number;

  @ApiProperty({ description: "User's display name from Farcaster" })
  username: string;

  @ApiPropertyOptional({ description: "User's avatar URL from Farcaster" })
  avatar?: string;

  @ApiProperty({ description: 'Complete user information', type: UserDto })
  user: UserDto;

  @ApiProperty({ description: 'Token contract address' })
  tokenAddress: string;

  @ApiProperty({ description: 'Token symbol' })
  ticker: string;

  @ApiProperty({ description: 'Call direction', enum: ['up', 'down'] })
  direction: CallDirection;

  @ApiProperty({ description: 'Unix timestamp' })
  timestamp: number;

  @ApiPropertyOptional({ description: 'Token price at call time' })
  callPrice?: number;

  @ApiProperty({ description: 'Blockchain transaction hash' })
  transactionHash: string;
}

export class CallsFeedResponseDto {
  @ApiProperty({ type: [CallResponseDto] })
  calls: CallResponseDto[];

  @ApiProperty({ description: 'Total number of calls available' })
  total: number;

  @ApiProperty({ description: 'Whether more calls are available' })
  hasMore: boolean;
}
