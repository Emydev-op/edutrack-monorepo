import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { SCHOOL_STATUS_LABELS } from '../../shared/format.js';
import { lower, trim } from '../../shared/params.js';

export class SchoolListQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SCHOOL_STATUS_LABELS })
  @IsOptional()
  @IsIn(SCHOOL_STATUS_LABELS, { message: 'Unknown status.' })
  status?: (typeof SCHOOL_STATUS_LABELS)[number];

  @ApiPropertyOptional({ description: 'Plan name, e.g. Growth' })
  @IsOptional()
  @MaxLength(60)
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @MaxLength(40)
  @IsString()
  state?: string;
}

export class UpdateSchoolDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the display name.' })
  name!: string;

  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @IsNotEmpty({ message: 'Enter a contact email.' })
  contactEmail!: string;

  @ApiProperty({ example: '0809 120 4400' })
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  @IsNotEmpty({ message: 'Enter a phone number.' })
  phone!: string;

  @ApiProperty({ example: 'Lagos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Select a state.' })
  state!: string;
}

export class ReasonDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Give a reason.' })
  reason!: string;
}

export class BulkSuspendDto extends ReasonDto {
  @ApiProperty({ type: [String] })
  @IsUUID('all', { each: true, message: 'One of the selected schools doesn’t exist.' })
  @ArrayMaxSize(100, { message: 'Suspend at most 100 schools at a time.' })
  @ArrayMinSize(1, { message: 'Select at least one school.' })
  @IsArray()
  ids!: string[];
}

export class RemindersDto {
  @ApiProperty({ type: [String] })
  @IsUUID('all', { each: true, message: 'One of the selected schools doesn’t exist.' })
  @ArrayMaxSize(200, { message: 'Send at most 200 reminders at a time.' })
  @ArrayMinSize(1, { message: 'Select at least one school.' })
  @IsArray()
  ids!: string[];
}

export const ADMIN_ROLES = ['School Admin', 'Owner'] as const;

export class InviteSchoolAdminDto {
  @ApiProperty({ example: 'Peter Okon' })
  @Transform(trim)
  @MaxLength(120)
  @Matches(/\S+\s+\S+/, { message: 'Enter their first and last name.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter a name.' })
  name!: string;

  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @IsNotEmpty({ message: 'Enter an email address.' })
  email!: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES, { message: 'Choose School Admin or Owner.' })
  role!: (typeof ADMIN_ROLES)[number];

  @ApiProperty({ example: 'All branches', description: '"All branches" or one branch name' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Choose which branches they manage.' })
  scope!: string;
}

export const OWNERSHIPS = ['Private', 'Public', 'Mission'] as const;
export const ACADEMIC_SECTIONS = [
  'Nursery',
  'Primary',
  'Junior Secondary',
  'Senior Secondary',
] as const;

export class ProvisionBranchDto {
  @ApiProperty({ example: 'Main Campus' })
  @Transform(trim)
  @MaxLength(80)
  @IsString()
  @IsNotEmpty({ message: 'Name every branch.' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(200)
  @IsString()
  address: string = '';
}

export class ProvisionAdminDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(120)
  @Matches(/\S+\s+\S+/, { message: 'Enter each administrator’s first and last name.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter each administrator’s name.' })
  name!: string;

  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address for each administrator.' })
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  phone: string = '';

  @ApiPropertyOptional({ example: 'Proprietor' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(80)
  @IsString()
  position: string = '';

  @ApiProperty({ example: 'All branches' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Choose which branches each administrator manages.' })
  scope!: string;
}

export class ProvisionSchoolDto {
  @ApiProperty({ example: 'Lagoon View College' })
  @Transform(trim)
  @MaxLength(120)
  @IsString()
  @IsNotEmpty({ message: 'Enter the display name.' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(160)
  @IsString()
  legalName: string = '';

  @ApiProperty({ enum: OWNERSHIPS })
  @IsIn(OWNERSHIPS, { message: 'Choose who owns the school.' })
  ownership!: (typeof OWNERSHIPS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  registrationNumber: string = '';

  @ApiProperty()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid school email address.' })
  email!: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  @IsNotEmpty({ message: 'Enter the school’s phone number.' })
  phone!: string;

  @ApiProperty({ example: 'Lagos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Select a state.' })
  state!: string;

  @ApiProperty({ example: 'Eti-Osa' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Select an LGA.' })
  lga!: string;

  @ApiPropertyOptional({ example: '#1F6FEB' })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Pick a brand colour.' })
  brandColor: string = '';

  @ApiProperty({ enum: ACADEMIC_SECTIONS, isArray: true })
  @IsIn(ACADEMIC_SECTIONS, { each: true, message: 'Unknown academic section.' })
  @ArrayMinSize(1, { message: 'Choose at least one academic section.' })
  @IsArray()
  sections!: (typeof ACADEMIC_SECTIONS)[number][];

  @ApiProperty({ type: [ProvisionBranchDto] })
  @ValidateNested({ each: true })
  @Type(() => ProvisionBranchDto)
  @ArrayMaxSize(50)
  @ArrayMinSize(1, { message: 'Add at least one branch.' })
  @IsArray()
  branches!: ProvisionBranchDto[];

  @ApiProperty({ example: 'Growth' })
  @IsString()
  @IsNotEmpty({ message: 'Choose a plan.' })
  plan!: string;

  @ApiProperty({ example: '2027-01-04' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a start date.' })
  startDate!: string;

  @ApiProperty({ type: [ProvisionAdminDto] })
  @ValidateNested({ each: true })
  @Type(() => ProvisionAdminDto)
  @ArrayMaxSize(10)
  @ArrayMinSize(1, { message: 'Add at least one administrator.' })
  @IsArray()
  admins!: ProvisionAdminDto[];
}

export const EXTEND_PERIODS = ['1 month', '3 months', '6 months'] as const;
export const SUBSCRIPTION_ACTIONS = [
  'change_plan',
  'extend',
  'enter_grace',
  'restrict',
  'cancel',
  'reactivate',
] as const;
export type SubscriptionActionName = (typeof SUBSCRIPTION_ACTIONS)[number];

/** One body for every subscription action; which fields are required depends on `action`. */
export class SubscriptionActionDto {
  @ApiProperty({ enum: SUBSCRIPTION_ACTIONS })
  @IsIn(SUBSCRIPTION_ACTIONS, { message: 'Unknown subscription action.' })
  action!: SubscriptionActionName;

  @ApiPropertyOptional({ description: 'change_plan: the plan name' })
  @ValidateIf((o: SubscriptionActionDto) => o.action === 'change_plan')
  @IsString()
  @IsNotEmpty({ message: 'Choose a plan.' })
  plan?: string;

  @ApiPropertyOptional({ enum: EXTEND_PERIODS, description: 'extend' })
  @ValidateIf((o: SubscriptionActionDto) => o.action === 'extend')
  @IsIn(EXTEND_PERIODS, { message: 'Choose how long to extend by.' })
  period?: (typeof EXTEND_PERIODS)[number];

  @ApiPropertyOptional({ description: 'extend, restrict, cancel' })
  @ValidateIf((o: SubscriptionActionDto) => ['extend', 'restrict', 'cancel'].includes(o.action))
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Give a reason.' })
  reason?: string;
}
