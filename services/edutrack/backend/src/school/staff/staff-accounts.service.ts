import { PlanLimitsService } from '../shared/plan-limits.service.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InvitationService } from '../../auth/invitation.service.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { defaultRole, displayName, HOLDS_ACCESS, KIND_LABEL } from './staff-view.js';
import { isUuid, StaffRecordsService, type Db, type Tx } from './staff-records.service.js';
import { asAuditDb } from './staff-audit.js';

/** A staff record as an invitation needs it. */
export interface InviteeStaff {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  positionTitle: string | null;
  allBranches: boolean;
  branchIds: string[];
}

export interface InviteResult {
  invited: number;
  skipped: string[];
}

/**
 * Edutrack accounts for staff: an invitation creates (or reuses) the person's User, a STAFF
 * membership in INVITED state with the role and branch scope, and an Invitation that
 * `InvitationService.send` emails (so the accept page and email are the same as everywhere else).
 * Deactivating ends access: the membership is deactivated (or the invitation withdrawn) and every
 * session the person has open at this school is revoked.
 */
@Injectable()
export class StaffAccountsService {
  private readonly logger = new Logger(StaffAccountsService.name);

  constructor(
    private readonly records: StaffRecordsService,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
    private readonly limits: PlanLimitsService,
  ) {}

  /**
   * Creates the account and a pending invitation inside `tx`; returns the invitation id to send
   * once the transaction commits. Throws ALREADY_MEMBER when the email already has access here.
   */
  async createInvitation(tx: Tx, staff: InviteeStaff, roleIds: string[]): Promise<string> {
    await this.limits.requireUser(tx as unknown as TenantTx);
    const schoolId = this.records.schoolId();
    const email = staff.email;
    if (!email)
      throw AppException.validation(
        { email: 'An email is needed to send the invitation.' },
        'An email is needed to send the invitation.',
      );
    const now = this.clock.now();
    const user =
      (await tx.user.findUnique({ where: { email } })) ??
      (await tx.user.create({
        data: {
          email,
          title: staff.title,
          firstName: staff.firstName,
          lastName: staff.lastName,
        },
      }));
    const existing = await tx.schoolMembership.findFirst({
      where: { userId: user.id, kind: 'STAFF' },
      select: { id: true, status: true, staffId: true },
    });
    if (existing && HOLDS_ACCESS.includes(existing.status))
      throw AppException.conflict(`${email} already has access to this school.`, 'ALREADY_MEMBER');
    // A withdrawn or ended account of someone else may still point at this staff record.
    await tx.schoolMembership.updateMany({
      where: { staffId: staff.id, ...(existing && { id: { not: existing.id } }) },
      data: { staffId: null },
    });
    const scope = staff.allBranches ? ('SCHOOL' as const) : ('BRANCH' as const);
    const fields = {
      status: 'INVITED' as const,
      scope,
      staffId: staff.id,
      invitedAt: now,
      activatedAt: null,
      statusReason: null,
    };
    const membership = existing
      ? await tx.schoolMembership.update({ where: { id: existing.id }, data: fields })
      : await tx.schoolMembership.create({
          data: { schoolId, userId: user.id, kind: 'STAFF', ...fields },
        });
    await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await tx.membershipRole.createMany({
      data: roleIds.map((roleId) => ({ schoolId, membershipId: membership.id, roleId })),
    });
    await tx.membershipBranch.deleteMany({ where: { membershipId: membership.id } });
    if (scope === 'BRANCH')
      await tx.membershipBranch.createMany({
        data: staff.branchIds.map((branchId) => ({
          schoolId,
          membershipId: membership.id,
          branchId,
        })),
      });
    await tx.invitation.updateMany({
      where: { membershipId: membership.id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'REVOKED', revokedAt: now },
    });
    const invitation = await tx.invitation.create({
      data: {
        kind: 'SCHOOL_STAFF',
        email,
        userId: user.id,
        schoolId,
        membershipId: membership.id,
        position: staff.positionTitle,
        invitedById: RequestContext.get()?.userId ?? null,
        // Replaced with a real token hash when the link is sent.
        tokenHash: `pending:${randomUUID()}`,
        expiresAt: now,
      },
    });
    return invitation.id;
  }

