import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenDto {
  @ApiProperty({
    example: '0x1234567890123456789012345678901234567890',
    description: 'Contract address of the token',
  })
  address: string;

  @ApiProperty({
    example: 'Example Token',
    description: 'Full name of the token',
  })
  name: string;

  @ApiProperty({
    example: 'EXT',
    description: 'Token symbol/ticker',
  })
  symbol: string;

  @ApiProperty({
    example: 1.234567,
    description: 'Current price in USD',
  })
  price: number;

  @ApiPropertyOptional({
    example: 5.67,
    description: '24-hour price change percentage',
  })
  change24h?: number;

  @ApiPropertyOptional({
    example: 'https://example.com/token-logo.png',
    description: 'Token logo image URL',
  })
  image?: string;

  @ApiPropertyOptional({
    example: 1234567890,
    description: 'Market capitalization in USD',
  })
  marketCap?: number;

  @ApiPropertyOptional({
    example: '1000000000000000000000000000',
    description: 'Total supply of tokens',
  })
  totalSupply?: string;

  @ApiProperty({
    example: 18,
    description: 'Number of decimal places for the token',
  })
  decimals: number;

  @ApiPropertyOptional({
    example: [],
    description: 'Market cap history data',
  })
  marketCapHistory?: { timestamp: Date; marketCap: number }[];

  @ApiPropertyOptional({
    example: 5.67,
    description: '24-hour market cap change percentage',
  })
  marketCapChange24h?: number;

  @ApiPropertyOptional({
    example: 15.2,
    description: '7-day market cap change percentage',
  })
  marketCapChange7d?: number;

  @ApiPropertyOptional({
    example: 25.8,
    description: '30-day market cap change percentage',
  })
  marketCapChange30d?: number;

  @ApiPropertyOptional({
    example: 12345678,
    description: '7-day average market cap',
  })
  avgMarketCap7d?: number;

  @ApiPropertyOptional({
    example: 11234567,
    description: '30-day average market cap',
  })
  avgMarketCap30d?: number;

  @ApiPropertyOptional({
    example: 15000000,
    description: 'Peak market cap achieved',
  })
  peakMarketCap?: number;

  @ApiPropertyOptional({
    example: '2024-01-15T10:30:00Z',
    description: 'Date when peak market cap was reached',
  })
  peakMarketCapDate?: Date;

  @ApiPropertyOptional({
    example: '2024-01-20T15:45:00Z',
    description: 'Last market cap update timestamp',
  })
  lastMarketCapUpdate?: Date;
}

export class TokenResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: TokenDto })
  data: TokenDto;
}