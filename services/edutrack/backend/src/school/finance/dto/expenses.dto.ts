import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/*
 * Finance › Expenses and Vendors. Loose shapes: the service checks each field with the screens'
 * wording (as the School Admin mock does), so these only whitelist what the screens send.
 */

export class ExpenseQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: ['Draft', 'Submitted', 'Approved', 'Paid', 'Rejected'] })
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
  @ApiPropertyOptional({ description: 'Vendor id' }) @IsOptional() @IsString() vendor?: string;
  @ApiPropertyOptional({ description: 'Branch id or name' })
  @IsOptional()
  @IsString()
  branch?: string;
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pageSize?: string;
}

export class AttachmentDto {
  @ApiPropertyOptional() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(40) size!: string;
}

export class ExpenseDto {
  @ApiPropertyOptional({ example: '2026-11-18' }) @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional({ example: 'Maintenance' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() vendorId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional({ description: 'Whole naira' }) @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional({ example: 'Bank transfer' }) @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ type: AttachmentDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto | null;
  @ApiPropertyOptional({ description: 'Submit for approval now' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class ReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class PayExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional({ example: '2026-11-19' }) @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class CategoryDto {
  @ApiPropertyOptional({ example: 'Generator repairs' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}

export class VendorQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: ['Active', 'Inactive'] }) @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
}

export class VendorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) bank?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) accountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
