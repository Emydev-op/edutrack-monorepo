import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/*
 * Bodies and queries of Finance › Bank & cash accounts, transfers and statements. Validators only
 * check types; the service applies the screens' rules and wording.
 */

export class AccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: ['Bank', 'Cash'] }) @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bank?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) accountName?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() branchId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showToParents?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the opening balance in naira.' })
  openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() openingDate?: string;
}

export class LedgerQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pageSize?: string;
}

export class TransferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fromId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the amount moved.' })
  amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class StatementUploadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fileName?: string;
  @ApiPropertyOptional({ description: 'The CSV export as text' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  text?: string;
}

export class StatementLineDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() paymentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ignore?: boolean;
}

export class ConfirmStatementDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lineIds?: string[];
}
