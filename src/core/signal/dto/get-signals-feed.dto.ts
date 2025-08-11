import {
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

import { CallStatus, CallTimeframe } from '../../../models/Call/Call.types';

export class GetSignalsFeedDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by signal status' })
  @IsOptional()
  @IsEnum(['active', 'won', 'lost', 'expired'])
  status?: CallStatus;

  @ApiPropertyOptional({ description: 'Filter by timeframe' })
  @IsOptional()
  @IsEnum(['24h', '7d', '30d'])
  timeframe?: CallTimeframe;

  @ApiPropertyOptional({ description: 'Filter by user FID' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  fid?: number;

  @ApiPropertyOptional({ description: 'Filter by token address' })
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'pnlPercentage'],
  })
  @IsOptional()
  @IsEnum(['createdAt', 'pnlPercentage'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
