import {
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CallDirection, CallTimeframe } from '../../../models/Call/Call.types';
import { IsEthereumAddress } from '../../call/validators/ethereum-address.validator';

export class CreateSignalDto {
  @ApiProperty({ description: "User's Farcaster ID" })
  @IsNumber()
  @IsPositive()
  fid: number;

  @ApiProperty({ description: "User's username" })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'Target token contract address' })
  @IsString()
  @IsEthereumAddress()
  tokenAddress: string;

  @ApiProperty({ description: 'Token symbol/ticker' })
  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @ApiProperty({ description: 'Prediction direction', enum: ['up', 'down'] })
  @IsEnum(['up', 'down'])
  direction: CallDirection;

  @ApiProperty({
    description: 'Timeframe for the prediction',
    enum: ['24h', '7d', '30d'],
  })
  @IsEnum(['24h', '7d', '30d'])
  timeframe: CallTimeframe;

  @ApiProperty({ description: 'Blockchain transaction hash' })
  @IsString()
  @IsNotEmpty()
  txHash: string;

  @ApiPropertyOptional({
    description: 'Token price at time of signal creation',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  entryPrice?: number;
}
