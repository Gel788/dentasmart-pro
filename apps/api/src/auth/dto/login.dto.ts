import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@demo.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'demo12345' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ required: false, example: '123456', description: 'Код из приложения, если включена двухфакторная защита' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Код — шесть цифр' })
  code?: string;
}
