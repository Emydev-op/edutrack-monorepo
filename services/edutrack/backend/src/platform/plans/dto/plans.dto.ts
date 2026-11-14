import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../shared/params.js';

export const PRICING_MODELS = ['flat', 'per_student', 'custom'] as const;
export const BILLING_PERIODS = ['annual', 'term', 'month'] as const;
export const PLAN_STATUSES = ['Active', 'Draft', 'Archived'] as const;
export const SUPPORT_TIERS = ['Standard', 'Priority'] as const;

const MAX_NAIRA = 1_000_000_000;

export class PlanPricesDto {
  @ApiPropertyOptional({ description: 'Naira per year' })
  @IsOptional()
  @Min(0, { message: 'Prices can’t be negative.' })
  @IsNumber({}, { message: 'Enter the price as a number.' })
  annual?: number;

  @ApiPropertyOptional({ description: 'Naira per term' })
  @IsOptional()
  @Min(0, { message: 'Prices can’t be negative.' })
  @IsNumber({}, { message: 'Enter the price as a number.' })
  term?: number;

  @ApiPropertyOptional({ description: 'Naira per month' })
  @IsOptional()
  @Min(0, { message: 'Prices can’t be negative.' })
  @IsNumber({}, { message: 'Enter the price as a number.' })
  month?: number;
}

export class PlanPricingDto {
  @ApiProperty({ enum: PRICING_MODELS })
  @IsIn(PRICING_MODELS, { message: 'Choose how the plan is priced.' })
  model!: (typeof PRICING_MODELS)[number];

  @ApiProperty({ type: PlanPricesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanPricesDto)
  @IsObject()
  prices: PlanPricesDto = {};

  @ApiPropertyOptional({ description: 'Naira per enrolled student' })
  @IsOptional()
  @Min(0, { message: 'Prices can’t be negative.' })
  @IsNumber({}, { message: 'Enter the price per student as a number.' })
  perStudent?: number;

  @ApiPropertyOptional({ description: 'Per-student plans: the least a school pays in a term' })
  @IsOptional()
  @Min(0, { message: 'The minimum can’t be negative.' })
  @IsNumber({}, { message: 'Enter the minimum as a number.' })
  minimumPerTerm?: number;
}

const limit = (label: string) => [
  ValidateIf((_: unknown, v: unknown) => v !== null),
  Min(1, { message: `${label} must be at least 1, or unlimited.` }),
  IsInt({ message: `${label} must be at least 1, or unlimited.` }),
];
const apply =
  (decorators: PropertyDecorator[]): PropertyDecorator =>
  (target, key) =>
    decorators.forEach((d) => d(target, key));

export class PlanLimitsDto {
  @ApiProperty({ nullable: true, description: 'null = unlimited' })
  @apply(limit('Students'))
  students!: number | null;

  @ApiProperty({ nullable: true })
  @apply(limit('Branches'))
  branches!: number | null;

  @ApiProperty({ nullable: true })
  @apply(limit('Staff accounts'))
  users!: number | null;

  @ApiProperty({ nullable: true, description: 'GB' })
  @apply(limit('Storage'))
  storage!: number | null;
}

/** What platform staff edit on a plan. Prices are whole naira. */
export class PlanDefinitionDto {
  @ApiProperty({ example: 'Growth' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the plan name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Give the plan a name.' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the description under 500 characters.' })
  @IsString()
  description: string = '';

  @ApiProperty({ type: PlanPricingDto })
  @ValidateNested()
  @Type(() => PlanPricingDto)
  @IsObject({ message: 'Choose how the plan is priced.' })
  pricing!: PlanPricingDto;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Min(0, { message: 'Trial days can’t be negative.' })
  @IsInt({ message: 'Enter the trial length in whole days.' })
  trialDays: number = 0;

  @ApiPropertyOptional({ default: 0, description: 'Naira' })
  @IsOptional()
  @Min(0, { message: 'The setup fee can’t be negative.' })
  @IsNumber({}, { message: 'Enter the setup fee as a number.' })
  setupFee: number = 0;

  @ApiProperty({ type: PlanLimitsDto })
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  @IsObject({ message: 'Set the plan’s limits.' })
  limits!: PlanLimitsDto;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Min(0, { message: 'SMS credits can’t be negative.' })
  @IsInt({ message: 'Enter SMS credits as a whole number.' })
  smsCreditsPerTerm: number = 0;

  @ApiProperty({ type: [String], description: 'Module ids; core modules are always added' })
  @IsOptional()
  @IsString({ each: true })
  @IsArray()
  modules: string[] = [];

  @ApiPropertyOptional({ enum: SUPPORT_TIERS, default: 'Standard' })
  @IsOptional()
  @IsIn(SUPPORT_TIERS, { message: 'Choose Standard or Priority support.' })
  support: (typeof SUPPORT_TIERS)[number] = 'Standard';
}

export class CreatePlanDto extends PlanDefinitionDto {
  @ApiProperty({ enum: ['Active', 'Draft'] })
  @IsIn(['Active', 'Draft'], { message: 'Publish the plan or save it as a draft.' })
  status!: 'Active' | 'Draft';
}

export class PlanStatusDto {
  @ApiProperty({ enum: ['Active', 'Archived'] })
  @IsIn(['Active', 'Archived'], { message: 'A plan can only be published, restored or archived.' })
  status!: 'Active' | 'Archived';
}

export { MAX_NAIRA };
