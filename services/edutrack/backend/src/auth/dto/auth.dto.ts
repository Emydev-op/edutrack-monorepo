import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password.js';

/** Portal names on the wire. */
export const PORTAL_NAMES = ['school_admin', 'teacher', 'parent', 'student', 'platform'] as const;
export type PortalName = (typeof PORTAL_NAMES)[number];

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PortalDto {
  @ApiPropertyOptional({
    enum: PORTAL_NAMES,
    description:
      'Which portal is signing in. Defaults to `teacher` on a school subdomain and `school_admin` ' +
      'elsewhere; the back office sends `platform`. The `X-EduTrack-Portal` header works too.',
  })
  @IsOptional()
  @Transform(lower)
  @IsIn(PORTAL_NAMES, { message: 'Unknown portal.' })
  portal?: PortalName;
}

export class LoginDto extends PortalDto {
  @ApiPropertyOptional({
    description:
      'Email address or phone number (E.164 or Nigerian local format). Named `email` because ' +
      'that is what the portals send; `identifier` is an alias.',
    example: 'adaeze.okonkwo@greenfield.edu.ng',
  })
  @ValidateIf((o: LoginDto) => !o.identifier)
  @Transform(trim)
  @MaxLength(254)
  @IsString()
  @IsNotEmpty({ message: 'Enter your email address or phone number.' })
  email?: string;

  @ApiPropertyOptional({ description: 'Alias of `email`: an email address or phone number.' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(254)
  @IsString()
  identifier?: string;

  @ApiProperty({ example: 'Edutrack2026!' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Enter your password.' })
  password: string;

  @ApiPropertyOptional({
    description: 'Keep me signed in (30-day refresh cookie).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;

  @ApiPropertyOptional({
    description:
      'School Admin only: the school to open when the user belongs to several. Without it the ' +
      'school used last is opened and `schools` lists the others.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Unknown school.' })
  schoolId?: string;
}

export class ExpiredPasswordDto extends PortalDto {
  @ApiProperty({ description: 'Email address or phone number.' })
  @Transform(trim)
  @MaxLength(254)
  @IsString()
  @IsNotEmpty({ message: 'Enter your email address or phone number.' })
  email: string;

  @ApiProperty({ description: 'The expired password.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password.' })
  current: string;

  @ApiProperty({ description: 'The new password (platform policy).' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Choose a new password.' })
  next: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'Unknown school.' })
  schoolId?: string;
}

export class LogoutDto extends PortalDto {
  @ApiPropertyOptional({ description: 'Also sign out every other device.', default: false })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

export class SwitchSchoolDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Unknown school.' })
  schoolId: string;
}

export class ForgotPasswordDto extends PortalDto {
  @ApiProperty({ description: 'Email address (or phone number: the link is sent by SMS).' })
  @Transform(trim)
  @MaxLength(254)
  @IsString()
  @IsNotEmpty({ message: 'Enter your email address.' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link.' })
  @MaxLength(200)
  @IsString()
  token: string;

  @ApiProperty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Choose a new password.' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password.' })
  current: string;

  @ApiProperty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Choose a new password.' })
  next: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(80)
  @IsString()
  @IsNotEmpty({ message: 'Enter your first and last name.' })
  firstName: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(80)
  @IsString()
  @IsNotEmpty({ message: 'Enter your first and last name.' })
  lastName: string;

  @ApiPropertyOptional({ description: 'Mobile number; optional.', example: '0803 412 7781' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(32)
  @IsString()
  phone?: string;

  @ApiProperty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsString()
  @IsNotEmpty({ message: 'Choose a password.' })
  password: string;
}
