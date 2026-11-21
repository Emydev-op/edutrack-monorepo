import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** A note's file: an upload's `id` (from `POST /v1/uploads`), or null for none. */
const ATTACHMENT = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', description: 'From POST /v1/uploads' },
    name: { type: 'string' },
    type: { type: 'string' },
    bytes: { type: 'number' },
  },
} as const;

/** `PUT /v1/lesson-notes/:noteId`: edit a Draft or Returned note. */
export class LessonNoteDto {
  @ApiPropertyOptional({ example: 'Simultaneous equations', description: '3–120 characters' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Up to 5, each under 200 characters; at least one to submit',
  })
  @IsOptional()
  @IsArray()
  objectives?: unknown[];

  @ApiPropertyOptional({ description: 'The lesson summary: 50–5,000 characters to submit' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ ...ATTACHMENT, description: 'One file up to 10 MB, or null' })
  @Allow()
  attachment?: { id?: string; name?: string; type?: string; bytes?: number } | null;

  @ApiPropertyOptional({ description: 'The scheme-of-work topic (up to 120 characters)' })
  @IsOptional()
  @IsString()
  schemeTopic?: string;

  @ApiPropertyOptional({ description: 'true saves and sends it for review' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

/** `POST /v1/lesson-notes`: a new note for one of my subjects and class levels. */
export class NewLessonNoteDto extends LessonNoteDto {
  @ApiPropertyOptional({ example: 'MTH', description: 'Subject code' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'JSS 2', description: 'Class level name' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ example: 11, description: 'Week of the term, from 1' })
  @Allow()
  week?: unknown;
}

/** `POST /v1/reviews/notes/:noteId/return`. */
export class NoteReturnDto {
  @ApiPropertyOptional({ description: 'What to change (10 characters or more)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** `POST /v1/assessments`. */
export class ScheduleAssessmentDto {
  @ApiPropertyOptional({ description: 'Class arm id' }) @IsOptional() @IsString() armId?: string;
  @ApiPropertyOptional({ example: 'MTH', description: 'Subject code' })
  @IsOptional()
  @IsString()
  subject?: string;
  @ApiPropertyOptional({ example: 'CA1', description: 'The scheme component’s key' })
  @IsOptional()
  @IsString()
  componentKey?: string;
  @ApiProperty({ example: '2026-11-25', description: 'A school day in the term, today or later' })
  @Allow()
  date?: unknown;
  @ApiPropertyOptional({ description: '3–300 characters' })
  @IsOptional()
  @IsString()
  topics?: string;
  @ApiPropertyOptional({ description: 'Up to 1,000 characters' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

/** `PATCH /v1/assessments/:assessmentId`: move it, or change its topics and instructions. */
export class RescheduleAssessmentDto {
  @ApiPropertyOptional({ example: '2026-11-26' }) @Allow() date?: unknown;
  @ApiPropertyOptional() @IsOptional() @IsString() topics?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instructions?: string;
}
