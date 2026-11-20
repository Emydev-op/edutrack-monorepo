import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/* ---------------- Teacher Workspace ---------------- */

export class SaveRowDto {
  @ApiProperty({ description: 'Student id' })
  @IsString()
  studentId!: string;

  @ApiProperty({
    description:
      'One per scheme component, in order: a number 0–max (≤ 1 decimal), ABS, EXM or null',
    example: [15, 'ABS', null],
    type: 'array',
    items: {},
  })
  @IsArray({ message: 'Send the scores for each student.' })
  scores!: unknown[];

  @ApiPropertyOptional({
    description: 'The teacher’s remark for the student (up to 300 characters)',
  })
  @IsOptional()
  @IsString()
  remark?: string;
}

/** `PUT /v1/results/:sheetId/scores`. */
export class SaveScoresDto {
  @ApiProperty({ type: [SaveRowDto] })
  @ValidateNested({ each: true })
  @Type(() => SaveRowDto)
  @IsArray({ message: 'Send the rows to save.' })
  rows!: SaveRowDto[];

  @ApiPropertyOptional({
    description: 'The sheet’s revision when it was opened: a stale save is refused (409)',
  })
  @IsOptional()
  @IsInt()
  revision?: number;
}

export class ReviewReturnDto {
  @ApiPropertyOptional({ description: 'What to fix (10 characters or more)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class EvidenceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() size?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional({ description: 'data:application/pdf;base64,… (PDF, PNG or JPG, ≤ 10 MB)' })
  @IsOptional()
  @IsString()
  dataUrl?: string;
}

/** `POST /v1/corrections`. */
export class CorrectionRequestDto {
  @ApiProperty() @IsString() sheetId!: string;
  @ApiProperty() @IsString() studentId!: string;
  @ApiProperty({ example: 'EXAM' }) @IsString() componentKey!: string;
  @ApiProperty({ example: 52 }) @Allow() proposed!: unknown;
  @ApiProperty({ description: '15 characters or more' }) @IsString() reason!: string;

  @ApiPropertyOptional({ type: EvidenceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceDto)
  evidence?: EvidenceDto | null;
}

/** `PUT /v1/class-teacher/report-cards/:studentId`. */
export class ReportCardRemarkDto {
  @ApiProperty({ description: '20–400 characters' })
  @Allow()
  remark!: unknown;

  @ApiProperty({
    description: 'Each conduct trait rated 1–5',
    example: {
      Punctuality: 5,
      Neatness: 4,
      Attentiveness: 4,
      'Relationship with others': 5,
      Leadership: 3,
    },
  })
  @IsOptional()
  @IsObject()
  ratings?: Record<string, unknown>;
}

/* ---------------- School Admin ---------------- */

export class SheetDecisionDto {
  @ApiPropertyOptional({ description: 'Term id; the current term when omitted' })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional({ description: 'Return: what the teacher should fix' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReopenEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() term?: string;

  @ApiProperty({ description: 'Days to keep the sheet open for entry (1–30)', example: 3 })
  @Type(() => Number)
  @IsInt({ message: 'Choose how many days to reopen entry for.' })
  @Min(1, { message: 'Reopen entry for at least 1 day.' })
  @Max(30, { message: 'Reopen entry for at most 30 days.' })
  days!: number;
}

export class PublishDto {
  @ApiPropertyOptional() @IsOptional() @IsString() term?: string;

  @ApiPropertyOptional({ description: 'The absent and exempt flags were reviewed' })
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}

export class HoldReportCardDto {
  @ApiPropertyOptional() @IsOptional() @IsString() term?: string;

  @ApiProperty({ description: 'Why the report card is withheld (5–300 characters)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class TermBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() term?: string;
}

export class CorrectionDecisionDto {
  @ApiPropertyOptional({ description: 'Required to reject: why the change isn’t approved' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
