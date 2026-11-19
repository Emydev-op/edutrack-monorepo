import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CATEGORY_LABEL } from '../curriculum-defaults.js';

/*
 * Request bodies of the Phase 3a Academics routes (subjects and curriculum, teacher assignments,
 * timetable, assessment). Shapes match School Admin's `SubjectInput`, `ElectiveGroup`,
 * `AssignmentInput`, the timetable grid and `AssessmentConfig`. Types are checked here; rules
 * that read several fields run in the services with the mock's wording.
 */

/* ---------------- Subjects & curriculum ---------------- */

export class SubjectInputDto {
  @ApiProperty({
    example: 'MTH',
    description: '2–4 capitals (a digit may follow). Fixed once created.',
  })
  @MaxLength(5)
  @IsString({ message: 'Use 2–4 capitals for the code, e.g. MTH.' })
  code!: string;

  @ApiProperty({ example: 'Mathematics' })
  @MaxLength(80, { message: 'Keep subject names under 80 characters.' })
  @IsString({ message: 'Name the subject.' })
  name!: string;

  @ApiProperty({ enum: Object.values(CATEGORY_LABEL) })
  @IsIn(Object.values(CATEGORY_LABEL), { message: 'Choose a category.' })
  category!: string;

  @ApiPropertyOptional({ enum: ['Active', 'Inactive'] })
  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  @ApiProperty({ example: 5, description: 'Default lessons per week, 1–10' })
  @IsInt({ message: 'Lessons per week must be between 1 and 10.' })
  periods!: number;

  @ApiPropertyOptional({
    example: 'Junior Secondary',
    nullable: true,
    description: 'The section it belongs to (its name). Empty or null: shared by every section.',
  })
  @IsOptional()
  @MaxLength(80)
  @IsString()
  section?: string | null;
}

export class ElectiveGroupDto {
  @ApiPropertyOptional({ description: 'Omit (or send a new id) for a new group.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Religious Studies' })
  @MaxLength(80)
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Junior Secondary', description: 'Section name' })
  @IsString()
  section!: string;

  @ApiProperty({ type: [String], example: ['CRS', 'IRS'], description: 'Subject codes' })
  @IsString({ each: true })
  @IsArray()
  subjects!: string[];

  @ApiProperty({ example: 1 })
  @IsInt()
  min!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  max!: number;

  @ApiPropertyOptional({ example: 'Requires Academic Head approval' })
  @IsOptional()
  @MaxLength(200)
  @IsString()
  note?: string;
}

export class SaveCurriculumDto {
  @ApiProperty({
    type: Object,
    description: 'section name → level name → subject code → "C" (compulsory) or "E" (elective)',
    example: { 'Junior Secondary': { 'JSS 1': { MTH: 'C', FRE: 'E' } } },
  })
  @IsObject()
  curriculum!: Record<string, Record<string, Record<string, 'C' | 'E'>>>;

  @ApiProperty({ type: [ElectiveGroupDto] })
  @ValidateNested({ each: true })
  @Type(() => ElectiveGroupDto)
  @IsArray()
  groups!: ElectiveGroupDto[];

  @ApiPropertyOptional({
    type: Object,
    description:
      'Lessons per week where a level differs from the subject’s default: section → level → code → 1–10',
    example: { Primary: { 'Primary 1': { MTH: 6 } } },
  })
  @IsOptional()
  @IsObject()
  periods?: Record<string, Record<string, Record<string, number>>>;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Subjects only some arms take: section → level → code → arm id → lessons per week ' +
      '(null: the level’s). A subject not listed here is taken by every arm.',
    example: { 'Senior Secondary': { 'SS 1': { CHE: { '<armId>': null } } } },
  })
  @IsOptional()
  @IsObject()
  arms?: Record<string, Record<string, Record<string, Record<string, number | null>>>>;
}

/* ---------------- Teacher assignments ---------------- */

export class AssignmentInputDto {
  @ApiProperty({ description: 'Staff id' })
  @IsString({ message: 'Choose a teacher.' })
  teacherId!: string;

  @ApiProperty({ example: 'MTH', description: 'Subject code' })
  @IsString({ message: 'Choose a subject.' })
  subject!: string;

  @ApiProperty({ description: 'Class arm id' })
  @IsString({ message: 'Choose a class.' })
  armId!: string;

  @ApiPropertyOptional({ enum: ['Subject teacher', 'Temporary', 'Part-time'] })
  @IsOptional()
  @IsIn(['Subject teacher', 'Temporary', 'Part-time'], { message: 'Choose the assignment type.' })
  type?: string;

  @ApiPropertyOptional({
    enum: ['Lead', 'Co-teacher'],
    default: 'Lead',
    description:
      'Lead replaces the class’s lead teacher for the subject; a co-teacher joins them (both see ' +
      'the class and enter scores; the lead submits results).',
  })
  @IsOptional()
  @IsIn(['Lead', 'Co-teacher'], { message: 'Choose lead or co-teacher.' })
  role?: 'Lead' | 'Co-teacher';
}

/* ---------------- Timetable ---------------- */

export class TimetableRefDto {
  @ApiProperty({ description: 'Class arm id' })
  @IsString()
  armId!: string;

  @ApiPropertyOptional({ description: 'Term id; the current term when omitted' })
  @IsOptional()
  @IsString()
  termId?: string;
}

export class TimetableGridDto extends TimetableRefDto {
  @ApiPropertyOptional({
    type: Object,
    description: '"<Day>-<period id>" → subject code, e.g. { "Monday-P1": "MTH" }',
    example: { 'Monday-P1': 'MTH', 'Monday-P2': 'ENG' },
  })
  @IsOptional()
  @IsObject()
  grid?: Record<string, string>;
}

export class TimetableCopyDto extends TimetableRefDto {
  @ApiProperty({ description: 'The term to copy this arm’s timetable from' })
  @IsString()
  fromTermId!: string;
}

/* ---------------- Assessment & grading ---------------- */

export class SaveAssessmentDto {
  @ApiProperty({ description: 'One scheme for every section, sent under the key "*"' })
  @IsBoolean()
  same!: boolean;

  @ApiProperty({
    type: Object,
    description:
      'Section name (or "*") → { mode: "scores" | "descriptive", components: [{ name, max, ' +
      'weight, when }], scale: [{ grade, min, max, remark, points, pass }], ratings: [{ name, ' +
      'description }], showPosition }, or null for no scheme yet',
  })
  @IsObject()
  schemes!: Record<string, unknown>;

  @ApiProperty({ enum: ['Whole number', '1 decimal place'] })
  @IsIn(['Whole number', '1 decimal place'])
  rounding!: 'Whole number' | '1 decimal place';

  @ApiProperty({ example: 40 })
  @IsNumber()
  passMark!: number;
}
