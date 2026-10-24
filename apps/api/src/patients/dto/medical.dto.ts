import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AnxietyLevel } from '@dentasmart/database';

/** A medical history save: names the version it was edited from, so a stale form cannot overwrite a newer one. */
export class MedicalDto {
  @IsInt() @Min(0) version!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(120, { each: true }) allergies?: string[];
  @IsOptional() @IsString() @MaxLength(4000) chronicConditions?: string;
  @IsOptional() @IsString() @MaxLength(4000) medications?: string;
  @IsOptional() @IsString() @MaxLength(4000) contraindications?: string;
  @IsOptional() @IsString() @MaxLength(8000) anamnesis?: string;
  @IsOptional() @IsEnum(AnxietyLevel) anxiety?: AnxietyLevel;
  @IsOptional() @IsBoolean() pregnant?: boolean;
  @IsOptional() @IsBoolean() anticoagulant?: boolean;
  /** The clinician went through the history with the patient; stamps who and when. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}
