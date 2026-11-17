import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/*
 * Swagger shapes of the Academics answers (School Admin's `SectionsView`, `SessionsView`,
 * `AcademicSession`, `ClassesView`, `ClassArm`, `ClassDetail`).
 */

const UUID = '0193a1b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b';
const BRANCH = '0193a1b2-7c4d-7e8f-9a0b-1c2d3e4f0001';

/* ---------------- Sections ---------------- */

export class AcademicSectionResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({ example: 'Junior Secondary' })
  name!: string;

  @ApiProperty({ example: 'JSS' })
  code!: string;

  @ApiProperty({ example: 'JSS 1–3 · Basic Education Certificate' })
  description!: string;

  @ApiProperty({ example: 3, description: 'Class levels across branches' })
  levels!: number;

  @ApiProperty({ example: ['Main Campus'], description: 'Active branches that run it' })
  branches!: string[];
}

export class SectionsViewResponse {
  @ApiProperty({ type: [AcademicSectionResponse] })
  sections!: AcademicSectionResponse[];

  @ApiProperty({ example: true, description: 'The Academic Sections setup step is confirmed' })
  confirmed!: boolean;
}

/* ---------------- Sessions ---------------- */

export class TermEventResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({
    example: 'midterm',
    enum: ['resumption', 'midterm', 'ca', 'exams', 'pta', 'results', 'custom'],
  })
  type!: string;

  @ApiProperty({ example: 'Mid-term break' })
  name!: string;

  @ApiProperty({ example: '2026-10-29' })
  start!: string;

  @ApiProperty({ example: '2026-11-02' })
  end!: string;
}

export class TermResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({ example: 'First Term' })
  name!: string;

  @ApiProperty({ example: '2026-09-14' })
  start!: string;

  @ApiProperty({ example: '2026-12-18' })
  end!: string;

  @ApiProperty({ example: 'Active', enum: ['Upcoming', 'Active', 'Ended', 'Closed'] })
  status!: string;

  @ApiProperty({ type: [TermEventResponse] })
  events!: TermEventResponse[];
}

export class AcademicSessionResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({ example: '2026/2027' })
  name!: string;

  @ApiProperty({ example: '2026-09-14' })
  start!: string;

  @ApiProperty({ example: '2027-07-23' })
  end!: string;

  @ApiProperty({
    example: 'Active',
    enum: ['Upcoming', 'Active', 'Closing', 'Closed', 'Archived'],
  })
  status!: string;

  @ApiProperty({ example: '3 terms', enum: ['3 terms', '2 semesters', 'Custom'] })
  structure!: string;

  @ApiProperty({ type: [TermResponse] })
  terms!: TermResponse[];

  @ApiProperty({ example: 1248, description: 'Students enrolled in the session' })
  students!: number;

  @ApiProperty({ example: 'Copied from 2025/2026' })
  note!: string;

  @ApiProperty({ example: null, nullable: true, type: String })
  closedOn!: string | null;
}

export class RouteTargetResponse {
  @ApiProperty({ example: 'results', description: 'School Admin route name' })
  name!: string;

  @ApiPropertyOptional({ example: { id: UUID } })
  params?: Record<string, string>;

  @ApiPropertyOptional({ example: { from: 'setup' } })
  query?: Record<string, string>;
}

export class ChecklistItemResponse {
  @ApiProperty({ example: 'Result entry' })
  label!: string;

  @ApiProperty({ example: 'No result sheets this term' })
  detail!: string;

  @ApiProperty({
    example: 'Complete',
    enum: ['Complete', 'Blocking', 'Pending', 'In progress', 'Review needed', 'Optional'],
  })
  status!: string;

  @ApiProperty({ type: RouteTargetResponse, nullable: true })
  to!: RouteTargetResponse | null;
}

export class TermChecklistResponse {
  @ApiProperty({ example: UUID })
  termId!: string;

  @ApiProperty({ example: 'First Term closing checklist' })
  title!: string;

  @ApiProperty({ type: [ChecklistItemResponse] })
  items!: ChecklistItemResponse[];

  @ApiProperty({ example: false })
  canClose!: boolean;

  @ApiProperty({ example: 'Available after 18 Dec once blocking items are resolved.' })
  reason!: string;
}

export class CopyAreaResponse {
  @ApiProperty({ example: 'classes' })
  id!: string;

  @ApiProperty({ example: 'Class levels' })
  label!: string;

  @ApiProperty({ example: '25 levels' })
  detail!: string;
}

export class SessionConfirmedResponse {
  @ApiProperty({ example: true })
  session!: boolean;

