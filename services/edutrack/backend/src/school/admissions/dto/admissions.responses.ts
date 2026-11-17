import { ApiProperty } from '@nestjs/swagger';

export class AdmissionApplicationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Kamsi Nwosu' }) applicant!: string;
  @ApiProperty({ example: 'Sister of David Nwosu (JSS 2B)' }) note!: string;
  @ApiProperty({ example: 'JSS 1 · Main Campus' }) applyingFor!: string;
  @ApiProperty({ enum: ['New intake', 'Transfer in'] }) type!: string;
  @ApiProperty({ example: '28 Nov 2026' }) applied!: string;
  @ApiProperty({ example: 'Mr. Obinna Nwosu' }) guardian!: string;
  @ApiProperty({ enum: ['Pending', 'Under review', 'Offer accepted', 'Admitted', 'Rejected'] })
  stage!: string;
  @ApiProperty({ example: 'Assessment 10 Dec' }) stageNote!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Set once admitted' })
  studentId!: string | null;
}

interface ArmPlace {
  arm: string;
  used: number;
  capacity: number;
}

const ARM_PLACE = {
  type: 'object',
  properties: {
    arm: { type: 'string' },
    used: { type: 'number' },
    capacity: { type: 'number' },
  },
} as const;

class RequiredDocumentDto {
  @ApiProperty({ example: 'birth' }) key!: string;
  @ApiProperty({ example: 'Birth certificate' }) label!: string;
  @ApiProperty({ enum: ['always', 'transfer', 'optional'] }) required!: string;
}

const ARMS_EXAMPLE = {
  'JSS 1': [
    { arm: 'A', used: 30, capacity: 35 },
    { arm: 'B', used: 35, capacity: 35 },
  ],
};

export class AdmissionOptionsDto {
  @ApiProperty({ example: '2026/2027', description: 'The active session ("" before one starts)' })
  session!: string;
  @ApiProperty({ example: 'First Term' }) term!: string;
  @ApiProperty({ type: [String], example: ['Main Campus', 'Lekki Campus'] }) branches!: string[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: ARM_PLACE },
    example: ARMS_EXAMPLE,
    description: 'Class level → arms at the first branch, with places used this session',
  })
  arms!: Record<string, ArmPlace[]>;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object' },
    example: { 'Main Campus': ARMS_EXAMPLE },
    description: 'Branch → class level → arms (each branch runs its own arms)',
  })
  armsByBranch!: Record<string, Record<string, ArmPlace[]>>;
  @ApiProperty({ type: [String], example: ['Mathematics', 'English Language'] })
  compulsorySubjects!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['CRS', 'Christian Religious Studies']],
  })
  religiousSubjects!: [string, string][];
  @ApiProperty({ type: [String], example: ['French', 'Computer Studies'] }) electives!: string[];
  @ApiProperty({ type: [String], example: ['Music'] }) unstaffedElectives!: string[];
  @ApiProperty({ type: [String], example: ['Abia', 'Adamawa'] }) states!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: {} },
    example: [],
    description: 'Fee lines; empty until Finance is on the real API',
  })
  feeItems!: [string, number][];
  @ApiProperty({ example: 0 }) admissionFee!: number;
  @ApiProperty({ example: 0 }) siblingDiscount!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'object' }, example: {} })
  feeLines!: Record<string, unknown>;
  @ApiProperty({ example: false }) feesReady!: boolean;
  @ApiProperty({ type: [RequiredDocumentDto] }) requiredDocuments!: RequiredDocumentDto[];
}

class DuplicateMatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Kamsi Nwosu' }) name!: string;
  @ApiProperty({ example: 'JSS 1A' }) className!: string;
  @ApiProperty({ example: 'STU-2026-1249' }) admissionNo!: string;
}

class SiblingMatchDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ example: 'David Nwosu' }) studentName!: string;
  @ApiProperty({ example: 'JSS 2B' }) className!: string;
  @ApiProperty() guardianId!: string;
  @ApiProperty({ example: 'Mr. Obinna Nwosu' }) guardianName!: string;
  @ApiProperty({ example: '0806 555 0193' }) guardianPhone!: string;
  @ApiProperty({ example: 'Father' }) relationship!: string;
}

class GuardianMatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Mr. Obinna Nwosu' }) name!: string;
  @ApiProperty({ example: '0806 555 0193' }) phone!: string;
  @ApiProperty({ example: 'obinna.nwosu@gmail.com' }) email!: string;
  @ApiProperty({ enum: ['phone', 'email'] }) matchedBy!: string;
  @ApiProperty({ type: [String], example: ['David Nwosu (JSS 2B)'] }) children!: string[];
}

export class AdmissionMatchesDto {
  @ApiProperty({ type: DuplicateMatchDto, nullable: true }) duplicate!: DuplicateMatchDto | null;
  @ApiProperty({ type: SiblingMatchDto, nullable: true }) sibling!: SiblingMatchDto | null;
  @ApiProperty({
    type: GuardianMatchDto,
    nullable: true,
    description: 'An existing guardian with the phone (or email) asked about',
  })
  guardian!: GuardianMatchDto | null;
}

export class AdmitResultDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ example: 'Kamsi Nwosu' }) name!: string;
  @ApiProperty({ example: 'STU-2026-1249' }) admissionNo!: string;
  @ApiProperty({ example: 'JSS 1A' }) className!: string;
  @ApiProperty({ example: 'Main Campus' }) branch!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Mr. Obinna Nwosu' })
  guardianName!: string | null;
  @ApiProperty({ example: false, description: 'Always false: admission sends no invitations' })
  invited!: boolean;
  @ApiProperty({ example: 0, description: 'Draft invoice total (0 until Finance is built)' })
  invoiceTotal!: number;
}

class ImportIssueDto {
  @ApiProperty({ example: 12, description: 'Row in the file (the header is row 1)' }) row!: number;
  @ApiProperty({ example: 'Chukwuemeka Obi' }) student!: string;
  @ApiProperty({ enum: ['error', 'warning'] }) kind!: string;
  @ApiProperty({ enum: ['class', 'dob', 'duplicate', 'no-guardian', 'guardian-match', 'invalid'] })
  code!: string;
  @ApiProperty({ example: 'Class "JSS1 C" not found. Did you mean JSS 1C?' }) message!: string;
  @ApiProperty({ required: false, example: 'JSS 1C' }) suggestion?: string;
  @ApiProperty({ required: false, example: '31/02/2014' }) value?: string;
}

export class ImportBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'jss1-intake.csv' }) fileName!: string;
  @ApiProperty({ example: 48 }) rows!: number;
  @ApiProperty({ example: 43, description: 'Rows without errors' }) valid!: number;
  @ApiProperty({ type: [ImportIssueDto] }) issues!: ImportIssueDto[];
  @ApiProperty({ example: 38, description: 'Guardians created if every row imports' })
  guardiansNew!: number;
  @ApiProperty({ example: 9, description: 'Rows linked to existing guardians by phone' })
  guardiansLinked!: number;
  @ApiProperty({ example: '2026/2027 · Main Campus · JSS 1 intake' }) target!: string;
}

export class ImportResultDto {
  @ApiProperty() batchId!: string;
  @ApiProperty({ example: 46 }) imported!: number;
  @ApiProperty({ example: 37 }) guardiansNew!: number;
  @ApiProperty({ example: 10 }) guardiansLinked!: number;
}
