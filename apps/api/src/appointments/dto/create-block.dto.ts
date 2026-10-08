import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsString()
  cabinetId: string;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  reason: string;
}
