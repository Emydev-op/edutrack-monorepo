import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { trim } from '../../shared/params.js';
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../support-desk.js';

const CATEGORIES = Object.values(CATEGORY_LABEL);
const PRIORITIES = Object.values(PRIORITY_LABEL);
const STATUSES = Object.values(STATUS_LABEL);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ISSUE_VIEWS = [
  'open',
  'unassigned',
  'mine',
  'overdue',
  'waiting',
  'escalated',
  'resolved',
  'closed',
  'all',
] as const;
export type IssueView = (typeof ISSUE_VIEWS)[number];

export class IssueListQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ISSUE_VIEWS, default: 'open' })
  @IsOptional()
  @IsIn(ISSUE_VIEWS, { message: 'Unknown view.' })
  view?: IssueView;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES, { message: 'Unknown priority.' })
  priority?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES, { message: 'Unknown category.' })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'Unknown school.' })
  schoolId?: string;

  @ApiPropertyOptional({ description: 'The owner’s full name, or Unassigned' })
  @IsOptional()
  @MaxLength(130)
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Created on or after (Lagos)' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'Use a YYYY-MM-DD date.' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Created on or before (Lagos)' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'Use a YYYY-MM-DD date.' })
  dateTo?: string;
}

/** A ticket raised by staff on a school's behalf. */
export class CreateIssueDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Choose a school.' })
  schoolId!: string;

  @ApiProperty({ example: 'Mrs. Ifeoma Briggs · School Admin' })
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the requester under 120 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Say who asked for help.' })
  requester!: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the subject under 120 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Add a subject.' })
  subject!: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(5000, { message: 'Keep the description under 5,000 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Describe the issue.' })
  description!: string;

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES, { message: 'Choose a category.' })
  category!: string;

  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES, { message: 'Choose a priority.' })
  priority!: string;

  @ApiPropertyOptional({ description: 'Agent (staff user) id, or null', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'Choose who should own the ticket.' })
  assignee?: string | null;

  @ApiPropertyOptional({
    description: 'One PNG, JPEG or PDF as a data URL (10 MB at most), or null',
    nullable: true,
  })
  @IsOptional()
  @MaxLength(14_000_000, { message: 'The attachment is larger than 10 MB.' })
  @IsString()
  attachment?: string | null;

  @ApiPropertyOptional({ description: 'The attachment’s file name' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(200)
  @IsString()
  attachmentName?: string;
}

/** Assignment, priority and category changes. `reason` is required when reassigning. */
export class UpdateIssueDto {
  @ApiPropertyOptional({ description: 'Agent (staff user) id' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all', { message: 'Choose who should own the ticket.' })
  assignee?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES, { message: 'Unknown priority.' })
  priority?: string;

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES, { message: 'Unknown category.' })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  reason?: string;
}

export class IssueMessageDto {
  @ApiProperty({ enum: ['agent', 'note'] })
  @IsIn(['agent', 'note'], { message: 'Choose a reply or an internal note.' })
  kind!: 'agent' | 'note';

  @ApiProperty()
  @Transform(trim)
  @MaxLength(5000, { message: 'Keep the message under 5,000 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Write something first.' })
  text!: string;
}

export class IssueTransitionDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES, { message: 'Unknown status.' })
  to!: string;

  @ApiPropertyOptional({ description: 'The message, reason or resolution summary' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(5000, { message: 'Keep the note under 5,000 characters.' })
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'Resolution type, hold reason, escalation team or close reason',
  })
  @IsOptional()
  @MaxLength(60)
  @IsString()
  option?: string;
}
