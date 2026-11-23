import { ApiProperty } from '@nestjs/swagger';

/* Answers of the guardian routes; shapes match School Admin's `types/students.ts`. */

const UUID = '0193a7c1-5d1e-7c2a-9f00-4b1f6a2d9e11';
export const PORTAL_STATUSES = ['No account', 'Invited', 'Active', 'Closed'] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];

export class GuardianChildDto {
  @ApiProperty({ example: UUID }) id!: string;
  @ApiProperty({ example: 'Chidi Okafor' }) name!: string;
  @ApiProperty({ example: 'JSS 2B', description: 'Empty while awaiting an arm' })
  className!: string;
}

export class GuardianRowDto {
  @ApiProperty({ example: UUID }) id!: string;
  @ApiProperty({ example: 'Mrs. Ngozi Okafor' }) name!: string;
  @ApiProperty({ example: '0803 412 7781' }) phone!: string;
  @ApiProperty({ example: 'ngozi.okafor@gmail.com', description: 'Empty when none' })
  email!: string;
  @ApiProperty({ type: [GuardianChildDto] }) children!: GuardianChildDto[];
  @ApiProperty({ example: 'Mother' }) relationship!: string;
  @ApiProperty({ example: true }) paysFees!: boolean;
  @ApiProperty({
    enum: PORTAL_STATUSES,
    example: 'Invited',
    description: 'Parent Portal account: none yet, invitation pending, active, or closed',
  })
  portal!: PortalStatus;
  @ApiProperty({ example: 185000, description: 'Naira owed for the children they pay for' })
  balance!: number;
}

export class GuardianDuplicateDto {
  @ApiProperty({ example: UUID }) keepId!: string;
  @ApiProperty({ example: 'Mrs. Ngozi Okafor · ngozi.okafor@gmail.com' }) keepLabel!: string;
  @ApiProperty({ example: UUID }) mergeId!: string;
  @ApiProperty({ example: 'Ngozi Okafor · no email' }) mergeLabel!: string;
  @ApiProperty({
    example: '“Mrs. Ngozi Okafor” and “Ngozi Okafor” share the phone number 0803 412 7781.',
  })
  reason!: string;
  @ApiProperty({ example: 'Chidi Okafor (JSS 2B), Ada Okafor (Primary 4A)' }) children!: string;
}

export class GuardianPageMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) pageSize!: number;
  @ApiProperty({ example: 47 }) total!: number;
  @ApiProperty({ example: 5 }) totalPages!: number;
}

export class GuardianListDto {
  @ApiProperty({ type: [GuardianRowDto] }) data!: GuardianRowDto[];
  @ApiProperty({ type: GuardianPageMetaDto }) meta!: GuardianPageMetaDto;
  @ApiProperty({ type: [GuardianDuplicateDto], description: 'Records sharing a phone number' })
  duplicates!: GuardianDuplicateDto[];
  @ApiProperty({ example: 2, description: 'Current students with no guardian linked' })
  studentsWithoutGuardian!: number;
}

export class GuardianChildDetailDto {
  @ApiProperty({ example: UUID }) id!: string;
  @ApiProperty({ example: 'Chidi Okafor' }) name!: string;
  @ApiProperty({ example: 'JSS 2B' }) className!: string;
  @ApiProperty({ example: 'Main Campus' }) branch!: string;
  @ApiProperty({ example: 185000 }) balance!: number;
  @ApiProperty({ example: 'Partially paid', description: 'Paid · Partially paid · Overdue · Left' })
  status!: string;
  @ApiProperty({ example: 'Mother · pays fees' }) relationship!: string;
  @ApiProperty({ example: 'Left on 14 Jul 2026 · parent can view past records until 14 Jul 2028' })
  note!: string;
}

export class GuardianInvitationDto {
  @ApiProperty({ example: 'SMS and email' }) sentBy!: string;
  @ApiProperty({ example: '17 Nov 2026' }) sentOn!: string;
  @ApiProperty({ example: '24 Nov 2026' }) expiresOn!: string;
  @ApiProperty({ example: false }) expired!: boolean;
}

export class GuardianDetailDto extends GuardianRowDto {
  @ApiProperty({ example: '14 Admiralty Way, Lekki' }) address!: string;
  @ApiProperty({ example: 'Pharmacist' }) occupation!: string;
  @ApiProperty({ example: 'Mar 2025', description: 'Empty until the account is active' })
  portalSince!: string;
  @ApiProperty({ type: [GuardianChildDetailDto] }) childrenDetail!: GuardianChildDetailDto[];
  @ApiProperty({ example: 'Full payment each term' }) paymentPlan!: string;
  @ApiProperty({ example: 'Bank transfer' }) preferredMethod!: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [
      ['Results', 'In-app · Email'],
      ['Fees & receipts', 'In-app · Email · SMS'],
    ],
  })
  notifications!: [string, string][];
  @ApiProperty({
    type: GuardianInvitationDto,
    nullable: true,
    description: 'The pending Parent Portal invitation, if any',
  })
  invitation!: GuardianInvitationDto | null;
}

export class SkippedGuardianDto {
  @ApiProperty({ example: UUID }) id!: string;
  @ApiProperty({ example: 'Mr. Tunde Bello' }) name!: string;
  @ApiProperty({ example: 'No phone number or email to send the invitation to.' }) reason!: string;
}

export class GuardianInviteResultDto {
  @ApiProperty({ example: 12, description: 'Invitations sent (new and resent)' }) invited!: number;
  @ApiProperty({ type: [SkippedGuardianDto] }) skipped!: SkippedGuardianDto[];
}

export class CampusBrandDto {
  @ApiProperty({ example: 'Lekki Campus' }) name!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '#0F766E',
    description: 'The campus’s own colour; null keeps the school’s',
  })
  brandColor!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'The campus’s own logo; null keeps the school’s',
  })
  logoUrl!: string | null;
}

export class ParentChildDto {
  @ApiProperty({ example: UUID }) id!: string;
  @ApiProperty({ example: 'Chidi Okafor' }) name!: string;
  @ApiProperty({ example: 'GFA/2024/0142' }) admissionNo!: string;
  @ApiProperty({ example: 'JSS 2B' }) className!: string;
  @ApiProperty({ example: 'Main Campus' }) branch!: string;
  @ApiProperty({ example: 'Active' }) status!: string;
  @ApiProperty({ example: 'Mother' }) relationship!: string;
  @ApiProperty({
    enum: ['full', 'read-only'],
    example: 'full',
    description: '`read-only`: the child has left; past records stay visible for two years',
  })
  access!: 'full' | 'read-only';
  @ApiProperty({ type: String, nullable: true, example: null, description: 'YYYY-MM-DD' })
  leftOn!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Read-only access ends on this day (YYYY-MM-DD)',
  })
  readOnlyUntil!: string | null;
  @ApiProperty({
    type: CampusBrandDto,
    nullable: true,
    description: 'The child’s campus; the portal is themed in it while this child is selected',
  })
  campus!: CampusBrandDto | null;
}
