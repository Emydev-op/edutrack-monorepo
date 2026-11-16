import { ApiProperty } from '@nestjs/swagger';
import { ROLE_SCOPE_LABELS } from '../access.js';

const USER_STATUSES = ['Active', 'Invited', 'Suspended', 'Deactivated', 'Revoked'];

/** One line of a record's history (`TimelineEntry`). */
export class TimelineEntryDto {
  @ApiProperty({ example: '0193a7c1-…' })
  id!: string;

  @ApiProperty({ example: 'Suspended account' })
  title!: string;

  @ApiProperty({ example: 'Adaeze Okonkwo · On leave until January' })
  detail!: string;

  @ApiProperty({ example: '28 Nov' })
  when!: string;

  @ApiProperty({ example: '2026-11-28T09:14:00.000Z', description: 'ISO time of the entry' })
  at!: string;
}

/** A row of Settings › Users (`SchoolUserRow`). `id` is the membership id. */
export class SchoolUserRowDto {
  @ApiProperty({ example: '0193a7c1-5d1e-7c2a-9f00-4b1f6a2d9e11' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: '0193a7c1-…' })
  staffId!: string | null;

  @ApiProperty({ example: 'Mr. Kunle Bakare' })
  name!: string;

  @ApiProperty({ example: 'kunle.bakare@greenfield.edu.ng' })
  email!: string;

  @ApiProperty({ example: 'Bursar' })
  position!: string;

  @ApiProperty({ type: [String], example: ['Bursar'] })
  roles!: string[];

  @ApiProperty({ enum: ['School', 'Branch'], example: 'School' })
  scope!: 'School' | 'Branch';

  @ApiProperty({ type: [String], example: [] })
  branches!: string[];

  @ApiProperty({ enum: USER_STATUSES, example: 'Active' })
  status!: string;

  @ApiProperty({ example: '2 hr ago' })
  lastActive!: string;

  @ApiProperty({ example: 'Mar 2017' })
  created!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  invited!: string | null;
}

export class SchoolUserDetailDto extends SchoolUserRowDto {
  @ApiProperty({ description: 'The signed-in user’s own account' })
  isYou!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'GFA-ST-0024' })
  staffNumber!: string | null;

  @ApiProperty({
    example: [['Finance', 'View, Create invoices, Record payments']],
    description: 'What their roles allow, by area',
  })
  can!: [string, string][];

  @ApiProperty({ type: [TimelineEntryDto] })
  history!: TimelineEntryDto[];
}

export class RoleResponseDto {
  @ApiProperty({ example: '0193a7c1-…' })
  id!: string;

  @ApiProperty({ example: 'Exams Officer' })
  name!: string;

  @ApiProperty({ enum: ['Predefined', 'Custom'], example: 'Custom' })
  type!: 'Predefined' | 'Custom';

  @ApiProperty({ enum: ROLE_SCOPE_LABELS, example: 'Section' })
  scope!: string;

  @ApiProperty({ example: 'Assessment setup and result completion tracking' })
  description!: string;

  @ApiProperty({ example: { academics: ['view', 'configure'], results: ['view', 'review'] } })
  permissions!: Record<string, string[]>;

  @ApiProperty({
    example: 2,
    description: 'People holding the role (revoked invitations excluded)',
  })
  users!: number;
}

export class StaffOptionDto {
  @ApiProperty({ example: '0193a7c1-…' })
  id!: string;

  @ApiProperty({ example: 'Mrs. Grace Okafor' })
  name!: string;

  @ApiProperty({ example: 'English Teacher' })
  position!: string;

  @ApiProperty({
    enum: ['Active', 'Invited', 'Suspended', 'Deactivated', 'No account'],
    example: 'Active',
  })
  account!: string;

  @ApiProperty({ description: 'Whole-school access or the School Admin role' })
  hasSchoolWideAccess!: boolean;

  @ApiProperty({ type: [String], example: ['Teacher'] })
  roles!: string[];
}

export class OkDto {
  @ApiProperty({ example: true })
  ok!: true;
}
