import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GROUP_ROLE_LABEL } from '../../platform/groups/groups.service.js';
import { ON_ROLL } from '../students/student-view.js';
import { BILLED } from './group-reports.service.js';

const naira = (kobo: bigint | null | undefined) => Number(kobo ?? 0n) / 100;

/**
 * School Admin › Group overview, for a proprietor's group staff: every school of the group side by
 * side (students on roll, staff, branches, plan and subscription, and this term's fees for the
 * owner and finance), with totals. Read across the group's schools only, never others.
 */
@Injectable()
export class GroupOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in person's group (as group staff), or null. */
  async groupOf(userId: string) {
    return this.prisma.groupStaff.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { group: { select: { id: true, name: true } } },
    });
  }

  async overview(auth: AuthUserContext) {
    const membership = await this.groupOf(auth.userId);
    if (!membership)
      throw AppException.forbidden(
        'The group overview is for the school group’s own staff.',
        'NOT_GROUP_STAFF',
      );
    const seesFees = membership.role !== 'ACADEMIC';
    const schools = await this.prisma.school.findMany({
      where: { groupId: membership.groupId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        brandColor: true,
        subscription: { select: { status: true, plan: { select: { name: true } } } },
      },
    });
    const rows = await Promise.all(
      schools.map(async (s) => {
        const term = await this.prisma.term.findFirst({
          where: { schoolId: s.id, status: 'ACTIVE' },
          select: { id: true, name: true, session: { select: { name: true } } },
        });
        const [students, staff, branches, fees] = await Promise.all([
          this.prisma.student.count({
            where: { schoolId: s.id, status: { in: ON_ROLL }, deletedAt: null },
          }),
          this.prisma.staff.count({ where: { schoolId: s.id, status: 'ACTIVE' } }),
          this.prisma.branch.count({ where: { schoolId: s.id, status: 'ACTIVE' } }),
          seesFees && term
            ? this.prisma.invoice.aggregate({
                where: { schoolId: s.id, termId: term.id, status: { in: BILLED } },
                _sum: { totalKobo: true, paidKobo: true },
              })
            : null,
        ]);
        const billed = naira(fees?._sum.totalKobo);
        const collected = naira(fees?._sum.paidKobo);
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          brandColor: s.brandColor,
          status: s.status,
          plan: s.subscription?.plan.name ?? null,
          subscription: s.subscription?.status ?? null,
          term: term ? `${term.session.name} · ${term.name}` : null,
          students,
          staff,
          branches,
          fees: seesFees
            ? { billed, collected, outstanding: Math.max(0, billed - collected) }
            : null,
        };
      }),
    );
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    return {
      group: { id: membership.group.id, name: membership.group.name },
      role: GROUP_ROLE_LABEL[membership.role],
      schools: rows,
      totals: {
        schools: rows.length,
        students: sum((r) => r.students),
        staff: sum((r) => r.staff),
        branches: sum((r) => r.branches),
        fees: seesFees
          ? {
              billed: sum((r) => r.fees?.billed ?? 0),
              collected: sum((r) => r.fees?.collected ?? 0),
              outstanding: sum((r) => r.fees?.outstanding ?? 0),
            }
          : null,
      },
    };
  }
}
