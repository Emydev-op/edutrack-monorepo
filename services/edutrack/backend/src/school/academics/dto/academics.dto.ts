import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { COPY_AREAS, STRUCTURE_LABELS, TERM_EVENT_TYPES } from '../academic-format.js';

/*
 * Request bodies of the Academics routes. Shapes match School Admin's `SectionInput`,
 * `NewSessionPayload`, `TermInput`, `LevelInput` and `ArmInput`. Types are checked here; the
 * rules that read several fields (dates in order, duplicate names) run in the services with the
 * mock's wording.
 */

const PLACES = 'Places per arm must be between 1 and 100.';

/* ---------------- Sections ---------------- */

export class SectionInputDto {
  @ApiPropertyOptional({ description: 'Omit for a new section.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Junior Secondary' })
  @MaxLength(60, { message: 'Keep section names under 60 characters.' })
  @IsString({ message: 'Name every section.' })
  name!: string;

  @ApiProperty({ example: 'JSS', description: '2–5 capitals' })
  @IsString({ message: 'Give every section a 2–5 letter code.' })
  code!: string;

  @ApiPropertyOptional({ example: 'JSS 1–3 · Basic Education Certificate' })
  @IsOptional()
  @MaxLength(200, { message: 'Keep descriptions under 200 characters.' })
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Student Portal logins for this section. Omitted: kept as they are (new sections: on for ' +
      'JSS and SSS, off otherwise).',
  })
  @IsOptional()
  @IsBoolean({ message: 'Choose whether students in this section can sign in.' })
  studentLogins?: boolean;
}

export class SaveSectionsDto {
  @ApiProperty({ type: [SectionInputDto], description: 'Every section, in promotion order.' })
  @ValidateNested({ each: true })
  @Type(() => SectionInputDto)
  @IsArray({ message: 'Add at least one section.' })
  sections!: SectionInputDto[];
}

/* ---------------- Sessions and terms ---------------- */

export class NewSessionDto {
  @ApiProperty({ example: '2027/2028' })
  @IsString({ message: 'Name the session, e.g. 2027/2028.' })
  name!: string;

  @ApiProperty({ example: '2027-09-13' })
  @IsString({ message: 'Choose the start and end dates.' })
  start!: string;

  @ApiProperty({ example: '2028-07-21' })
  @IsString({ message: 'Choose the start and end dates.' })
  end!: string;

  @ApiProperty({ enum: STRUCTURE_LABELS, example: '3 terms' })
  @IsIn(STRUCTURE_LABELS, { message: 'Choose how the session is divided.' })
  structure!: string;

  @ApiProperty({ example: ['First Term', 'Second Term', 'Third Term'] })
  @IsString({ each: true, message: 'Name every term.' })
  @IsArray({ message: 'Use between 1 and 4 terms.' })
  termNames!: string[];

  @ApiPropertyOptional({
    enum: COPY_AREAS,
    isArray: true,
    description: 'What to copy from the current session. The calendar pattern is shifted.',
  })
  @IsOptional()
  @IsIn(COPY_AREAS, { each: true, message: 'Choose what to copy from the list.' })
  @IsArray()
  copy?: string[];
}

export class TermEventInputDto {
  @ApiPropertyOptional({ description: 'Empty for a new event.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ enum: TERM_EVENT_TYPES, example: 'midterm' })
  @IsIn(TERM_EVENT_TYPES, { message: 'Choose the event type.' })
  type!: (typeof TERM_EVENT_TYPES)[number];

  @ApiProperty({ example: 'Mid-term break' })
  @IsOptional()
  @IsString()
  name!: string;

  @ApiProperty({ example: '2026-10-29' })
  @IsOptional()
  @IsString()
  start!: string;

  @ApiProperty({ example: '2026-11-02' })
  @IsOptional()
  @IsString()
  end!: string;
}

export class TermInputDto {
  @ApiPropertyOptional({ description: 'Omit (or leave empty) for a new term.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'First Term' })
  @IsOptional()
  @IsString()
  name!: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsOptional()
  @IsString()
  start!: string;

  @ApiProperty({ example: '2026-12-18' })
  @IsOptional()
  @IsString()
  end!: string;

  @ApiProperty({ type: [TermEventInputDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TermEventInputDto)
  @IsArray()
  events: TermEventInputDto[] = [];
}

export class SaveTermsDto {
  @ApiProperty({ type: [TermInputDto] })
  @ValidateNested({ each: true })
  @Type(() => TermInputDto)
  @IsArray({ message: 'Use between 1 and 4 terms.' })
  terms!: TermInputDto[];
}

/* ---------------- Classes and arms ---------------- */

export class LevelInputDto {
  @ApiProperty({ description: 'An active branch.' })
  @IsString({ message: 'Choose an active branch.' })
  branchId!: string;

  @ApiProperty({ example: 'Junior Secondary', description: 'Section name' })
  @IsString({ message: 'Choose a section.' })
  section!: string;

  @ApiProperty({ example: 'JSS 1' })
  @IsOptional()
  @MaxLength(40, { message: 'Keep class level names under 40 characters.' })
  @IsString({ message: 'Name the class level, e.g. JSS 1.' })
  name!: string;

  @ApiProperty({ example: ['A', 'B'] })
  @IsString({ each: true, message: 'Arm names are short, e.g. A, B or Gold.' })
  @IsArray({ message: 'Add at least one arm, e.g. A.' })
  arms!: string[];

  @ApiProperty({ example: 35 })
  @Max(100, { message: PLACES })
  @Min(1, { message: PLACES })
  @IsInt({ message: PLACES })
  capacity!: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Insert after this level (its id); null puts it first; omit for last.',
  })
  @IsOptional()
  @IsString()
  after?: string | null;
}

export class RenameLevelDto {
  @ApiProperty({ example: 'JSS 1' })
  @MaxLength(40, { message: 'Keep class level names under 40 characters.' })
  @IsString({ message: 'Name the class level.' })
  name!: string;
}

export class MoveLevelDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'], { message: 'Move the level up or down.' })
  direction!: 'up' | 'down';
}

export class ArmInputDto {
  @ApiPropertyOptional({ example: 'C', description: 'Omit for the next free letter.' })
  @IsOptional()
  @IsString({ message: 'Arm names are short, e.g. A, B or Gold.' })
  arm?: string;

  @ApiProperty({ example: 35 })
  @Max(100, { message: PLACES })
  @Min(1, { message: PLACES })
  @IsInt({ message: PLACES })
  capacity!: number;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'A teacher (staff id).' })
  @IsOptional()
  @IsString({ message: 'Choose a teacher on your staff list.' })
  classTeacherId?: string | null;

  @ApiPropertyOptional({ example: 'Room J2B · Block C' })
  @IsOptional()
  @MaxLength(80, { message: 'Keep the room under 80 characters.' })
  @IsString()
  room?: string;
}

export class UpdateArmDto {
  @ApiPropertyOptional({ example: 'B' })
  @IsOptional()
  @IsString({ message: 'Arm names are short, e.g. A, B or Gold.' })
  arm?: string;

  @ApiPropertyOptional({ example: 35 })
  @ValidateIf((_, v) => v !== undefined)
  @Max(100, { message: PLACES })
  @Min(1, { message: PLACES })
  @IsInt({ message: PLACES })
  capacity?: number;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'null removes the teacher.' })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString({ message: 'Choose a teacher on your staff list.' })
  classTeacherId?: string | null;

  @ApiPropertyOptional({ example: 'Science Block S1' })
  @IsOptional()
  @MaxLength(80, { message: 'Keep the room under 80 characters.' })
  @IsString()
  room?: string;
}
