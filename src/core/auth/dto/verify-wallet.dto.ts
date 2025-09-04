import { IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyWalletDto {
  @ApiProperty({
    description: 'Farcaster ID (FID) of the user',
    example: 12345,
  })
  @IsNumber()
  @IsNotEmpty()
  fid: number;

  @ApiProperty({
    description: 'Ethereum wallet address to verify',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
