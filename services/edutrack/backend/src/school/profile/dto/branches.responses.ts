import { ApiProperty } from '@nestjs/swagger';
import { TimelineEntryResponse } from './profile.responses.js';

export class BranchResponse {
  @ApiProperty({ example: '0193a3f2-6c1e-7a51-9d1a-2f4c8b6e7a10' })
  id!: string;

  @ApiProperty({ example: 'Lekki Campus' })
  name!: string;

  @ApiProperty({ example: 'GFA-LK' })
  code!: string;

  @ApiProperty({ example: '7 Admiralty Way, Lekki Phase 1' })
  street!: string;

  @ApiProperty({ example: 'Lekki' })
  city!: string;

  @ApiProperty({ example: 'Eti Osa' })
  lga!: string;

  @ApiProperty({ example: 'Lagos' })
  state!: string;

  @ApiProperty({ example: '0803 555 0150' })
  phone!: string;

  @ApiProperty({ example: 'lekki@greenfieldacademy.ng' })
  email!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Staff id of the head of campus.' })
  headId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Mrs. Adaeze Okonkwo' })
  headName!: string | null;

  @ApiProperty({ type: [String], example: ['Nursery', 'Primary', 'Senior Secondary'] })
  sections!: string[];

  @ApiProperty({ example: true })
  hasStore!: boolean;

  @ApiProperty({ enum: ['Active', 'Inactive'], example: 'Active' })
  status!: 'Active' | 'Inactive';

  @ApiProperty({ example: 406, description: 'Students on the roll at the branch.' })
  students!: number;

  @ApiProperty({ example: 36, description: 'Current staff assigned to the branch.' })
  staff!: number;

  @ApiProperty({ example: 17 })
  classArms!: number;

  @ApiProperty({
    example: false,
    description: 'Only branches added later with no records can be deleted.',
  })
  canDelete!: boolean;
}

export class BranchListResponse {
  @ApiProperty({ type: [BranchResponse] })
  branches!: BranchResponse[];

  @ApiProperty({ example: 'Growth' })
  planName!: string;

  @ApiProperty({ example: 5, description: 'Includes inactive branches. 999 when unlimited.' })
  branchLimit!: number;

  @ApiProperty({
    type: [String],
    example: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
    description: 'The school’s sections; a branch offers a subset.',
  })
  offering!: string[];

  @ApiProperty({ example: 'GA-' })
  codePrefix!: string;
}

export class ScopedUserResponse {
  @ApiProperty({ example: 'Mrs. Kemi Lawal' })
  name!: string;

  @ApiProperty({ type: [String], example: ['Branch Admin'] })
  roles!: string[];
}

export class BranchClassResponse {
  @ApiProperty({ example: 'Junior Secondary' })
  section!: string;

  @ApiProperty({ example: 'JSS 1' })
  level!: string;

  @ApiProperty({ example: 'A, B, C' })
  arms!: string;

  @ApiProperty({ example: 96 })
  students!: number;
}

export class BranchStaffResponse {
  @ApiProperty({ example: '0193a3f2-6c1e-7a51-9d1a-2f4c8b6e7a10' })
  id!: string;

  @ApiProperty({ example: 'Mrs. Grace Okafor' })
  name!: string;

  @ApiProperty({ example: 'English Teacher' })
  position!: string;

  @ApiProperty({ example: 'All branches' })
  scope!: string;

  @ApiProperty({ example: 'Active', description: 'Account status, or "No account".' })
  account!: string;
}

export class BranchDetailResponse extends BranchResponse {
  @ApiProperty({
    type: [ScopedUserResponse],
    description: 'Users whose only scope is this branch; they lose access if it’s deactivated.',
  })
  scopedUsers!: ScopedUserResponse[];

  @ApiProperty({ type: [BranchClassResponse] })
  classes!: BranchClassResponse[];

  @ApiProperty({ type: [BranchStaffResponse] })
  staffList!: BranchStaffResponse[];

  @ApiProperty({
    nullable: true,
    type: Object,
    example: null,
    description: 'The current term’s figures; null until Finance bills anything at the branch.',
  })
  finance!: null;

  @ApiProperty({ type: [TimelineEntryResponse] })
  history!: TimelineEntryResponse[];
}

export class BranchDeletedResponse {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ example: 'Ajah Annex', description: 'The deleted branch’s name.' })
  name!: string;
}
