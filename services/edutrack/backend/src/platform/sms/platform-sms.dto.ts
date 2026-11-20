import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../shared/params.js';

export class SmsTopUpDto {
  @ApiProperty({ minimum: 1, maximum: 1_000_000, description: 'SMS units to add' })
  @Type(() => Number)
  @IsInt({ message: 'Enter a whole number of units.' })
  @Min(1, { message: 'Add at least 1 unit.' })
  @Max(1_000_000, { message: 'Add at most 1,000,000 units at a time.' })
  units!: number;

  @ApiPropertyOptional({ description: 'Payment or invoice reference', example: 'PAY-2026-0418' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'Keep the reference under 60 characters.' })
  reference?: string;

  @ApiProperty({ description: 'Why the units were added', example: 'Paid for 5,000 units' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Add a note about the top-up.' })
  @MaxLength(300, { message: 'Keep the note under 300 characters.' })
  note!: string;
}

export class SenderIdDecisionDto {
  @ApiPropertyOptional({ description: 'Required when rejecting: what the school should change' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: 'Keep the note under 300 characters.' })
  note?: string;
}

export class SenderIdQueueQuery {
  @ApiPropertyOptional({ enum: ['pending', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'all'], { message: 'Unknown filter.' })
  status?: 'pending' | 'all';
}
