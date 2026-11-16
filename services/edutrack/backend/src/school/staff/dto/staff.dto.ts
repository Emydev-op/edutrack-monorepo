import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

const KINDS = ['Teaching', 'Non-teaching'] as const;
const EMPLOYMENTS = ['Full-time', 'Part-time', 'Contract'] as const;
const GENDERS = ['Female', 'Male', ''] as const;
const GROUP_FILTERS = [
  'All',
  'No access',
  'Teaching',
  'Administrative',
  'Finance',
  'Operations',
] as const;
const ACCOUNT_FILTERS = [
  '',
  'Active',
  'Invited',
  'Suspended',
  'Deactivated',
  'No account',
] as const;
const STATUS_FILTERS = ['', 'Active', 'Deactivated'] as const;

/** `GET /v1/staff` filters (the directory loads every row; the screen pages them). */
export class StaffQueryDto {
  @ApiPropertyOptional({ description: 'Name, staff ID, position, email, phone or department' })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: GROUP_FILTERS })
  @IsOptional()
  @IsIn(GROUP_FILTERS, { message: 'Unknown staff group.' })
  group?: (typeof GROUP_FILTERS)[number];

  @ApiPropertyOptional({ example: 'Lekki Campus', description: 'A branch name, or All branches' })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_FILTERS })
  @IsOptional()
  @IsIn(ACCOUNT_FILTERS, { message: 'Unknown account status.' })
  account?: (typeof ACCOUNT_FILTERS)[number];

  @ApiPropertyOptional({ enum: STATUS_FILTERS })
  @IsOptional()
  @IsIn(STATUS_FILTERS, { message: 'Unknown status.' })
  status?: (typeof STATUS_FILTERS)[number];
}

/**
 * Add and edit share one form (`StaffPayload` in School Admin). Formats, duplicates and branch
 * rules are checked by the service in the form's order, so the first problem is the one shown.
 */
export class StaffPayloadDto {
  @ApiPropertyOptional({ example: 'Mrs.' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(20, { message: 'Keep the title under 20 characters.' })
  @IsString()
  title: string = '';

  @ApiProperty({ example: 'Grace' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the first name under 60 characters.' })
  @IsString({ message: 'Enter a first name.' })
  @IsNotEmpty({ message: 'Enter a first name.' })
  firstName!: string;

  @ApiProperty({ example: 'Okafor' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the last name under 60 characters.' })
  @IsString({ message: 'Enter a last name.' })
  @IsNotEmpty({ message: 'Enter a last name.' })
  lastName!: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS, { message: 'Choose Female or Male.' })
  gender: (typeof GENDERS)[number] = '';

  @ApiPropertyOptional({ example: '0803 555 0161', description: 'Nigerian mobile; empty for none' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(20, { message: 'Use a Nigerian mobile number, e.g. 0803 555 0161.' })
  @IsString()
  phone: string = '';

  @ApiPropertyOptional({ example: 'g.okafor@greenfield.edu.ng', description: 'Empty for none' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254, { message: 'Enter a valid email, e.g. name@school.ng.' })
  @IsString()
  email: string = '';

  @ApiPropertyOptional({ example: '14 Allen Avenue, Ikeja' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(300, { message: 'Keep the address under 300 characters.' })
  @IsString()
  address: string = '';

  @ApiPropertyOptional({ example: 'Spouse · 0803 555 0144' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the emergency contact under 200 characters.' })
  @IsString()
  emergencyContact: string = '';

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS, { message: 'Choose teaching or non-teaching.' })
  kind!: (typeof KINDS)[number];

  @ApiProperty({ example: 'Teacher' })
  @Transform(trim)
  @MaxLength(80, { message: 'Keep the position under 80 characters.' })
  @IsString({ message: 'Choose a position.' })
  position!: string;

  @ApiPropertyOptional({ example: 'Languages' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the department under 60 characters.' })
  @IsString()
  department: string = '';

  @ApiProperty({ enum: EMPLOYMENTS })
  @IsIn(EMPLOYMENTS, { message: 'Choose full-time, part-time or contract.' })
  employment!: (typeof EMPLOYMENTS)[number];

  @ApiPropertyOptional({ example: '2026-09-14', description: 'ISO date; empty when unknown' })
  @IsOptional()
  @MaxLength(10, { message: 'Enter the start date as a date.' })
  @IsString()
  since: string = '';

  @ApiProperty({ type: [String], description: 'Branch ids they work at' })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsArray({ message: 'Choose at least one branch.' })
  branchIds!: string[];

  @ApiPropertyOptional({ type: [String], example: ['ENG', 'LIE'], description: 'Subject codes' })
  @IsOptional()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @IsArray()
  qualified: string[] = [];

  @ApiPropertyOptional({ example: 28, description: 'Teaching staff: 1 to 40' })
  @IsOptional()
  @Type(() => Number)
  @Max(1000)
  @Min(0)
  @IsInt({ message: 'Maximum periods per week is between 1 and 40.' })
  maxPeriods: number = 0;

  @ApiPropertyOptional({ description: 'Give them an Edutrack account (sends an invitation)' })
  @IsOptional()
  @IsBoolean()
  access: boolean = false;

  @ApiPropertyOptional({ example: 'Teacher', description: 'Role name, when access is on' })
  @IsOptional()
  @MaxLength(60)
  @IsString()
  role: string = '';

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Photo as a data URL (JPG or PNG, 2 MB); null removes it; omit to keep it.',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @MaxLength(3_000_000, { message: 'The photo is larger than 2 MB.' })
  @IsString()
  photo?: string | null;
}

export class DeactivateStaffDto {
  @ApiPropertyOptional({ description: 'Required when they teach: cover is arranged.' })
  @IsOptional()
  @IsBoolean()
  coverArranged?: boolean;
}

export class InviteStaffDto {
  @ApiProperty({ type: [String], description: 'Staff ids' })
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsArray({ message: 'Choose who to invite.' })
  ids!: string[];
}

export class UploadStaffDocumentDto {
  @ApiProperty({ example: 'Guarantor form' })
  @Transform(trim)
  @MaxLength(80, { message: 'Keep the document type under 80 characters.' })
  @IsString({ message: 'Choose the document type.' })
  @IsNotEmpty({ message: 'Choose the document type.' })
  kind!: string;

  @ApiProperty({ example: 'guarantor-form.pdf' })
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the file name under 200 characters.' })
  @IsString({ message: 'Choose a file.' })
  @IsNotEmpty({ message: 'Choose a file.' })
  name!: string;

  @ApiProperty({ description: 'The file as a data URL: PDF, JPG or PNG up to 5 MB.' })
  @MaxLength(7_200_000, { message: 'The file is larger than 5 MB.' })
  @IsString({ message: 'Choose a file.' })
  @IsNotEmpty({ message: 'Choose a file.' })
  file!: string;
}

export class StaffImportDto {
  @ApiProperty({ example: 'staff.csv' })
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the file name under 200 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Choose a file.' })
  fileName!: string;

  @ApiProperty({ description: 'The CSV text (up to 1 MB), template columns in the first row.' })
  @MaxLength(1_048_576, { message: 'The file is larger than 1 MB.' })
  @IsString({ message: 'The file has no staff rows. Use the template’s columns.' })
  text!: string;
}
