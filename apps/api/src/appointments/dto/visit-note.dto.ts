import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VisitNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  complaints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  anamnesis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recommendations?: string;
}
