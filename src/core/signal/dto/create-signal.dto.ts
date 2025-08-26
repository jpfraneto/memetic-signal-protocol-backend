import {
  IsNumber,
  IsString,
  IsEnum,
  IsNotEmpty,
  IsPositive,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { SignalDirection } from '../../../models/Signal/Signal.types';

export class CreateSignalDto {
  @ApiProperty({ description: "User's Farcaster ID" })
  @IsNumber()
  @IsPositive()
  fid: number;

  @ApiProperty({ description: 'Token contract address' })
  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @ApiProperty({ description: 'Token symbol/ticker' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ description: 'Initial market cap at signal time' })
  @IsString()
  @IsNotEmpty()
  initialMarketCap: string;

  @ApiProperty({ description: 'Prediction direction', enum: ['UP', 'DOWN'] })
  @IsEnum(['UP', 'DOWN'])
  direction: SignalDirection;
}