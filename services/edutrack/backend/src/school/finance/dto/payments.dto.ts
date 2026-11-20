import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/*
 * Bodies and queries of Finance › Payments and refunds. Validators only check types; the
 * service applies the screens' rules and wording (as the School Admin mock).
 */

export class PaymentQuery {
  @ApiPropertyOptional({ enum: ['all', 'pending'] }) @IsOptional() @IsString() tab?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pageSize?: string;
}

export class RefundQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branch?: string;
}

export class AllocationDto {
  @ApiPropertyOptional() @IsString() invoiceId!: string;
  @ApiPropertyOptional()
  @IsNumber({}, { message: 'Allocations must be whole naira.' })
  amount!: number;
}

export class PaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() studentKey?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the amount received in naira.' })
  amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) payer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiPropertyOptional({ type: [AllocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() matched?: boolean;
}

export class IdsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

export class ReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RefundDto {
  @ApiPropertyOptional() @IsOptional() @IsString() studentKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentId?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Enter the refund amount.' })
  amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) payTo?: string;
}

export class ApproveRefundDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acknowledged?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() asProprietor?: boolean;
}

export class PayOutDto {
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;
}
