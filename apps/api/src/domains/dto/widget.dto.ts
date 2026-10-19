import { IsEmail, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PHONE = /^[\d\s()+-]{10,20}$/;

export class WidgetBookDto {
  @IsString()
  @MaxLength(64)
  branchId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serviceId?: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @Matches(PHONE, { message: 'Укажите телефон' })
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}

/** A phone alone is guessable, so lookups also need the surname on the card. */
export class WidgetLookupDto {
  @Matches(PHONE, { message: 'Укажите телефон' })
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;
}

export class WidgetRescheduleDto extends WidgetLookupDto {
  @IsString()
  @MaxLength(64)
  appointmentId: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;
}