  /** Withdraws an invitation that hasn't been accepted (the membership becomes REVOKED). */
  async withdrawInvitation(tx: Db, membershipId: string) {
    const now = this.clock.now();
    await tx.schoolMembership.update({
      where: { id: membershipId },
      data: { status: 'REVOKED', statusReason: 'Invitation cancelled' },
    });
    await tx.invitation.updateMany({
      where: { membershipId, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'REVOKED', revokedAt: now },
    });
  }

  /** Sends invitations created in a committed transaction; a failed send is logged, not thrown. */
  async send(invitationIds: string[], { resend = false } = {}) {
    for (const id of invitationIds)
      await this.invitations.send(id, { resend }).catch((error: unknown) => {
        this.logger.warn({
          msg: 'Staff invitation not sent',
          invitationId: id,
          error: String(error),
        });
      });
  }

  /** Ends every session the user has open at this school (other schools are untouched). */
  async endSessions(userId: string) {
    const schoolId = this.records.schoolId();
    const live = await this.sessions.listActive(userId);
    for (const s of live.filter((x) => x.schoolId === schoolId))
      await this.sessions.revoke(s.id, 'access_lost');
  }

  /**
   * `POST /v1/staff/invite`: invites each person with the usual role for their position, or
   * resends a pending invitation. People with no email, an account already, or no obvious role
   * are skipped (invite them from their profile).
   */
  async inviteMany(ids: string[]): Promise<InviteResult & { emails: string[] }> {
    const db = this.records.db;
    const roles = await db.schoolRole.findMany({
      where: { archivedAt: null, NOT: { key: 'owner' } },
      select: { id: true, name: true },
    });
    const invited: string[] = [];
    const emails: string[] = [];
    const skipped: string[] = [];
    const toSend: string[] = [];
    const toResend: string[] = [];
    for (const id of new Set(ids)) {
      if (!isUuid(id)) continue;
      const s = await db.staff.findUnique({
        where: { id },
        include: {
          branches: { select: { branchId: true } },
          membership: { select: { id: true, status: true } },
        },
      });
      if (!s || s.status !== 'ACTIVE') continue;
      const name = displayName(s.title, s.firstName, s.lastName);
      const m = s.membership && s.membership.status !== 'REVOKED' ? s.membership : null;
      if (m?.status === 'INVITED') {
        const pending = await db.invitation.findFirst({
          where: { membershipId: m.id, status: { in: ['PENDING', 'EXPIRED'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (!pending) {
          skipped.push(name);
          continue;
        }
        toResend.push(pending.id);
        invited.push(name);
        emails.push(s.email ?? '');
        await this.audit.record({
          action: 'staff.invite',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: 'Invitation resent',
          detail: s.email,
        });
        continue;
      }
      const roleName = defaultRole(s.positionTitle ?? '', KIND_LABEL[s.kind]);
      const role = roleName && roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
      if (m || !s.email || !role) {
        skipped.push(name);
        continue;
      }
      try {
        const invitationId = await db.$transaction(async (tx) => {
          const invitationId = await this.createInvitation(
            tx,
            { ...s, branchIds: s.branches.map((b) => b.branchId) },
            [role.id],
          );
          await this.audit.record(
            {
              action: 'staff.invite',
              area: 'Staff',
              entity: 'Staff',
              entityId: s.id,
              summary: 'Invitation sent',
              detail: `${s.email} · ${role.name}`,
            },
            asAuditDb(tx),
          );
          return invitationId;
        });
        toSend.push(invitationId);
        invited.push(name);
        emails.push(s.email ?? '');
      } catch (error) {
        if (error instanceof AppException && error.code === 'ALREADY_MEMBER') skipped.push(name);
        else throw error;
      }
    }
    await this.send(toSend);
    await this.send(toResend, { resend: true });
    if (invited.length)
      await this.audit.record({
        action: 'staff.invite_many',
        area: 'Staff',
        entity: 'Staff',
        summary: `${invited.length} invitation${invited.length === 1 ? '' : 's'} sent`,
        detail: invited.join(', '),
      });
    return { invited: invited.length, skipped, emails };
  }
}
