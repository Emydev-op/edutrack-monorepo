import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/* Swagger shapes of the School Admin staff types (`school-admin/src/types/staff.ts`). */

export class StaffLoadDto {
  @ApiProperty({ example: 22, description: 'Periods a week this term' })
  periods!: number;

  @ApiProperty({ example: 28 })
  max!: number;

  @ApiProperty({ example: 4 })
  subjects!: number;

  @ApiProperty({ example: 3 })
  classes!: number;
}

export class StaffListRowDto {
  @ApiProperty({ example: '019a7c1e-5b2f-7c3d-9e10-1a2b3c4d5e6f' })
  id!: string;

  @ApiProperty({ example: 'Mrs. Grace Okafor' })
  name!: string;

  @ApiProperty({ example: 'GFA-ST-0098' })
  staffNumber!: string;

  @ApiProperty({ example: 'English Teacher' })
  position!: string;

  @ApiProperty({ example: 'Languages' })
  department!: string;

  @ApiProperty({ enum: ['Teaching', 'Administrative', 'Finance', 'Operations'] })
  group!: string;

  @ApiProperty({ enum: ['Teaching', 'Non-teaching'] })
  kind!: string;

  @ApiProperty({ example: 'Main Campus + Lekki Campus', description: 'Or "All branches"' })
  branch!: string;

  @ApiProperty({ type: [String] })
  branchIds!: string[];

  @ApiProperty({ enum: ['Full-time', 'Part-time', 'Contract'] })
  employment!: string;

  @ApiProperty({ example: 'g.okafor@greenfield.edu.ng' })
  email!: string;

  @ApiProperty({ example: '0805 221 9087' })
  phone!: string;

  @ApiProperty({ enum: ['Active', 'Invited', 'Suspended', 'Deactivated', 'No account'] })
  account!: string;

  @ApiProperty({ enum: ['Active', 'Deactivated'] })
  status!: string;

  @ApiProperty({ example: 'Jul 2026', nullable: true, type: String })
  leftOn!: string | null;

  @ApiProperty({ type: StaffLoadDto, nullable: true, description: 'Null for non-teaching staff' })
  load!: StaffLoadDto | null;

  @ApiProperty({ type: [String], example: ['JSS 2B'] })
  classTeacherOf!: string[];

  @ApiProperty({ description: 'The signed-in admin (can’t deactivate themself)' })
  isYou!: boolean;
}

export class ClearedDto {
  @ApiProperty({ example: 2, description: 'Teaching assignments cleared' })
  removed!: number;

  @ApiProperty({ example: 1, description: 'Class-teacher posts ended' })
  classes!: number;
}

export class StaffSavedDto extends StaffListRowDto {
  @ApiPropertyOptional({ type: ClearedDto, description: 'Edit and deactivate only' })
  cleared?: ClearedDto;
}

class StaffCountsDto {
  @ApiProperty({ example: 14 }) All!: number;
  @ApiProperty({ example: 9 }) Teaching!: number;
  @ApiProperty({ example: 3 }) Administrative!: number;
  @ApiProperty({ example: 2 }) Finance!: number;
  @ApiProperty({ example: 2 }) Operations!: number;
  @ApiProperty({ example: 1, name: 'No access' }) 'No access'!: number;
}

class NamedIdDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Mr. Samuel Ade' }) name!: string;
}

export class StaffListDto {
  @ApiProperty({ type: [StaffListRowDto] })
  rows!: StaffListRowDto[];

  @ApiProperty({ type: StaffCountsDto, description: 'Staff on the roll per tab' })
  counts!: StaffCountsDto;

  @ApiProperty({ example: 14 })
  total!: number;

  @ApiProperty({ example: 11 })
  withAccounts!: number;

  @ApiProperty({ example: 2 })
  pendingInvites!: number;

  @ApiProperty({ example: 2 })
  deactivated!: number;

  @ApiProperty({ type: [NamedIdDto], description: 'Teachers with no subjects and no class' })
  unassignedTeachers!: NamedIdDto[];

  @ApiProperty({ type: [String], example: ['Lekki Campus'] })
  branchesWithoutTeachers!: string[];
}

export class StaffDocumentRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'guarantor-form.pdf' }) name!: string;
  @ApiProperty({ example: 'Guarantor form' }) kind!: string;
  @ApiProperty({ example: '12 Nov 2026', description: '— when nothing is on file' })
  uploaded!: string;
  @ApiProperty({ enum: ['Verified', 'Pending', 'Missing', 'Optional'] }) status!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Signed link, valid for an hour' })
  url!: string | null;
}

class StaffUserDto {
  @ApiProperty({ description: 'Membership id (Users & Roles)' }) id!: string;
  @ApiProperty({ example: 'g.okafor@greenfield.edu.ng' }) email!: string;
  @ApiProperty({ enum: ['Active', 'Invited', 'Suspended', 'Deactivated'] }) status!: string;
  @ApiProperty({ type: [String], example: ['Teacher'] }) roles!: string[];
  @ApiProperty({ example: 'Whole school' }) scope!: string;
  @ApiProperty({ example: '2 h ago' }) lastActive!: string;
  @ApiProperty({ example: '12 Nov 2026', nullable: true, type: String }) invited!: string | null;
}

class TeachingAssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ENG' }) subject!: string;
  @ApiProperty({ example: 'English Language' }) subjectName!: string;
  @ApiProperty() armId!: string;
  @ApiProperty({ example: 'JSS 2B' }) arm!: string;
  @ApiProperty({ example: 'Main Campus' }) branch!: string;
  @ApiProperty({ example: 'Subject teacher' }) type!: string;
  @ApiProperty({ example: 5 }) periods!: number;
}

