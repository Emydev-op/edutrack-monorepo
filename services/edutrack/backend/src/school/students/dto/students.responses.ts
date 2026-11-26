import { ApiProperty } from '@nestjs/swagger';

/* Swagger shapes of the School Admin students types (`school-admin/src/types/students.ts`). */

export class StudentRowDto {
  @ApiProperty({ example: '6a1c2e0b-7f4d-4c1a-9b2e-3d4f5a6b7c8d' })
  id!: string;

  @ApiProperty({ example: 'Emmanuel Adeyemi' })
  name!: string;

  @ApiProperty({ example: 'STU-2025-0042' })
  admissionNo!: string;

  @ApiProperty({ enum: ['Female', 'Male'] })
  gender!: string;

  @ApiProperty({
    example: 'JSS 2B',
    description: 'Empty while awaiting an arm; "SSS 1A (until 14 Nov 2026)" for leavers',
  })
  className!: string;

  @ApiProperty({ example: 'Main Campus' })
  branch!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Mrs. Funke Adeyemi' })
  guardianName!: string | null;

  @ApiProperty({ example: 95000, description: 'Naira owed on issued invoices' })
  balance!: number;

  @ApiProperty({ enum: ['Active', 'Incomplete profile', 'Transferred', 'Withdrawn', 'Graduated'] })
  status!: string;

  @ApiProperty({ example: false, description: 'On the roll this session but not placed in an arm' })
  awaitingEnrollment!: boolean;

  @ApiProperty({ example: false })
  admittedToday!: boolean;

  @ApiProperty({ example: false, description: 'Boards this session' })
  boarder!: boolean;
}

export class StudentEnrollmentDto {
  @ApiProperty({ example: '2026/2027' })
  session!: string;

  @ApiProperty({ example: 'JSS 2B', description: 'Or "JSS 1 · awaiting arm"' })
  className!: string;

  @ApiProperty({ example: 'Main Campus' })
  branch!: string;

  @ApiProperty({ example: 'Active', description: 'Active, Promoted, Transferred, Withdrawn…' })
  status!: string;

  @ApiProperty({ example: 'In progress · First Term results pending' })
  outcome!: string;
}

export class StudentResultsDto {
  @ApiProperty({ example: '2025/2026 · JSS 1B' })
  session!: string;

  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } } })
  terms!: [string, string][];
}

export class StudentSubjectDto {
  @ApiProperty({ example: 'Mathematics' })
  name!: string;

  @ApiProperty({ example: 'Compulsory' })
  type!: string;

  @ApiProperty({ example: 'Mr. Samuel Ade' })
  teacher!: string;

  @ApiProperty({ example: '14 Sep 2026' })
  since!: string;
}

export class StudentInvoiceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'INV-2026-0042' })
  number!: string;

  @ApiProperty({ example: '2026/2027 · First Term' })
  period!: string;

  @ApiProperty({ example: 185000 })
  total!: number;

  @ApiProperty({ example: 90000 })
  paid!: number;

  @ApiProperty({ example: 0 })
  pending!: number;

  @ApiProperty({ example: 95000 })
  balance!: number;

  @ApiProperty({ example: 'Partially paid' })
  status!: string;
}

export class TimelineEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Admitted to JSS 1B' })
  title!: string;

  @ApiProperty({ example: 'Adaeze Okonkwo' })
  detail!: string;

  @ApiProperty({ example: '5 Sep 2025' })
  when!: string;

  @ApiProperty({ enum: ['success', 'warning', 'error'], required: false })
  tone?: string;
}

export class StudentGuardianLinkDto {
  @ApiProperty()
  guardianId!: string;

  @ApiProperty({ example: 'Mrs. Funke Adeyemi' })
  name!: string;

  @ApiProperty({ example: 'Mother' })
  relationship!: string;

  @ApiProperty({ example: true })
  primary!: boolean;

  @ApiProperty({ example: '0803 555 0161' })
  phone!: string;

  @ApiProperty({ example: 'funke.adeyemi@gmail.com' })
  email!: string;

  @ApiProperty({ example: true })
  paysFees!: boolean;

  @ApiProperty({
    example: 'Active',
    description: 'Active, Invited or "No account · receives SMS only"',
  })
  portal!: string;

  @ApiProperty({ type: [String], example: ['Michael Adeyemi · Primary 5B'] })
  otherChildren!: string[];
}

export class StudentDocumentDto {
  @ApiProperty({ example: 'Birth certificate' })
  name!: string;

  @ApiProperty({ example: 'Yes', description: 'Yes, "Yes (transfer)", "Only for transfers"…' })
  required!: string;

  @ApiProperty({ example: '5 Sep 2025 · PDF · 412 KB', description: '"—" when nothing is on file' })
  uploaded!: string;

  @ApiProperty({ enum: ['Verified', 'Pending', 'Missing', 'Optional'] })
  status!: string;
}

export class StudentExitDto {
  @ApiProperty({ enum: ['Transfer', 'Withdrawal'] })
  kind!: string;

