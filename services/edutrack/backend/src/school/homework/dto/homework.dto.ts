import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** `POST /v1/uploads`: one file as a data URL (up to 25 MB). */
export class UploadDto {
  @ApiProperty({ example: 'algebra-worksheet.pdf' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'data:<type>;base64,… (PDF, Word, PowerPoint or image, ≤ 25 MB)' })
  @IsString()
  dataUrl!: string;
}

/** A file on a form: an upload's `id`, or one of the teacher's materials (`materialId`). */
const FILES = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'From POST /v1/uploads' },
      materialId: { type: 'string' },
      name: { type: 'string' },
    },
  },
} as const;

/** `POST /v1/assignments`, `PATCH /v1/assignments/:id`. */
export class AssignmentDto {
  @ApiPropertyOptional({ description: 'Class arm id' }) @IsOptional() @IsString() armId?: string;
  @ApiPropertyOptional({ example: 'MTH', description: 'Subject code' })
  @IsOptional()
  @IsString()
  subject?: string;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional({ maxLength: 4000 }) @IsOptional() @IsString() instructions?: string;
  @ApiPropertyOptional({ example: '2026-11-27T16:00', nullable: true, description: 'Lagos time' })
  @Allow()
  dueAt?: string | null;
  @ApiPropertyOptional({ example: 20, nullable: true, description: 'Whole number 1–100' })
  @Allow()
  maxScore?: number | string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowLate?: boolean;
  @ApiPropertyOptional({ ...FILES, description: 'Up to 5 files' })
  @IsOptional()
  @IsArray()
  attachments?: { id?: string; materialId?: string; name?: string }[];
  @ApiPropertyOptional({
    description: 'true publishes (or keeps it published); false saves a draft',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class GradeDto {
  @ApiPropertyOptional({ example: 16, description: 'Whole number from 0 to the max score' })
  @Allow()
  score?: unknown;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() feedback?: string;
}

export class BulkReturnDto {
  @ApiProperty({ type: [String], description: 'Submission ids' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ExcuseDto {
  @ApiProperty({ example: 'Sick: hospital letter seen' }) @IsOptional() @IsString() reason?: string;
}

/** `POST /v1/materials`. */
export class MaterialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() armId?: string;
  @ApiPropertyOptional({ example: 'MTH' }) @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional({ enum: ['PDF', 'Document', 'Presentation', 'Image', 'Video link'] })
  @IsOptional()
  @IsString()
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    properties: { id: { type: 'string', description: 'From POST /v1/uploads' } },
  })
  @Allow()
  file?: { id?: string; name?: string } | null;
  @ApiPropertyOptional({ nullable: true, example: 'https://youtu.be/…' })
  @Allow()
  link?: string | null;
}

/** `POST /v1/parent/children/:studentId/assignments/:id/submission`. */
export class GuardianSubmissionDto {
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() note?: string;
  @ApiProperty({ ...FILES, description: '1–5 files from POST /v1/uploads' })
  @IsArray()
  files!: { id?: string }[];
}
