import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/*
 * Finance › Fees bodies and queries. Validators only check types; the service does the screens'
 * checks with their wording (as the School Admin mock).
 */

export class FeesQuery {
  @ApiPropertyOptional({ description: 'Term id (or name with `session`)' })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({ description: 'Branch id or name' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class StartFeesDto {
  @ApiPropertyOptional({ enum: ['suggested', 'tuition'] })
  @IsOptional()
  @IsString()
  mode?: string;
}

export class FeeItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Tuition' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Every term' })
  @IsOptional()
  @IsString()
  charged?: string;

  @ApiPropertyOptional({ example: 'Compulsory' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class StructureSaveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'level name → fee item id → naira (null = blank / not offered)',
  })
  @IsOptional()
  @IsObject()
  amounts?: Record<string, Record<string, number | null>>;
}

export class StructurePublishDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class StructureCopyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromTermId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toTermId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromBranchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;
}

export class DiscountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: ['Sibling', 'Staff child', 'Scholarship', 'Custom'] })
  @IsOptional()
  @IsString()
  basis?: string;

  @ApiPropertyOptional({ enum: ['Percentage', 'Fixed amount'] })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ description: 'Percent or naira' })
  @IsOptional()
  @IsNumber({}, { message: 'Enter a value above 0.' })
  value?: number;

  @ApiPropertyOptional({ enum: ['Tuition only', 'All compulsory items'] })
  @IsOptional()
  @IsString()
  appliesTo?: string;

  @ApiPropertyOptional({ enum: [2, 3] })
  @IsOptional()
  @IsNumber()
  fromChild?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsApproval?: boolean;

  @ApiPropertyOptional({ enum: ['Active', 'Inactive'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class PlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: [Number], description: 'Percent per installment, total 100' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true, message: 'Each part must be a whole percentage above 0.' })
  split?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'Days after term start' })
  @IsOptional()
  @IsArray()
  @IsNumber(
    {},
    { each: true, message: 'Give one due day (days after the term starts) for each part.' },
  )
  offsets?: number[];
}

export class LateFeeDto {
  @ApiPropertyOptional({ enum: ['None', 'Fixed amount', 'Percentage'] })
  @IsOptional()
  @IsIn(['None', 'Fixed amount', 'Percentage'], { message: 'Choose a late fee.' })
  kind?: 'None' | 'Fixed amount' | 'Percentage';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the late fee.' })
  value?: number;
}

export class FinanceSettingsDto {
  @ApiPropertyOptional({ description: 'term id → due date (YYYY-MM-DD)' })
  @IsOptional()
  @IsObject()
  dueDates?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowPartial?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoSibling?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verifyTransfers?: boolean;

  @ApiPropertyOptional({ type: LateFeeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LateFeeDto)
  lateFee?: LateFeeDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptPrefix?: string;

  @ApiPropertyOptional({ enum: ['Admission number', 'Invoice number'] })
  @IsOptional()
  @IsString()
  transferReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the Bursar’s approval limit.' })
  expenseLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the Principal’s refund limit.' })
  refundLimit?: number;
}
