import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { trim } from '../../../platform/shared/params.js';

/** `GET /v1/guardians`: page, pageSize and a search over names, phone, email and children. */
export class GuardianQueryDto extends PaginationQueryDto {}

/** `POST /v1/guardians` (School Admin's `GuardianPayload`): a guardian for one or more children. */
export class GuardianPayloadDto {
  @ApiProperty({ example: 'Mrs. Ada Nwosu' })
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  @IsString({ message: 'Enter the guardian’s full name.' })
  name!: string;

  @ApiProperty({ example: '0803 555 0193' })
  @Transform(trim)
  @MaxLength(32, { message: 'Enter a Nigerian phone number, e.g. 0803 555 0193' })
  @IsString({ message: 'Enter a Nigerian phone number, e.g. 0803 555 0193' })
  phone!: string;

  @ApiPropertyOptional({ example: 'ada.nwosu@gmail.com', description: 'Optional; empty for none' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(254, { message: 'Enter a valid email.' })
  @IsString({ message: 'Enter a valid email.' })
  email?: string;

  @ApiProperty({
    example: 'Mother',
    description: 'Mother, Father, Guardian, Grandparent, Sponsor…',
  })
  @Transform(trim)
  @MaxLength(40, { message: 'Keep the relationship under 40 characters.' })
  @IsString({ message: 'Choose the relationship.' })
  @IsNotEmpty({ message: 'Choose the relationship.' })
  relationship!: string;

  @ApiProperty({ type: [String], description: 'The children (student ids)' })
  @ArrayMaxSize(20, { message: 'Choose up to 20 children.' })
  @IsString({ each: true, message: 'Choose at least one child.' })
  @IsArray({ message: 'Choose at least one child.' })
  studentIds!: string[];

  @ApiProperty({ example: true, description: 'Invoices and fee reminders go to them' })
  @IsBoolean({ message: 'Choose whether they pay the fees.' })
  paysFees!: boolean;

  @ApiProperty({
    example: false,
    description: 'Also invite them to the Parent Portal now (the school decides; never automatic).',
  })
  @IsBoolean({ message: 'Choose whether to invite them.' })
  invite!: boolean;
}

/** `POST /v1/guardians/merge`. */
export class MergeGuardiansDto {
  @ApiProperty({ description: 'The record to keep' })
  @IsString({ message: 'Choose two different guardian records.' })
  keepId!: string;

  @ApiProperty({ description: 'The duplicate, merged into the kept record' })
  @IsString({ message: 'Choose two different guardian records.' })
  mergeId!: string;
}

/**
 * `POST /v1/guardians/invite`: the listed guardians, or (no `ids`) every guardian without an
 * account, optionally only those with a child in one class or branch.
 */
export class InviteGuardiansDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Guardian ids; omit for everyone without an account',
  })
  @IsOptional()
  @ArrayMaxSize(1000, { message: 'Invite up to 1,000 guardians at a time.' })
  @IsString({ each: true, message: 'Choose the guardians to invite.' })
  @IsArray({ message: 'Choose the guardians to invite.' })
  ids?: string[];

  @ApiPropertyOptional({
    example: 'JSS 2B',
    description: 'Only guardians with a child in this class ("JSS 2B") or level ("JSS 2")',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  className?: string;

  @ApiPropertyOptional({ description: 'Only guardians with a child at this branch (id)' })
  @IsOptional()
  @IsUUID('all', { message: 'Choose a branch.' })
  branchId?: string;
}
