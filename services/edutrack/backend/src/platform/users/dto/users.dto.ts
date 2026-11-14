import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { lower, trim } from '../../shared/params.js';
import { STAFF_STATUS_LABEL } from '../../shared/staff.js';

const STATUS_LABELS = Object.values(STAFF_STATUS_LABEL);
export const CREATED_WINDOWS = ['Last 30 days', 'Last 12 months'] as const;
export const ACTIVE_WINDOWS = ['Today', 'Last 7 days', 'Over 30 days ago'] as const;

export class UserListQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'invitations'] })
  @IsOptional()
  @IsIn(['all', 'invitations'])
  view?: 'all' | 'invitations';

  @ApiPropertyOptional({ description: 'Role name, e.g. Support Agent' })
  @IsOptional()
  @MaxLength(60)
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: STATUS_LABELS })
  @IsOptional()
  @IsIn(STATUS_LABELS, { message: 'Unknown status.' })
  status?: string;

  @ApiPropertyOptional({ enum: CREATED_WINDOWS })
  @IsOptional()
  @IsIn(CREATED_WINDOWS)
  created?: (typeof CREATED_WINDOWS)[number];

  @ApiPropertyOptional({ enum: ACTIVE_WINDOWS })
  @IsOptional()
  @IsIn(ACTIVE_WINDOWS)
  lastActive?: (typeof ACTIVE_WINDOWS)[number];
}

/** Invite and edit share one form. */
export class UserDetailsDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the first name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter a first name.' })
  firstName!: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the last name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter a last name.' })
  lastName!: string;

  @ApiProperty()
  @Transform(lower)
  @MaxLength(254)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @IsNotEmpty({ message: 'Enter an email address.' })
  email!: string;

  @ApiPropertyOptional({ example: '0803 412 7781', description: 'Empty for none' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Role key (admin, ops…) or id' })
  @MaxLength(64)
  @IsString()
  @IsNotEmpty({ message: 'Choose a role.' })
  roleId!: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  reason?: string;
}

export class CreateRoleDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Give the role a name.' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the description under 200 characters.' })
  @IsString()
  description?: string;

  @ApiProperty({ example: { Schools: ['View'], Support: ['View', 'Edit'] } })
  @IsObject({ message: 'Choose the role’s permissions.' })
  permissions!: Record<string, unknown>;
}
