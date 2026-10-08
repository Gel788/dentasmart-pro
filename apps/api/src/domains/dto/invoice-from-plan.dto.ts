import { IsArray, IsOptional, IsString } from 'class-validator';

export class InvoiceFromPlanDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];

  @IsOptional()
  @IsString()
  appointmentId?: string;
}
