import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { ROLE_DISPLAY_ORDER } from '../../auth/permissions/school-permissions.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { fromIso } from '../academics/academic-format.js';
import { atLabel, localDay, localStamp } from '../communication/comms-time.js';
import { TeacherScopeService } from '../teacher/teacher-scope.service.js';

const AUDIENCE = {
  EVERYONE: 'Whole school',
  TEACHERS: 'Teachers',
  STAFF: 'All staff',
} as const;
type StaffAudience = keyof typeof AUDIENCE;

/**
 * The Teacher Workspace's announcements feed: what School Admin › Communication sent to
 * everyone, to teachers or to all staff, school-wide or on a campus the teacher works on, while
 * it is live (not withdrawn, not past its last day). Announcements for parents, students or
 * chosen classes go to families and don't show here.
 */
@Injectable()
export class TeacherAnnouncementsService {
  constructor(
    private readonly scope: TeacherScopeService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.scope.db;
  }

  private async where(auth: AuthUserContext): Promise<Prisma.AnnouncementWhereInput> {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term().catch(() => null);
    const assignments = term ? await this.scope.assignments(s.id, term.id) : [];
    const branchIds = [
      ...new Set([...s.branches.map((b) => b.branchId), ...assignments.map((a) => a.arm.branchId)]),
    ];
    const today = fromIso(localDay(this.clock.now()));
    return {
      status: 'SENT',
      withdrawnAt: null,
      audienceKind: { in: Object.keys(AUDIENCE) as StaffAudience[] },
      AND: [
        { OR: [{ expiresOn: null }, { expiresOn: { gte: today } }] },
        s.allBranches
          ? {}
          : { OR: [{ audienceBranchId: null }, { audienceBranchId: { in: branchIds } }] },
      ],
    };
  }

  private async views(
    rows: Prisma.AnnouncementGetPayload<{
      include: { audienceBranch: { select: { name: true } } };
    }>[],
  ) {
    const userIds = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
    const [members, school] = await Promise.all([
      userIds.length
        ? this.db.schoolMembership.findMany({
            where: { userId: { in: userIds }, kind: 'STAFF' },
            include: {
              user: { select: { id: true, title: true, firstName: true, lastName: true } },
              staff: { select: { positionTitle: true } },
              roles: { include: { role: { select: { key: true, name: true } } } },
            },
          })
        : [],
      this.db.school.findFirst({
        where: { id: RequestContext.schoolId() },
        select: { name: true },
      }),
    ]);
    const now = this.clock.now();
    return rows.map((a) => {
      const m = members.find((x) => x.userId === a.createdById);
      const role = m?.roles
        .map((r) => r.role)
        .sort(
          (x, y) =>
            (ROLE_DISPLAY_ORDER.indexOf(x.key ?? '') + 1 || 99) -
            (ROLE_DISPLAY_ORDER.indexOf(y.key ?? '') + 1 || 99),
        )[0]?.name;
      const sentAt = a.sentAt ?? a.createdAt;
      return {
        id: a.id,
        title: a.title,
        summary: a.body.split('\n')[0]!.slice(0, 180),
        audience: AUDIENCE[a.audienceKind as StaffAudience],
        campuses: a.audienceBranch?.name ?? 'All campuses',
        author: m
          ? [m.user.title, m.user.firstName, m.user.lastName].filter(Boolean).join(' ')
          : (school?.name ?? 'The school office'),
        authorRole: m?.staff?.positionTitle || role || 'School office',
        publishedAt: localStamp(sentAt),
        when: atLabel(sentAt, now),
        pinned: false,
        body: a.body,
      };
    });
  }

  async list(auth: AuthUserContext, search?: string) {
    const rows = await this.db.announcement.findMany({
      where: await this.where(auth),
      include: { audienceBranch: { select: { name: true } } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const q = (search ?? '').trim().toLowerCase();
    return (await this.views(rows))
      .filter((a) => !q || `${a.title} ${a.body} ${a.author}`.toLowerCase().includes(q))
      .map(({ body: _body, ...summary }) => summary);
  }

  async get(auth: AuthUserContext, id: string) {
    const row = await this.db.announcement.findFirst({
      where: { ...(await this.where(auth)), id },
      include: { audienceBranch: { select: { name: true } } },
    });
    if (!row) throw AppException.notFound('That announcement doesn’t exist.', 'NOT_FOUND');
    return (await this.views([row]))[0]!;
  }
}
