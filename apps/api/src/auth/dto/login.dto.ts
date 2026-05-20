import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@demo.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'demo12345' })
  @IsString()
  @MinLength(6)
  password: string;
}