  @ApiProperty({ example: true })
  terms!: boolean;
}

export class SessionsViewResponse {
  @ApiProperty({ type: [AcademicSessionResponse], description: 'Newest first' })
  sessions!: AcademicSessionResponse[];

  @ApiProperty({ example: UUID, nullable: true, type: String })
  currentId!: string | null;

  @ApiProperty({ type: TermChecklistResponse, nullable: true })
  termChecklist!: TermChecklistResponse | null;

  @ApiProperty({ type: [CopyAreaResponse] })
  copyAreas!: CopyAreaResponse[];

  @ApiProperty({ type: SessionConfirmedResponse })
  confirmed!: SessionConfirmedResponse;
}

/* ---------------- Classes ---------------- */

export class ClassArmResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({ example: `${UUID}~${BRANCH}`, description: 'The level at this branch' })
  levelId!: string;

  @ApiProperty({ example: BRANCH })
  branchId!: string;

  @ApiProperty({ example: 'Main Campus' })
  branch!: string;

  @ApiProperty({ example: 'Junior Secondary' })
  section!: string;

  @ApiProperty({ example: 'JSS 2' })
  level!: string;

  @ApiProperty({ example: 'B' })
  arm!: string;

  @ApiProperty({ example: 'JSS 2B' })
  name!: string;

  @ApiProperty({ example: 35 })
  capacity!: number;

  @ApiProperty({ example: 31 })
  students!: number;

  @ApiProperty({ example: null, nullable: true, type: String })
  classTeacherId!: string | null;

  @ApiProperty({ example: 'Mrs. Lola Fashola', nullable: true, type: String })
  classTeacher!: string | null;

  @ApiProperty({ example: 'Room J2B · Block C' })
  room!: string;
}

export class ClassLevelResponse {
  @ApiProperty({
    example: `${UUID}~${BRANCH}`,
    description: 'Level id and branch id: a level is listed once per branch that runs it.',
  })
  id!: string;

  @ApiProperty({ example: BRANCH })
  branchId!: string;

  @ApiProperty({ example: 'Junior Secondary' })
  section!: string;

  @ApiProperty({ example: 'JSS 2' })
  name!: string;

  @ApiProperty({ example: 'JSS 3', nullable: true, type: String, description: 'Promotes to' })
  next!: string | null;

  @ApiProperty({ type: [ClassArmResponse] })
  arms!: ClassArmResponse[];
}

export class ClassesBranchResponse {
  @ApiProperty({ example: BRANCH })
  id!: string;

  @ApiProperty({ example: 'Main Campus' })
  name!: string;

  @ApiProperty({ example: ['Junior Secondary', 'Senior Secondary'] })
  sections!: string[];
}

export class ClassesViewResponse {
  @ApiProperty({ type: [ClassesBranchResponse] })
  branches!: ClassesBranchResponse[];

  @ApiProperty({ type: [AcademicSectionResponse] })
  sections!: AcademicSectionResponse[];

  @ApiProperty({ type: [ClassLevelResponse] })
  levels!: ClassLevelResponse[];

  @ApiProperty({ example: true, description: 'The Classes & Arms setup step is confirmed' })
  confirmed!: boolean;

  @ApiProperty({
    example: { JSS: ['JSS 1', 'JSS 2', 'JSS 3'] },
    description: 'Standard levels per section code',
  })
  defaults!: Record<string, string[]>;
}

export class ClassStudentResponse {
  @ApiProperty({ example: UUID })
  id!: string;

  @ApiProperty({ example: 'Emmanuel Adeyemi' })
  name!: string;

  @ApiProperty({ example: 'GFA/2024/0142' })
  admissionNo!: string;

  @ApiProperty({ example: 'Male' })
  gender!: string;

  @ApiProperty({ example: 'Mrs. Funke Adeyemi' })
  guardian!: string;

  @ApiProperty({ example: 0, description: 'Fee balance (Finance phase; 0 for now)' })
  balance!: number;
}

export class ClassDetailResponse {
  @ApiProperty({ type: ClassArmResponse })
  arm!: ClassArmResponse;

  @ApiProperty({ type: [ClassStudentResponse] })
  students!: ClassStudentResponse[];

  @ApiProperty({ type: [Object], example: [], description: 'Subjects phase: empty for now' })
  subjects!: unknown[];

  @ApiProperty({
    type: Object,
    nullable: true,
    example: null,
    description: 'Timetable phase: null for now',
  })
  timetable!: null;

  @ApiProperty({ type: [Object], example: [], description: 'Results phase: empty for now' })
  results!: unknown[];
}
