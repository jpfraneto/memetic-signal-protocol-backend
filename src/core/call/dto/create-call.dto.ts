import {
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsPositive,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CallDirection, CallMetadata } from '../../../models';
import { IsEthereumAddress } from '../validators/ethereum-address.validator';

export class CreateCallDto {
  @ApiProperty({
    description: 'Auto-incremented signal ID from blockchain event',
  })
  @IsString()
  @IsNotEmpty()
  signalId: string;

  @ApiProperty({ description: 'Blockchain transaction hash' })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;

  @ApiProperty({ description: "User's Farcaster ID from the call" })
  @IsNumber()
  @IsPositive()
  fid: number;

  @ApiProperty({ description: 'Target token contract address' })
  @IsString()
  @IsEthereumAddress()
  tokenAddress: string;

  @ApiProperty({ description: 'Token symbol/ticker' })
  @IsString()
  @IsNotEmpty()
  ticker: string;

  @ApiProperty({ description: 'Prediction direction', enum: ['up', 'down'] })
  @IsEnum(['up', 'down'])
  direction: CallDirection;

  @ApiProperty({ description: 'Block timestamp from transaction' })
  @IsNumber()
  @IsPositive()
  timestamp: number;

  @ApiPropertyOptional({ description: 'Token price at time of call creation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  callPrice?: number;

  @ApiPropertyOptional({ description: 'Additional context metadata' })
  @IsOptional()
  @IsObject()
  metadata?: CallMetadata;

  @ApiPropertyOptional({ description: 'Username of the user making the call' })
  @IsOptional()
  @IsString()
  username: string;
}
