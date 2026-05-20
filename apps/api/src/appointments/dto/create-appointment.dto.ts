import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsString()
  patientId: string;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cabinetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
