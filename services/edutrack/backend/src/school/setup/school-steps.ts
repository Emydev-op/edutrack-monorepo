import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import type { SetupStepSource } from './setup-step-source.js';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fromSetup = { from: 'setup' };

/** What a branch is missing before parents can find the campus. */
export const branchIssues = (b: {
  street: string | null;
  city: string | null;
  sections: number;
}) => [
  ...(!b.street?.trim() || !b.city?.trim() ? ['Address incomplete'] : []),
  ...(!b.sections ? ['No sections'] : []),
];

/**
 * The School-section steps (School Profile, Branches, Staff, Organogram & Roles), read straight
 * from their tables so the Setup Center works before those modules' services exist. Wording
 * matches the mock (`setupView` in `school-admin/src/api/mock/handlers/setup.ts`). Their own
 * modules can replace these sources under `SETUP_STEP_SOURCES` later.
 */
@Injectable()
export class SchoolSetupSteps {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly setupState: SetupStateService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  readonly all: SetupStepSource[] = [
    {
      id: 'school-profile',
      state: async () => {
        const schoolId = RequestContext.schoolId();
        const [school, done] = await Promise.all([
          this.db.school.findUnique({ where: { id: schoolId }, select: { logoFileId: true } }),
          this.setupState.isConfirmed('school-profile'),
        ]);
        return {
          done,
          description: done
            ? `Name, contact and registration confirmed${school?.logoFileId ? ' · logo added' : ' · no logo yet'}`
            : 'Name, logo, contact and registration',
          to: done ? { name: 'school-profile' } : { name: 'school-profile-edit', query: fromSetup },
          blockers: done ? [] : ['Save the school profile to complete this step.'],
        };
      },
      // Saving the profile completes it (PUT /v1/school/profile confirms `school-profile`).
      complete: () =>
        Promise.reject(
          new AppException(
            HttpStatus.CONFLICT,
            'Save the school profile to complete this step.',
            'SAVE_PROFILE_TO_COMPLETE',
          ),
        ),
    },
    {
      id: 'branches',
      state: async () => {
        const [branches, done] = await Promise.all([
          this.db.branch.findMany({
            orderBy: [{ isOriginal: 'desc' }, { createdAt: 'asc' }],
            select: {
              name: true,
              status: true,
              street: true,
              city: true,
              _count: { select: { branchSections: true } },
            },
          }),
          this.setupState.isConfirmed('branches'),
        ]);
        const active = branches.filter((b) => b.status === 'ACTIVE');
        const bad = active
          .map((b) => ({ b, issues: branchIssues({ ...b, sections: b._count.branchSections }) }))
          .filter((x) => x.issues.length);
        return {
          done,
          description: `${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${active.length} active${
            done ? '' : ' · confirm addresses and sections'
          }`,
          to: { name: 'setup-branches' },
          blockers: !active.length
            ? ['Add at least one active branch first.']
            : bad.length
              ? [
                  `Complete these first: ${bad.map((x) => `${x.b.name} (${x.issues.join(', ').toLowerCase()})`).join('; ')}.`,
                ]
              : [],
        };
      },
    },
    {
      id: 'staff',
      state: async () => {
        const [staff, accounts, done] = await Promise.all([
          this.db.staff.findMany({
            where: { status: 'ACTIVE', leftOn: null },
            select: { kind: true },
          }),
          this.db.schoolMembership.count({
            where: { staffId: { not: null }, status: { in: ['ACTIVE', 'INVITED', 'SUSPENDED'] } },
          }),
          this.setupState.isConfirmed('staff'),
        ]);
        const teachers = staff.filter((s) => s.kind === 'TEACHING').length;
        return {
          done,
          description: `${plural(staff.length, 'staff member')} · ${plural(teachers, 'teacher')} · ${accounts} with system accounts`,
          to: done ? { name: 'staff' } : { name: 'staff', query: fromSetup },
          blockers: teachers ? [] : ['Add at least one teacher so classes can be assigned.'],
        };
      },
    },
    {
      id: 'organogram-roles',
      state: async () => {
        const [positions, roles, done] = await Promise.all([
          this.db.position.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: { title: true, parentId: true, _count: { select: { holders: true } } },
          }),
          this.db.schoolRole.count({ where: { archivedAt: null } }),
          this.setupState.isConfirmed('organogram-roles'),
        ]);
        const top = positions.find((p) => !p.parentId);
        return {
          done,
          description: `${plural(positions.length, 'position')} · ${positions.filter((p) => !p._count.holders).length} vacant · ${plural(roles, 'role')}`,
          to: { name: 'organogram', query: fromSetup },
          blockers:
            positions.length < 2
              ? ['Add at least one position under the top of your organogram first.']
              : !top?._count.holders
                ? [`Assign someone to ${top?.title ?? 'the top position'} first.`]
                : [],
        };
      },
    },
  ];
}
