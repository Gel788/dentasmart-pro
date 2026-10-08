import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateToMakeDto {
  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsString()
  patientId: string;

  @ApiProperty({ enum: ['RECEPTION', 'PATIENT', 'SYSTEM'] })
  @IsIn(['RECEPTION', 'PATIENT', 'SYSTEM'])
  source: 'RECEPTION' | 'PATIENT' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
