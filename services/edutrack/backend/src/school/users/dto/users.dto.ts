import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { lower, trim } from '../../../platform/shared/params.js';
import { ROLE_SCOPE_LABELS } from '../access.js';

const SCOPES = ['School', 'Branch'] as const;

/** Roles and branch access, shared by the invite and "Edit access" forms. */
export class AccessDto {
  @ApiProperty({ type: [String], example: ['Teacher'], description: 'Role names' })
  @MaxLength(60, { each: true })
  @IsString({ each: true, message: 'One of those roles doesn’t exist.' })
  @ArrayMaxSize(20)
  @IsArray({ message: 'Choose at least one role.' })
  roles!: string[];

  @ApiProperty({ enum: SCOPES, example: 'Branch' })
  @IsIn(SCOPES, { message: 'Choose whole school or specific branches.' })
  scope!: (typeof SCOPES)[number];

  @ApiProperty({ type: [String], example: ['Main Campus'], description: 'Branch names' })
  @MaxLength(120, { each: true })
  @IsString({ each: true, message: 'One of those branches doesn’t exist.' })
  @ArrayMaxSize(50)
  @IsArray({ message: 'Choose at least one branch.' })
  branches!: string[];
}

export class InviteUserDto extends AccessDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Staff record to link; their name and position are used.',
  })
  @IsOptional()
  @IsString({ message: 'Choose the staff member.' })
  staffId!: string | null;

  @ApiPropertyOptional({ example: 'Mrs. Ada Obi', description: 'Needed without a staff record' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  @IsString()
  name?: string;

  @ApiProperty({ example: 'ada.obi@greenfield.edu.ng' })
  @Transform(lower)
  @MaxLength(254, { message: 'Enter a valid email address.' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @IsNotEmpty({ message: 'Enter a valid email address.' })
  email!: string;
}

export class UserActionDto {
  @ApiPropertyOptional({ description: 'Required to suspend', example: 'On leave until January' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  reason?: string;
}

export class RoleDto {
  @ApiProperty({ example: 'Exams Officer' })
  @Transform(trim)
  @MaxLength(60, { message: 'Keep the role name under 60 characters.' })
  @IsString({ message: 'Name the role.' })
  @IsNotEmpty({ message: 'Name the role.' })
  name!: string;

  @ApiProperty({ enum: ROLE_SCOPE_LABELS, example: 'Section' })
  @IsIn(ROLE_SCOPE_LABELS, { message: 'Choose a default scope.' })
  scope!: string;

  @ApiPropertyOptional({ example: 'Assessment setup and result completion tracking' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(300, { message: 'Keep the description under 300 characters.' })
  @IsString()
  description?: string;

  @ApiProperty({
    example: { academics: ['view', 'configure'], results: ['view', 'review'] },
    description: 'Module key → allowed action keys. Unknown keys are dropped.',
  })
  @IsObject({ message: 'Give the role at least one permission.' })
  permissions!: Record<string, string[]>;
}
