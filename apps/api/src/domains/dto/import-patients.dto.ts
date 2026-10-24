import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/** One patient row as the Import screen sends it (see apps/web/src/lib/migrate.ts PatientDraft). */
export class ImportPatientDto {
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) middleName?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) cardNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(10) gender?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(10) lastVisit?: string;
  @IsOptional() @IsString() @MaxLength(12) visits?: string;
  @IsOptional() @IsString() @MaxLength(20) balance?: string;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  @IsOptional() @IsString() @MaxLength(10) sms?: string;
  @IsOptional() @IsString() @MaxLength(60) segment?: string;
  @IsOptional() @IsString() @MaxLength(20) revenue?: string;
}

export class ImportPatientsDto {
  @IsOptional() @IsString() @MaxLength(20) source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportPatientDto)
  patients?: ImportPatientDto[];

  /** Visits are moved only by the demo for now; the API reports them as skipped. */
  @IsOptional() @IsArray() @ArrayMaxSize(2000) appointments?: unknown[];
}
