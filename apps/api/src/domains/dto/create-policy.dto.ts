import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePolicyDto {
  @IsString()
  patientId: string;

  @IsString()
  @MinLength(2)
  insurerName: string;

  @IsString()
  @MinLength(2)
  number: string;

  @IsOptional()
  @IsString()
  letterNumber?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limitAmount: number;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
