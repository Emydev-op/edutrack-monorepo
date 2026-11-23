import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

const GENDERS = ['Female', 'Male'] as const;
const TYPES = ['New intake', 'Transfer in'] as const;
const MODES = ['link', 'new', 'skip'] as const;

/** Who looks after the student: an existing guardian, a new one, or none yet. */
export class AdmitGuardianDto {
  @ApiProperty({ enum: MODES, example: 'new' })
  @IsIn(MODES, { message: 'Choose a guardian option.' })
  mode!: (typeof MODES)[number];

  @ApiPropertyOptional({ description: 'mode "link": the existing guardian’s id' })
  @ValidateIf((o: AdmitGuardianDto) => o.mode === 'link')
  @IsString({ message: 'Choose the guardian to link.' })
  @IsNotEmpty({ message: 'Choose the guardian to link.' })
  guardianId?: string;

  @ApiPropertyOptional({ example: 'Mr. Obinna Nwosu', description: 'mode "new"' })
  @ValidateIf((o: AdmitGuardianDto) => o.mode === 'new')
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the guardian’s name under 120 characters.' })
  @IsString({ message: 'Enter the guardian’s full name.' })
  @IsNotEmpty({ message: 'Enter the guardian’s full name.' })
  name?: string;

  @ApiPropertyOptional({ example: '0806 555 0193', description: 'mode "new": a Nigerian mobile' })
  @ValidateIf((o: AdmitGuardianDto) => o.mode === 'new')
  @Transform(trim)
  @MaxLength(20, { message: 'Enter a Nigerian phone number, e.g. 0803 555 0193.' })
  @IsString({ message: 'Enter a Nigerian phone number, e.g. 0803 555 0193.' })
  @IsNotEmpty({ message: 'Enter a Nigerian phone number, e.g. 0803 555 0193.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'obinna.nwosu@gmail.com', description: 'mode "new", optional' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(254, { message: 'Enter a valid email.' })
  @IsString({ message: 'Enter a valid email.' })
  email?: string;
}

/** The admission wizard's payload (`AdmitPayload` in school-admin/src/types/students.ts). */
export class AdmitDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'The application admitted' })
  @IsOptional()
  @IsString()
  applicationId?: string | null;

  @ApiProperty({ example: 'Nwosu' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the surname under 60 characters.' })
  @IsString({ message: 'Enter the surname.' })
  @IsNotEmpty({ message: 'Enter the surname.' })
  surname!: string;

  @ApiProperty({ example: 'Kamsi' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the first name under 60 characters.' })
  @IsString({ message: 'Enter the first name.' })
  @IsNotEmpty({ message: 'Enter the first name.' })
  firstName!: string;

  @ApiPropertyOptional({ example: 'Chidinma' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(80, { message: 'Keep other names under 80 characters.' })
  @IsString()
  otherNames?: string;

  @ApiProperty({ enum: GENDERS })
  @IsIn(GENDERS, { message: 'Choose the gender.' })
  gender!: (typeof GENDERS)[number];

  @ApiProperty({ example: '2014-05-12', description: 'YYYY-MM-DD' })
  @IsString({ message: 'Enter the date of birth.' })
  @IsNotEmpty({ message: 'Enter the date of birth.' })
  dateOfBirth!: string;

  @ApiPropertyOptional({ example: 'Anambra' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(40)
  @IsString()
  stateOfOrigin?: string;

  @ApiPropertyOptional({ example: 'Little Angels School' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the previous school under 120 characters.' })
  @IsString()
  previousSchool?: string;

  @ApiProperty({ type: AdmitGuardianDto })
  @ValidateNested()
  @Type(() => AdmitGuardianDto)
  @IsObject({ message: 'Choose a guardian option.' })
  guardian!: AdmitGuardianDto;

  @ApiPropertyOptional({ example: 'Father' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(40)
  @IsString()
  relationship?: string;

  @ApiPropertyOptional({ description: 'The guardian pays the fees (gets invoices).' })
  @IsOptional()
  @IsBoolean()
  paysFees?: boolean;

  @ApiPropertyOptional({
    description:
      'Accepted for the screen, ignored: admission never creates parent accounts or invitations. ' +
      'The school invites guardians from Parents.',
  })
  @IsOptional()
  @IsBoolean()
  invite?: boolean;

  @ApiProperty({ example: 'Main Campus' })
  @IsString({ message: 'Choose a branch.' })
  @IsNotEmpty({ message: 'Choose a branch.' })
  branch!: string;

  @ApiProperty({ example: 'JSS 1' })
  @IsString({ message: 'Choose a class.' })
  @IsNotEmpty({ message: 'Choose a class.' })
  level!: string;

  @ApiProperty({ example: 'A' })
  @IsString({ message: 'Choose a class arm.' })
  @IsNotEmpty({ message: 'Choose a class arm.' })
  arm!: string;

  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES, { message: 'Choose the admission type.' })
  admissionType!: (typeof TYPES)[number];

  @ApiPropertyOptional({ example: '2026-11-17', description: 'YYYY-MM-DD; today when empty' })
  @IsOptional()
  @IsString()
  admissionDate?: string;

  @ApiPropertyOptional({ example: 'CRS', description: 'Religious studies subject code' })
  @IsOptional()
  @IsString()
  religious?: string;

  @ApiPropertyOptional({ example: 'Computer Studies', description: 'Elective subject name' })
  @IsOptional()
  @IsString()
  elective?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: { birth: 'birth-certificate.pdf', photo: null, report: null },
    description: 'Document key → file name (null when not provided)',
  })
  @IsObject({ message: 'Birth certificate is required by your school settings.' })
  documents!: Record<string, string | null>;

  @ApiPropertyOptional({ enum: ['full', 'defer'] })
  @IsOptional()
  @IsIn(['full', 'defer'])
  billing?: 'full' | 'defer';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  siblingDiscount?: boolean;
}

export class AdmissionMatchesQueryDto {
  @ApiPropertyOptional({ example: 'Kamsi' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Nwosu' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  surname?: string;

  @ApiPropertyOptional({ example: '0806 555 0193', description: 'A guardian’s phone' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'obinna.nwosu@gmail.com', description: 'A guardian’s email' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(254)
  @IsString()
  email?: string;
}

export class StudentImportDto {
  @ApiProperty({ example: 'jss1-intake.csv' })
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the file name under 200 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Choose a file.' })
  fileName!: string;

  @ApiProperty({
    description:
      'The CSV text, or the filled .xlsx template as base64 (up to 4 MB), template columns first.',
  })
  @MaxLength(5_600_000, { message: 'The file is larger than 4 MB. Split it and try again.' })
  @IsString({ message: 'The file has no student rows. Use the template’s columns.' })
  text!: string;

  @ApiPropertyOptional({
    example: 'Main Campus',
    description: 'Branch for rows without a branch column (the header’s branch).',
  })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class StudentImportCommitDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { '12': 'JSS 1C', '31': '28/02/2014', '7': 'skip', '40': 'link' },
    description:
      'Row → chosen fix: the suggested class, a corrected date (DD/MM/YYYY), "skip" or "new" for ' +
      'a possible duplicate, "link" or "new" for a guardian matched by email.',
  })
  @IsOptional()
  @IsObject()
  resolutions?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Leave out rows that still have errors.' })
  @IsOptional()
  @IsBoolean()
  excludeErrors?: boolean;
}

const TYPES_LABEL = ['New intake', 'Transfer in'] as const;

/** POST /v1/admissions/applications and PUT /v1/admissions/applications/:id. */
export class ApplicationDto {
  @ApiProperty({ example: 'Kamsi' }) @IsString() @MaxLength(80) firstName!: string;
  @ApiProperty({ example: 'Nwosu' }) @IsString() @MaxLength(80) surname!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) otherNames?: string | null;
  @ApiPropertyOptional({ enum: ['Male', 'Female'] }) @IsOptional() @IsString() gender?:
    string | null;
  @ApiPropertyOptional({ example: '2014-05-12' }) @IsOptional() @IsString() dateOfBirth?:
    string | null;
  @ApiProperty({ enum: TYPES_LABEL }) @IsString() type!: string;
  @ApiProperty({ example: 'Main Campus' }) @IsString() branch!: string;
  @ApiProperty({ example: 'JSS 1' }) @IsString() level!: string;
  @ApiProperty({ example: 'Mr. Obinna Nwosu' }) @IsString() @MaxLength(120) guardianName!: string;
  @ApiPropertyOptional({ example: '0809 555 0193' }) @IsOptional() @IsString() guardianPhone?:
    string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) previousSchool?: string | null;
  @ApiPropertyOptional({ example: 'Sibling of Favour Okeke' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
  @ApiPropertyOptional({ example: '2026-11-20', description: 'Today when empty' })
  @IsOptional()
  @IsString()
  appliedOn?: string | null;
}

/** POST /v1/admissions/applications/:id/stage. */
export class ApplicationStageDto {
  @ApiProperty({
    enum: ['Pending', 'Under review', 'Offer sent', 'Offer accepted', 'Rejected', 'Declined'],
  })
  @IsString()
  stage!: string;

  @ApiPropertyOptional({ description: 'Why (required for Rejected and Declined)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional({
    example: '2026-11-28',
    description: 'Under review: assessment or interview day',
  })
  @IsOptional()
  @IsString()
  assessmentOn?: string | null;

  @ApiPropertyOptional({ example: '68%', description: 'Under review: the result' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assessmentResult?: string | null;

  @ApiPropertyOptional({ example: '2026-12-15', description: 'Offer sent: accept by' })
  @IsOptional()
  @IsString()
  offerExpiresOn?: string | null;
}
