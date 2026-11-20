import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** `GET /v1/finance/invoices` filters (strings, as the query string carries them). */
export class InvoiceListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ description: 'Term id, or "all"' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) session?: string;
  @ApiPropertyOptional({ description: 'An invoice status, or "Open" (has a balance)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) level?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) page?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) pageSize?: string;
}

export class GenerateInvoicesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) termId?: string;
  @ApiPropertyOptional({ description: 'Branch id; omitted for every branch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchId?: string;
  @ApiPropertyOptional({ type: [String], description: 'Class level names' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  levels?: string[];
  @ApiPropertyOptional({ description: 'Issue straight away (else drafts)' })
  @IsOptional()
  @IsBoolean()
  issue?: boolean;
}

export class InvoiceIdsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  ids?: string[];
}

export class RemindDto extends InvoiceIdsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @ApiPropertyOptional({ description: 'Count only; nothing is sent' })
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}

export class LateFeesDto extends InvoiceIdsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branch?: string;
}

export class AddLineDto {
  @ApiPropertyOptional({ description: 'An optional fee item to add' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemId?: string;
  @ApiPropertyOptional({ description: 'An ad-hoc charge' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;
  @ApiPropertyOptional({ description: 'Naira' })
  @IsOptional()
  @IsNumber({}, { message: 'Enter the amount in naira.' })
  amount?: number;
}

export class RemoveLineQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ApplyDiscountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) discountId?: string;
  @ApiPropertyOptional({ description: 'Naira, for a custom concession' })
  @IsOptional()
  @IsNumber({}, { message: 'Enter the concession amount.' })
  amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ChangePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) planId?: string;
}

export class ApplyCreditDto {
  @ApiPropertyOptional({ description: 'Naira' })
  @IsOptional()
  @IsNumber({}, { message: 'Enter how much credit to apply.' })
  amount?: number;
}

export class CancelInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class FinanceStudentsQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @ApiPropertyOptional({ description: '"true": most owed first' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  owing?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) limit?: string;
}
