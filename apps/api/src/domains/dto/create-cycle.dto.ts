import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCycleDto {
  @IsString()
  branchId: string;

  @IsString()
  @MinLength(2)
  autoclave: string;

  @IsString()
  @MinLength(2)
  loadNote: string;

  @IsIn(['PASS', 'FAIL'])
  result: 'PASS' | 'FAIL';

  @IsOptional()
  @IsString()
  operatorName?: string;
}
