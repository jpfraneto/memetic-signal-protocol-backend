import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ContractAccountDto {
  @ApiProperty()
  @IsString()
  fid: string;

  @ApiProperty()
  @IsString()
  walletAddress: string;

  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  pfp_url: string;

  @ApiProperty()
  @IsBoolean()
  is_banned: boolean;

  @ApiProperty()
  @IsNumber()
  created_at: number;
}

export class UserDailyStatusDto {
  @ApiProperty()
  @IsNumber()
  currentDay: number;

  @ApiProperty()
  @IsString()
  lastSignalDate: string;
}

export class ActiveSessionDto {
  @ApiProperty()
  @IsString()
  sessionId: string;

  @ApiProperty()
  @IsNumber()
  startTime: number;

  @ApiProperty()
  @IsNumber()
  expiresAt: number;

  @ApiProperty()
  @IsString()
  userAgent: string;

  @ApiProperty()
  @IsString()
  source: 'miniapp' | 'frame' | 'api';
}

export class SyncUserDataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractAccountDto)
  contractAccount?: ContractAccountDto;

  @ApiPropertyOptional()
  @IsOptional()
  userDailyStatus?: UserDailyStatusDto | boolean[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ActiveSessionDto)
  activeSession?: ActiveSessionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jbmBalance?: string;
}
