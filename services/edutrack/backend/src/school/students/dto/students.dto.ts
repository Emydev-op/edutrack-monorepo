import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { trim } from '../../../platform/shared/params.js';

const STATUSES = ['', 'Active', 'Incomplete profile', 'Transferred', 'Withdrawn', 'Graduated'];
const GENDERS = ['', 'Female', 'Male'];
const KINDS = ['Transfer', 'Withdrawal', 'Branch'] as const;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `GET /v1/students`: paging, search (name, admission number, guardian) and the filters. */
export class StudentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES, { message: 'Unknown student status.' })
  status?: string;

  @ApiPropertyOptional({ example: 'JSS 2', description: 'Class prefix: "JSS 2" or "JSS 2B"' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(40)
  @IsString()
  className?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS, { message: 'Choose Female or Male.' })
  gender?: string;

  @ApiPropertyOptional({
    example: 'Main Campus',
    description: 'The header’s branch (its name); left out or "All branches" for every branch',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(120)
  @IsString()
  branch?: string;
}

/** `GET /v1/enrollment/options`. */
export class EnrollmentOptionsQueryDto {
  @ApiPropertyOptional({
    description: 'Branch id; defaults to the first active branch (by when it was added)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branch?: string;
}

/**
 * `POST /v1/students/:id/transfer`. `Transfer` and `Withdrawal` record the student leaving (as the
 * mock does); `Branch` moves them to another of the school's branches and keeps them on the roll.
 */
export class TransferStudentDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS, { message: 'Choose transfer or withdrawal.' })
  kind!: (typeof KINDS)[number];

  @ApiPropertyOptional({ example: '2026-11-14', description: 'Effective date (exits)' })
  @ValidateIf((o: TransferStudentDto) => o.kind !== 'Branch')
  @Matches(ISO_DAY, { message: 'Choose the effective date.' })
  @IsString({ message: 'Choose the effective date.' })
  @IsNotEmpty({ message: 'Choose the effective date.' })
  date: string = '';

  @ApiPropertyOptional({ example: 'Change of school' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the reason under 200 characters.' })
  @IsString()
  reason: string = '';

  @ApiPropertyOptional({ example: 'Loyola Jesuit College', description: 'Required for transfers' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(200, { message: 'Keep the school name under 200 characters.' })
  @IsString()
  destination: string = '';

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(1000, { message: 'Keep the notes under 1,000 characters.' })
  @IsString()
  notes: string = '';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'transfer-letter.pdf',
    description:
      'The transfer letter: a data URL (PDF, JPG or PNG, 5 MB) to keep the file, or its file ' +
      'name. Required for transfers.',
  })
  @IsOptional()
  @MaxLength(7_500_000, { message: 'The file is larger than 5 MB.' })
  @IsString()
  document: string | null = null;

  @ApiPropertyOptional({ description: 'Branch transfers: the branch id to move to' })
  @ValidateIf((o: TransferStudentDto) => o.kind === 'Branch')
  @IsString({ message: 'Choose the branch to move to.' })
  @IsNotEmpty({ message: 'Choose the branch to move to.' })
  branchId?: string;

  @ApiPropertyOptional({
    example: 'A',
    description: 'Branch transfers: the arm at the new branch (empty to place them later)',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(40)
  @IsString()
  arm?: string;
}

/** `POST /v1/students/assign-arm`. */
export class AssignArmDto {
  @ApiProperty({ type: [String] })
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsArray({ message: 'Choose at least one student.' })
  studentIds!: string[];

  @ApiProperty({ example: 'A', description: 'The arm of the students’ class level' })
  @Transform(trim)
  @MaxLength(40)
  @IsString({ message: 'Choose an arm.' })
  @IsNotEmpty({ message: 'Choose an arm.' })
  arm!: string;
}

/** `POST /v1/enrollments`. */
export class EnrollDto {
  @ApiProperty({ example: 'JSS 1' })
  @Transform(trim)
  @MaxLength(60)
  @IsString({ message: 'Choose a class arm.' })
  @IsNotEmpty({ message: 'Choose a class arm.' })
  level!: string;

  @ApiProperty({ example: 'A' })
  @Transform(trim)
  @MaxLength(40)
  @IsString({ message: 'Choose a class arm.' })
  @IsNotEmpty({ message: 'Choose a class arm.' })
  arm!: string;

  @ApiProperty({ type: [String] })
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsArray({ message: 'Choose at least one student.' })
  studentIds!: string[];
}
