import {
  IsNumber,
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsPositive,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SignalDirection } from '../../../models/Signal/Signal.types';

export class TokenPredictionDto {
  @ApiProperty({ description: 'Token contract address' })
  @IsString()
  @IsNotEmpty()
  ca: string;

  @ApiProperty({ description: 'Token symbol/ticker' })
  @IsString()
  @IsNotEmpty()
  ticker: string;

  @ApiProperty({ description: 'Market cap at signal time (scaled by 1e18)' })
  @IsString()
  @IsNotEmpty()
  mc: string;

  @ApiProperty({ description: 'Prize amount in USDC (future feature)' })
  @IsString()
  @IsNotEmpty()
  prizeInUSDC: string;

  @ApiProperty({ description: 'Token image URL' })
  @IsString()
  @IsNotEmpty()
  tokenImageUrl: string;

  @ApiProperty({ description: 'Prediction direction', enum: ['UP', 'DOWN'] })
  @IsEnum(['UP', 'DOWN'])
  direction: SignalDirection;
}

export class CreateSignalDto {
  @ApiProperty({ description: "User's Farcaster ID" })
  @IsNumber()
  @IsPositive()
  fid: number;

  @ApiProperty({
    description: 'Array of 8 token predictions',
    type: [TokenPredictionDto],
  })
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TokenPredictionDto)
  tokens: TokenPredictionDto[];

  @ApiPropertyOptional({
    description: 'Session metadata',
  })
  @IsOptional()
  metadata?: {
    sessionStartTime?: number;
    isRetry?: boolean;
    userAgent?: string;
    source?: 'miniapp' | 'frame' | 'api';
  };
}