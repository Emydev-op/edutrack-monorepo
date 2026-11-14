import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { schoolInclude, toSchoolView } from '../schools/school-view.js';
import { SchoolsService } from '../schools/schools.service.js';
import { permissionsOf, STAFF_STATUS_LABEL } from '../shared/staff.js';

/** Results per kind; the command menu shows at most nine. */
const PER_KIND = 3;

/** `WAITING_FOR_SCHOOL` → `Waiting for school`. */
const sentenceCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * The command menu (⌘K): schools, staff and support issues matching the text, limited to what
 * the signed-in staff member may see.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async search(raw: string | undefined) {
    const userId = RequestContext.get()?.userId;
    const staff = userId
      ? await this.prisma.platformStaff.findUnique({
          where: { userId },
          select: { role: { select: { permissions: true } } },
        })
      : null;
    if (!staff) return [];
    const can = permissionsOf(staff.role);
    const q = (raw ?? '').trim().slice(0, 100);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [schools, users, issues] = await Promise.all([
      can.has('Schools.View')
        ? this.prisma.school.findMany({
            where: q
              ? {
                  OR: [
                    { name: contains },
                    { legalName: contains },
                    { slug: contains },
                    { state: contains },
                  ],
                }
              : {},
            include: schoolInclude,
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : [],
      can.has('Users.View')
        ? this.prisma.platformStaff.findMany({
            where: q
              ? {
                  user: {
                    OR: [{ firstName: contains }, { lastName: contains }, { email: contains }],
                  },
                }
              : {},
            include: { user: true, role: true },
            orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
            take: PER_KIND,
          })
        : [],
      can.has('Support.View')
        ? this.prisma.supportTicket.findMany({
            where: q ? { OR: [{ number: contains }, { subject: contains }] } : {},
            include: { school: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: PER_KIND,
          })
        : [],
    ]);

    return [
      ...schools.map((s) => {
        const view = toSchoolView(s, this.schools.baseDomain);
        return {
          id: s.id,
          type: 'School' as const,
          title: s.name,
          meta: `${view.type} · ${view.plan} · ${view.status}`,
          to: `/schools/${s.id}`,
        };
      }),
      ...users.map((s) => ({
        id: s.userId,
        type: 'User' as const,
        title: `${s.user.firstName} ${s.user.lastName}`,
        meta: `${s.role.name} · ${s.user.email ?? ''}${s.status === 'ACTIVE' ? '' : ` · ${STAFF_STATUS_LABEL[s.status]}`}`,
        to: `/users/${s.userId}`,
      })),
      ...issues.map((t) => ({
        id: t.number,
        type: 'Issue' as const,
        title: `${t.number} · ${t.subject}`,
        meta: `${t.school.name} · ${sentenceCase(t.status)}`,
        to: `/support/${t.number}`,
      })),
    ];
  }
}
