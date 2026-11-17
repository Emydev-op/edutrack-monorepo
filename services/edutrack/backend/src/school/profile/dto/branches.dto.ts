import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** POST /branches and PATCH /branches/:id (the whole form, as School Admin sends it). */
export class BranchDto {
  @ApiProperty({ example: 'Lekki Campus' })
  @Transform(trim)
  @MaxLength(80, { message: 'Keep the name under 80 characters.' })
  @MinLength(3, { message: 'Use at least 3 characters for the name.' })
  @IsString({ message: 'Enter a branch name.' })
  @IsNotEmpty({ message: 'Enter a branch name.' })
  name!: string;

  @ApiProperty({ example: 'GFA-LK', description: 'Used on admission numbers and receipts.' })
  @Transform(upper)
  @MaxLength(12)
  @IsString()
  code!: string;

  @ApiProperty({ example: '7 Admiralty Way, Lekki Phase 1' })
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the address under 200 characters.' })
  @IsString({ message: 'Enter the street address.' })
  @IsNotEmpty({ message: 'Enter the street address.' })
  street!: string;

  @ApiProperty({ example: 'Lekki' })
  @Transform(trim)
  @MaxLength(80, { message: 'Keep the town under 80 characters.' })
  @IsString({ message: 'Enter the town or city.' })
  @IsNotEmpty({ message: 'Enter the town or city.' })
  city!: string;

  @ApiPropertyOptional({ example: 'Eti Osa' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(80)
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(40)
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '0803 555 0150' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(20, { message: 'Enter a Nigerian phone number.' })
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'lekki@greenfieldacademy.ng' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(120, { message: 'Enter a valid email.' })
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Staff id of the head of campus.',
  })
  @IsOptional()
  @IsString({ message: 'Choose a current member of staff as head of campus.' })
  headId?: string | null;

  @ApiProperty({ type: [String], example: ['Nursery', 'Primary'] })
  @ArrayMaxSize(20)
  @IsString({ each: true, message: 'Choose at least one section.' })
  @IsArray({ message: 'Choose at least one section.' })
  sections!: string[];

  @ApiPropertyOptional({ description: 'The branch keeps its own store.' })
  @IsOptional()
  @IsBoolean()
  hasStore?: boolean;

  @ApiPropertyOptional({
    description: 'Give the head Branch Admin access for this branch when they don’t have it.',
  })
  @IsOptional()
  @IsBoolean()
  grantBranchAdmin?: boolean;
}

export class DeactivateBranchDto {
  @ApiProperty({ example: 'Campus closed for renovation' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString({ message: 'Give a reason for deactivating.' })
  reason?: string;
}

/** Reactivate takes no input; School Admin sends `{ reason: undefined }`. */
export class ReactivateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
