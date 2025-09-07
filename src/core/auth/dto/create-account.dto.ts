import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({
    description: 'User acceptance of terms and conditions',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  acceptTerms: boolean;
}
