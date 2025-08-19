import { ApiProperty } from '@nestjs/swagger';

export class FarcasterSwapProfileMetadataDto {
  @ApiProperty({ example: 'Squirtle0x', description: 'Display name of the user' })
  displayName: string;

  @ApiProperty({ example: 'https://i.imgur.com/O7W7iUL.jpg', description: 'Profile image URL' })
  imageUrl: string;
}

export class FarcasterSwapProfileDto {
  @ApiProperty({ example: 'squirtle0x.eth', description: 'Username of the swapper' })
  username: string;

  @ApiProperty({ example: 4022, description: 'Farcaster ID of the swapper' })
  fid: number;

  @ApiProperty({ type: FarcasterSwapProfileMetadataDto, description: 'Profile metadata' })
  metadata: FarcasterSwapProfileMetadataDto;
}

export class FarcasterSwapDto {
  @ApiProperty({ example: 1750866271000, description: 'Timestamp of the swap' })
  timestamp: number;

  @ApiProperty({ example: 4.637, description: 'Volume in USD' })
  volumeUsd: number;

  @ApiProperty({ example: 9775.53, description: 'Token amount swapped' })
  amount: number;

  @ApiProperty({ example: true, description: 'Whether it was a buy or sell' })
  isBuy: boolean;

  @ApiProperty({ type: FarcasterSwapProfileDto, description: 'Profile of the swapper' })
  profile: FarcasterSwapProfileDto;
}

export class TokenPriceDataDto {
  @ApiProperty({ example: 0.0005557, description: 'Current price in USD' })
  price: number;

  @ApiProperty({ example: 15.99, description: '24h price change percentage' })
  priceChange24h: number;

  @ApiProperty({ example: 227291.73, description: '24h trading volume in USD' })
  volume24h: number;

  @ApiProperty({ example: 555718.87, description: 'Market capitalization in USD' })
  marketCap: number;

  @ApiProperty({ 
    type: [FarcasterSwapDto], 
    required: false, 
    description: 'Latest relevant swaps by followed accounts' 
  })
  latestRelevantFarcasterSwaps?: FarcasterSwapDto[];
}

export class TokenDataDto {
  @ApiProperty({ example: 'Tipn', description: 'Token name' })
  name: string;

  @ApiProperty({ example: 'TIPN', description: 'Token symbol' })
  symbol: string;

  @ApiProperty({ 
    example: 'https://storage.googleapis.com/zapper-fi-assets/tokens/base/0x5ba8d32579a4497c12d327289a103c3ad5b64eb1.png', 
    description: 'Token image URL' 
  })
  imageUrlV2: string;

  @ApiProperty({ example: 18, description: 'Token decimals' })
  decimals: number;

  @ApiProperty({ type: TokenPriceDataDto, description: 'Price and market data' })
  priceData: TokenPriceDataDto;
}

export class TrendingTokenDto {
  @ApiProperty({ 
    example: '0x5ba8d32579a4497c12d327289a103c3ad5b64eb1', 
    description: 'Token contract address' 
  })
  tokenAddress: string;

  @ApiProperty({ example: 8453, description: 'Chain ID (Base = 8453)' })
  chainId: number;

  @ApiProperty({ type: TokenDataDto, description: 'Token metadata and price data' })
  token: TokenDataDto;
}