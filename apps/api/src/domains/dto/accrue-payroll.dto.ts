import { IsDateString } from 'class-validator';

export class AccruePayrollDto {
  @IsDateString()
  periodFrom: string;

  @IsDateString()
  periodTo: string;
}