class StaffTeachingDto {
  @ApiProperty({ example: 'First Term' }) term!: string;
  @ApiProperty({ type: [TeachingAssignmentDto] }) assignments!: TeachingAssignmentDto[];
  @ApiProperty({ type: [NamedIdDto] }) classTeacherOf!: NamedIdDto[];
}

class TimelineEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Details updated' }) title!: string;
  @ApiProperty({ example: 'Adaeze Okonkwo · Position: Teacher → Head of Department' })
  detail!: string;
  @ApiProperty({ example: '12 Nov 2026' }) when!: string;
}

export class StaffDetailDto extends StaffListRowDto {
  @ApiProperty({ example: 'Mrs.' }) title!: string;
  @ApiProperty({ example: 'Grace' }) firstName!: string;
  @ApiProperty({ example: 'Okafor' }) lastName!: string;
  @ApiProperty({ enum: ['Female', 'Male', ''] }) gender!: string;
  @ApiProperty({ example: '14 Allen Avenue, Ikeja' }) address!: string;
  @ApiProperty({ example: 'Spouse · 0803 555 0144' }) emergencyContact!: string;
  @ApiProperty({ example: '2018-09-10', description: 'ISO date, or empty' }) since!: string;
  @ApiProperty({ type: [String], example: ['ENG', 'LIE'] }) qualified!: string[];
  @ApiProperty({ type: [String], example: ['English Language', 'Literature in English'] })
  qualifiedNames!: string[];
  @ApiProperty({ example: 28 }) maxPeriods!: number;
  @ApiProperty({ nullable: true, type: String, description: 'Signed photo link, an hour' })
  photoUrl!: string | null;
  @ApiProperty({ type: [StaffDocumentRowDto] }) documents!: StaffDocumentRowDto[];
  @ApiProperty({ type: StaffUserDto, nullable: true }) user!: StaffUserDto | null;
  @ApiProperty({ type: StaffTeachingDto, nullable: true }) teaching!: StaffTeachingDto | null;
  @ApiProperty({ type: [TimelineEntryDto] }) history!: TimelineEntryDto[];
}

class RoleOptionDto {
  @ApiProperty({ example: 'Teacher' }) name!: string;
  @ApiProperty({ example: 'Enter scores, assignments, materials' }) description!: string;
}

class SubjectOptionDto {
  @ApiProperty({ example: 'MTH' }) code!: string;
  @ApiProperty({ example: 'Mathematics' }) name!: string;
}

class BranchOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Main Campus' }) name!: string;
}

export class StaffFormOptionsDto {
  @ApiProperty({ type: [BranchOptionDto] }) branches!: BranchOptionDto[];
  @ApiProperty({ type: [String], example: ['Principal', 'Teacher', 'Bursar'] })
  positions!: string[];
  @ApiProperty({ type: [String], example: ['Academics', 'Sciences'] }) departments!: string[];
  @ApiProperty({ type: [RoleOptionDto] }) roles!: RoleOptionDto[];
  @ApiProperty({ type: [SubjectOptionDto] }) subjects!: SubjectOptionDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { Bursar: 'Bursar', Teacher: 'Teacher' },
  })
  roleForPosition!: Record<string, string>;
}

class TeacherSubjectDto {
  @ApiProperty({ example: 'MTH' }) code!: string;
  @ApiProperty({ example: 'Mathematics' }) name!: string;
  @ApiProperty({ type: [String], example: ['JSS 1A', 'JSS 2B'] }) arms!: string[];
}

export class TeacherRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Mr. Samuel Ade' }) name!: string;
  @ApiProperty({ example: 'GFA-ST-0117' }) staffNumber!: string;
  @ApiProperty({ example: 'Main Campus + Lekki Campus' }) branch!: string;
  @ApiProperty({ enum: ['Full-time', 'Part-time', 'Contract'] }) employment!: string;
  @ApiProperty({ type: [String], example: ['MTH', 'FMT'] }) qualified!: string[];
  @ApiProperty({ example: 22 }) periods!: number;
  @ApiProperty({ example: 28 }) max!: number;
  @ApiProperty({ type: [TeacherSubjectDto] }) subjects!: TeacherSubjectDto[];
  @ApiProperty({ type: [String], example: ['JSS 2B'] }) classTeacherOf!: string[];
  @ApiProperty({ enum: ['Active', 'Invited', 'Suspended', 'Deactivated', 'No account'] })
  account!: string;
}

export class InviteResultDto {
  @ApiProperty({ example: 3 }) invited!: number;
  @ApiProperty({ type: [String], example: ['Mr. Peter Adamu'], description: 'Not invited' })
  skipped!: string[];
}

export class StaffImportRowDto {
  @ApiProperty({ example: 2 }) line!: number;
  @ApiProperty({ example: 'Grace Okafor' }) name!: string;
  @ApiProperty({ example: 'g.okafor@school.ng' }) email!: string;
  @ApiProperty({ example: '08035550161' }) phone!: string;
  @ApiProperty({ enum: ['Teaching', 'Non-teaching', ''] }) kind!: string;
  @ApiProperty({ example: 'Teacher' }) position!: string;
  @ApiProperty({ example: 'Main Campus' }) branch!: string;
  @ApiProperty() access!: boolean;
  @ApiProperty({ example: 'Teacher' }) role!: string;
  @ApiProperty({ type: [String], example: [] }) errors!: string[];
  @ApiProperty({ type: [String], example: ['no portal access'] }) warnings!: string[];
}

export class StaffImportBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'staff.csv' }) fileName!: string;
  @ApiProperty({ type: [StaffImportRowDto] }) rows!: StaffImportRowDto[];
}

export class StaffImportResultDto {
  @ApiProperty({ example: 12 }) imported!: number;
  @ApiProperty({ example: 4 }) invites!: number;
  @ApiProperty({ example: 1 }) skipped!: number;
}