  @ApiProperty({ example: '14 Nov 2026' })
  date!: string;

  @ApiProperty({ example: 'Change of school' })
  reason!: string;

  @ApiProperty({ example: 'Loyola Jesuit College' })
  destination!: string;
}

export class StudentDetailDto extends StudentRowDto {
  @ApiProperty({ example: 'Emmanuel' })
  firstName!: string;

  @ApiProperty({ example: 'Adeyemi' })
  surname!: string;

  @ApiProperty({ example: '' })
  otherNames!: string;

  @ApiProperty({ example: '2013-03-14', description: 'ISO date, empty when not recorded' })
  dateOfBirth!: string;

  @ApiProperty({ type: Number, nullable: true, example: 13 })
  age!: number | null;

  @ApiProperty({ example: 'Oyo' })
  stateOfOrigin!: string;

  @ApiProperty({ example: '22 Opebi Road, Ikeja, Lagos' })
  address!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Mild asthma · inhaler with nurse',
    description: 'Null unless the member has students.edit (sensitive)',
  })
  medicalNotes!: string | null;

  @ApiProperty({ example: '5 Sep 2025' })
  admittedOn!: string;

  @ApiProperty({ enum: ['New intake', 'Transfer in'] })
  admissionType!: string;

  @ApiProperty({ example: '2025/2026 · JSS 1B' })
  admittedInto!: string;

  @ApiProperty({ example: 'Corona School, Ikeja' })
  previousSchool!: string;

  @ApiProperty({ example: 'Junior Secondary' })
  section!: string;

  @ApiProperty({ example: 'Mrs. Grace Okafor', description: 'Or "Not assigned"' })
  classTeacher!: string;

  @ApiProperty({ example: '14 Sep 2026' })
  enrolledSince!: string;

  @ApiProperty({ example: 'Results pending' })
  termResults!: string;

  @ApiProperty({ example: '—' })
  assignments!: string;

  @ApiProperty({ type: [StudentEnrollmentDto] })
  enrollments!: StudentEnrollmentDto[];

  @ApiProperty({ type: [StudentResultsDto] })
  results!: StudentResultsDto[];

  @ApiProperty({ type: [StudentSubjectDto] })
  subjects!: StudentSubjectDto[];

  @ApiProperty({ type: [StudentInvoiceDto] })
  invoices!: StudentInvoiceDto[];

  @ApiProperty({ type: [TimelineEntryDto] })
  payments!: TimelineEntryDto[];

  @ApiProperty({ description: 'Key of the student’s account in Finance' })
  financeKey!: string;

  @ApiProperty({ example: 0 })
  credit!: number;

  @ApiProperty({ type: [StudentGuardianLinkDto] })
  guardians!: StudentGuardianLinkDto[];

  @ApiProperty({ type: [StudentDocumentDto] })
  documents!: StudentDocumentDto[];

  @ApiProperty({ type: [TimelineEntryDto] })
  activity!: TimelineEntryDto[];

  @ApiProperty({ type: StudentExitDto, nullable: true })
  exit!: StudentExitDto | null;
}

export class MovedDto {
  @ApiProperty({ example: 2 })
  moved!: number;
}

export class EnrolledDto {
  @ApiProperty({ example: 3 })
  enrolled!: number;

  @ApiProperty({ example: 'JSS 1A' })
  className!: string;
}

export class ArmPlacesDto {
  @ApiProperty({ example: 'A' })
  arm!: string;

  @ApiProperty({ example: 31 })
  used!: number;

  @ApiProperty({ example: 35 })
  capacity!: number;
}

export class EnrollmentLevelDto {
  @ApiProperty({ example: 'JSS 1' })
  level!: string;

  @ApiProperty({ type: [ArmPlacesDto] })
  arms!: ArmPlacesDto[];
}

export class EnrollmentSectionDto {
  @ApiProperty({ example: 'Junior Secondary' })
  name!: string;

  @ApiProperty({ type: [EnrollmentLevelDto] })
  levels!: EnrollmentLevelDto[];
}

export class AwaitingStudentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Ruth Alabi' })
  name!: string;

  @ApiProperty({ example: 'STU-2026-1240' })
  admissionNo!: string;

  @ApiProperty({ example: 'JSS 1' })
  level!: string;
}

export class BranchRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Main Campus' })
  name!: string;
}

export class EnrollmentOptionsDto {
  @ApiProperty({ example: '2026/2027' })
  session!: string;

  @ApiProperty({ type: BranchRefDto, nullable: true, description: 'Whose arms these are' })
  branch!: BranchRefDto | null;

  @ApiProperty({ type: [BranchRefDto], description: 'Active branches to choose from' })
  branches!: BranchRefDto[];

  @ApiProperty({ type: [EnrollmentSectionDto] })
  sections!: EnrollmentSectionDto[];

  @ApiProperty({ type: [AwaitingStudentDto] })
  awaiting!: AwaitingStudentDto[];
}
