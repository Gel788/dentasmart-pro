import { IsBoolean, IsEmail, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  /** Consent to the processing of personal data (152-FZ), ticked by the patient in the form. */
  @IsBoolean()
  consent: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class WidgetChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
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
