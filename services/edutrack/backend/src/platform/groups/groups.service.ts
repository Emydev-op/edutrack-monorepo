import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InvitationService } from '../../auth/invitation.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { GroupRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Each group role's account in the group's schools: their predefined School Admin role. */
const SCHOOL_ROLE: Record<GroupRole, string> = {
  OWNER: 'owner',
  FINANCE: 'bursar',
  ACADEMIC: 'academic_head',
};
export const GROUP_ROLE_LABEL: Record<GroupRole, string> = {
  OWNER: 'Group owner',
  FINANCE: 'Group finance',
  ACADEMIC: 'Group academic',
};
const ROLE_FROM_LABEL = Object.fromEntries(
  Object.entries(GROUP_ROLE_LABEL).map(([k, v]) => [v, k as GroupRole]),
) as Record<string, GroupRole>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * School groups (Back office › Groups): a proprietor's schools under one group, and the group's
 * staff. Group staff get a whole-school account in every school of the group, with their group
 * role's School Admin role, kept in step as schools join or leave and staff are added or removed
 * (accounts the school made itself are left alone). New people get one invitation; accepting it
 * opens all their group accounts.
 */
@Injectable()
export class GroupsService implements OnModuleInit {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    // Accepting any invitation opens the person's other group accounts.
    this.invitations.onAccepted(async (accepted) => {
      await this.prisma.schoolMembership.updateMany({
        where: { userId: accepted.userId, groupId: { not: null }, status: 'INVITED' },
        data: { status: 'ACTIVE', activatedAt: this.clock.now() },
      });
    });
  }

  private async find(id: string) {
    const g = await this.prisma.schoolGroup.findUnique({
      where: { id },
      include: {
        schools: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            subscription: { select: { plan: { select: { name: true } } } },
          },
        },
        staff: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
                passwordHash: true,
              },
            },
          },
        },
      },
    });
    if (!g) throw AppException.notFound('Group not found', 'GROUP_NOT_FOUND');
    return g;
  }

  private view(g: Awaited<ReturnType<GroupsService['find']>>) {
    return {
      id: g.id,
      name: g.name,
      schools: g.schools.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        plan: s.subscription?.plan.name ?? null,
      })),
      staff: g.staff.map((st) => ({
        id: st.id,
        userId: st.userId,
        name: `${st.user.firstName} ${st.user.lastName}`.trim(),
        email: st.user.email,
        role: GROUP_ROLE_LABEL[st.role],
        // Signed up once they've set a password (an invited person has none yet).
        status: st.user.status === 'ACTIVE' && st.user.passwordHash ? 'Active' : 'Invited',
      })),
    };
  }

  async list() {
    const groups = await this.prisma.schoolGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { schools: true, staff: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      schools: g._count.schools,
      staff: g._count.staff,
    }));
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async create(name: string) {
    const n = name.trim();
    if (!n) throw AppException.validation({ name: 'Name the group.' }, 'Name the group.');
    const taken = await this.prisma.schoolGroup.findFirst({
      where: { name: { equals: n, mode: 'insensitive' } },
    });
    if (taken)
      throw AppException.conflict('Another group already uses this name.', 'GROUP_NAME_TAKEN');
    const g = await this.prisma.schoolGroup.create({
      data: { name: n, createdById: RequestContext.get()?.userId ?? null },
    });
    return this.get(g.id);
  }

  async rename(id: string, name: string) {
    await this.find(id);
    const n = name.trim();
    if (!n) throw AppException.validation({ name: 'Name the group.' }, 'Name the group.');
    await this.prisma.schoolGroup.update({ where: { id }, data: { name: n } });
    return this.get(id);
  }

  /** Adds a school to the group (a school is in one group at most). */
  async addSchool(id: string, schoolId: string) {
    await this.find(id);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!school) throw AppException.notFound('School not found', 'SCHOOL_NOT_FOUND');
    if (school.group && school.group.id !== id)
      throw AppException.conflict(
        `${school.name} is already in ${school.group.name}. Remove it from there first.`,
        'SCHOOL_IN_GROUP',
      );
    await this.prisma.school.update({ where: { id: schoolId }, data: { groupId: id } });
    await this.sync(id);
    return this.get(id);
  }

  async removeSchool(id: string, schoolId: string) {
    await this.find(id);
    await this.prisma.school.updateMany({
      where: { id: schoolId, groupId: id },
      data: { groupId: null },
    });
    await this.sync(id);
    return this.get(id);
  }

  /** Adds a person to the group's staff (a new person gets an invitation). */
  async addStaff(id: string, input: { name: string; email: string; role: string }) {
    const g = await this.find(id);
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const role = ROLE_FROM_LABEL[input.role];
    const fields: Record<string, string> = {};
    if (!name) fields.name = 'Enter their full name.';
    if (!EMAIL.test(email)) fields.email = 'Enter a valid email.';
    if (!role) fields.role = 'Choose Group owner, Group finance or Group academic.';
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Check the highlighted fields.');
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const [firstName, ...rest] = name.split(/\s+/);
      user = await this.prisma.user.create({
        data: { email, firstName: firstName ?? name, lastName: rest.join(' ') },
      });
    }
    if (g.staff.some((s) => s.userId === user.id))
      throw AppException.conflict('They are already on the group’s staff.', 'GROUP_STAFF_EXISTS');
    await this.prisma.groupStaff.create({ data: { groupId: id, userId: user.id, role } });
    await this.sync(id);
    return this.get(id);
  }

  async updateStaff(id: string, staffId: string, roleLabel: string) {
    const role = ROLE_FROM_LABEL[roleLabel];
    if (!role)
      throw AppException.validation(
        { role: 'Choose Group owner, Group finance or Group academic.' },
        'Choose a group role.',
      );
    const res = await this.prisma.groupStaff.updateMany({
      where: { id: staffId, groupId: id },
      data: { role },
    });
    if (!res.count) throw AppException.notFound('Group staff member not found', 'NOT_FOUND');
    await this.sync(id);
    return this.get(id);
  }

  async removeStaff(id: string, staffId: string) {
    const res = await this.prisma.groupStaff.deleteMany({ where: { id: staffId, groupId: id } });
    if (!res.count) throw AppException.notFound('Group staff member not found', 'NOT_FOUND');
    await this.sync(id);
    return this.get(id);
  }

  /**
   * Keeps every group staff member's accounts in step with the group: an account in each school
   * with their role (active once they've signed up, else invited), and group accounts at schools
   * that left, or for people who left, deactivated. Someone new gets one invitation.
   */
  async sync(groupId: string) {
    const g = await this.find(groupId);
    const schoolIds = g.schools.map((s) => s.id);
    const now = this.clock.now();
    const invite: { invitationId: string }[] = [];
    for (const st of g.staff) {
      const signedUp = st.user.status === 'ACTIVE' && !!st.user.passwordHash;
      let invited = false;
      for (const schoolId of schoolIds) {
        const role = await this.prisma.schoolRole.findFirst({
          where: { schoolId, key: SCHOOL_ROLE[st.role], archivedAt: null },
          select: { id: true, name: true },
        });
        if (!role) continue;
        const existing = await this.prisma.schoolMembership.findFirst({
          where: { schoolId, userId: st.userId, kind: 'STAFF' },
        });
        // The school's own account for them stays as the school set it.
        if (existing && existing.groupId !== groupId) continue;
        const status = signedUp ? ('ACTIVE' as const) : ('INVITED' as const);
        const membership = existing
          ? await this.prisma.schoolMembership.update({
              where: { id: existing.id },
              data: {
                status,
                scope: 'SCHOOL',
                statusReason: null,
                ...(signedUp && !existing.activatedAt && { activatedAt: now }),
                roles: { deleteMany: {}, create: { roleId: role.id } },
              },
            })
          : await this.prisma.schoolMembership.create({
              data: {
                schoolId,
                userId: st.userId,
                kind: 'STAFF',
                scope: 'SCHOOL',
                status,
                groupId,
                invitedAt: now,
                activatedAt: signedUp ? now : null,
                roles: { create: { roleId: role.id } },
              },
            });
        if (!signedUp && !invited) {
          const pending = await this.prisma.invitation.findFirst({
            where: { userId: st.userId, status: 'PENDING', expiresAt: { gt: now } },
          });
          if (!pending) {
            const inv = await this.prisma.invitation.create({
              data: {
                kind: 'SCHOOL_STAFF',
                email: st.user.email!,
                userId: st.userId,
                schoolId,
                membershipId: membership.id,
                position: GROUP_ROLE_LABEL[st.role],
                invitedById: RequestContext.get()?.userId ?? null,
                tokenHash: `pending:${randomUUID()}`,
                expiresAt: now,
              },
            });
            invite.push({ invitationId: inv.id });
          }
          invited = true;
        }
      }
    }
    // Group accounts that no longer apply: deactivated (their history stays).
    const staffUsers = g.staff.map((s) => s.userId);
    await this.prisma.schoolMembership.updateMany({
      where: {
        groupId,
        status: { not: 'DEACTIVATED' },
        OR: [{ schoolId: { notIn: schoolIds } }, { userId: { notIn: staffUsers } }],
      },
      data: { status: 'DEACTIVATED', statusReason: 'No longer part of the school group.' },
    });
    for (const i of invite)
      await this.invitations.send(i.invitationId).catch((error: unknown) => {
        this.logger.warn({ msg: 'Group invitation not sent', error: String(error) });
      });
  }
}
