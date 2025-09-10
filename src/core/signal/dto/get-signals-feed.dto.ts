import {
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

import { SignalStatus } from '../../../models/Signal/Signal.types';

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
  @IsEnum(['ACTIVE', 'WON', 'LOST', 'EXPIRED'])
  status?: SignalStatus;

  @ApiPropertyOptional({ description: 'Filter by timeframe' })
  @IsOptional()
  @IsEnum(['24h', '7d', '30d'])
  timeframe?: '24h' | '7d' | '30d';

  @ApiPropertyOptional({ description: 'Filter by user FID' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  fid?: number;

  @ApiPropertyOptional({ description: 'Filter by token address' })
  @IsOptional()
  @IsString()
  ca?: string;

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

  @ApiPropertyOptional({ description: 'Filter by resolved status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  resolved?: boolean;

  @ApiPropertyOptional({ description: 'Cursor for pagination (signal ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
