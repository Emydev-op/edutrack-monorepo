import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InvitationService } from '../../auth/invitation.service.js';
import { isCurrentStudent } from '../../auth/school-portal-rules.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { grants, splitName } from '../users/access.js';
import type { InviteGuardiansDto } from './dto/guardians.dto.js';
import { displayPhone, matchesClass, placements } from './family-records.js';
import {
  guardianInclude,
  GuardiansService,
  LIVE_GUARDIAN,
  type GuardianWithLinks,
} from './guardians.service.js';

/** A guardian who couldn't be invited, and why (for the bulk answer). */
export class InviteRefused extends AppException {}

const refuse = (status: HttpStatus, message: string, code: string) =>
  new InviteRefused(status, message, code);

const HOLDS_ACCESS = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;

/**
 * Parent Portal accounts. Never created at admission: the school invites guardians when it is
 * ready, one at a time or in bulk. One parent has one EduTrack login across schools: an invitation
 * reuses the User that already has the guardian's phone number or email, and adds a GUARDIAN
 * membership at this school (Guardian → SchoolMembership → User). Each school only ever sees its
 * own guardian records; on its address the parent only sees that school's children.
 *
 * The link goes by SMS to the guardian's phone and by email when they have one
 * (`InvitationService.send`).
 */
@Injectable()
export class GuardianAccountsService {
  private readonly logger = new Logger(GuardianAccountsService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly guardians: GuardiansService,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** "Add guardian" with "Invite to parent portal" also needs the invite permission. */
  async requireInvitePermission() {
    const ctx = RequestContext.get();
    const m = await this.db.schoolMembership.findFirst({
      where: { id: ctx?.membershipId ?? '', userId: ctx?.userId ?? '', status: 'ACTIVE' },
      select: { roles: { select: { role: { select: { permissions: true, archivedAt: true } } } } },
    });
    const maps = (m?.roles ?? []).filter((r) => !r.role.archivedAt).map((r) => r.role.permissions);
    if (!grants(maps, 'settings.users'))
      throw AppException.forbidden(
        'Only Users & Roles managers can send Parent Portal invitations.',
      );
  }

  /** Invites (or re-sends to) one guardian. Returns how the link went out, for the message. */
  async inviteOne(id: string): Promise<{ sentTo: string; resent: boolean }> {
    const g = await this.guardians.load(id);
    const { invitationId, resent } = await this.db.$transaction((tx) => this.prepare(tx, g));
    await this.deliver(invitationId, resent);
    return { sentTo: this.destination(g), resent };
  }

  /**
   * Bulk: the listed guardians, or everyone without an account (optionally only those with a
   * child in a class or branch). Guardians who can't be invited are listed with the reason.
   */
  async inviteMany(dto: InviteGuardiansDto) {
    const where: Prisma.GuardianWhereInput = {
      ...LIVE_GUARDIAN,
      ...(dto.ids
        ? { id: { in: dto.ids.filter(isUuid) } }
        : { OR: [{ membership: null }, { membership: { status: 'REVOKED' } }] }),
      ...(dto.branchId && { students: { some: { student: { branchId: dto.branchId } } } }),
    };
    let list = await this.db.guardian.findMany({
      where,
      include: guardianInclude,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
    if (dto.className) {
      const places = await placements(
        this.db,
        list.flatMap((g) => g.students.map((l) => l.studentId)),
      );
      list = list.filter((g) =>
        g.students.some(
          (l) =>
            isCurrentStudent(l.student) && matchesClass(places.get(l.studentId), dto.className),
        ),
      );
    }
    let invited = 0;
    const sentTo: string[] = [];
    const skipped: { id: string; name: string; reason: string }[] = [];
    for (const g of list) {
      try {
        const { invitationId, resent } = await this.db.$transaction((tx) => this.prepare(tx, g));
        await this.deliver(invitationId, resent);
        invited += 1;
        sentTo.push(this.destination(g));
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        skipped.push({ id: g.id, name: g.fullName, reason: error.message });
      }
    }
    return { invited, skipped, sentTo };
  }

  /** Withdraws a pending invitation; the guardian is back to "No account". */
  async revoke(id: string) {
    const g = await this.guardians.load(id);
    const m = g.membership;
    if (!m || m.status !== 'INVITED')
      throw AppException.conflict(
        `${g.fullName} has no pending invitation.`,
        'NO_PENDING_INVITATION',
      );
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      await tx.schoolMembership.update({
        where: { id: m.id },
        data: { status: 'REVOKED', statusReason: 'Invitation withdrawn' },
      });
      await tx.invitation.updateMany({
        where: { membershipId: m.id, status: { in: ['PENDING', 'EXPIRED'] } },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await this.audit.record(
        {
          action: 'guardian.invite.revoke',
          area: 'Students',
          entity: 'Guardian',
          entityId: g.id,
          summary: `Parent Portal invitation to ${g.fullName} withdrawn`,
        },
        asTx(tx),
      );
    });
  }

  /** Ends a parent's sessions at this school (merges, closed accounts). */
  async endParentSessions(userId: string) {
    const live = await this.db.authSession.findMany({
      where: { userId, portal: 'PARENT', revokedAt: null },
      select: { id: true },
    });
    for (const s of live) await this.sessions.revoke(s.id, 'access_lost');
  }

  private destination(g: { phone: string | null; email: string | null }) {
    return [g.phone && displayPhone(g.phone), g.email].filter(Boolean).join(' and ');
  }

  /**
   * Inside a transaction: finds or creates the parent's User, the GUARDIAN membership (INVITED)
   * and a pending invitation. A pending invitation is re-sent instead.
   */
  private async prepare(
    tx: TenantTx,
    g: GuardianWithLinks,
  ): Promise<{ invitationId: string; resent: boolean }> {
    const schoolId = RequestContext.schoolId()!;
    const now = this.clock.now();
    const own = g.membership;
    if (own?.status === 'ACTIVE')
      throw refuse(
        HttpStatus.CONFLICT,
        `${g.fullName} already has a Parent Portal account.`,
        'ALREADY_ACTIVE',
      );
    if (own?.status === 'SUSPENDED')
      throw refuse(
        HttpStatus.CONFLICT,
        `${g.fullName}’s Parent Portal account is suspended.`,
        'ACCOUNT_SUSPENDED',
      );
    if (!g.phone && !g.email)
      throw refuse(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'No phone number or email to send the invitation to.',
        'NO_CONTACT',
      );
    const current = g.students.filter((l) => isCurrentStudent(l.student));
    if (!current.length)
      throw refuse(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'None of their children are at the school now.',
        'NO_CURRENT_CHILD',
      );

    // A pending invitation: send it again with a fresh link.
    const pending = own?.status === 'INVITED' ? own.invitations[0] : undefined;
    if (pending && pending.email === g.email && pending.phone === g.phone)
      return { invitationId: pending.id, resent: true };

    // One login per parent: whoever already has this phone number or email.
    const [byPhone, byEmail] = await Promise.all([
      g.phone ? tx.user.findUnique({ where: { phone: g.phone } }) : null,
      g.email ? tx.user.findUnique({ where: { email: g.email } }) : null,
    ]);
    if (byPhone && byEmail && byPhone.id !== byEmail.id)
      throw refuse(
        HttpStatus.CONFLICT,
        'Their phone number and email belong to two different EduTrack accounts. Correct one of them first.',
        'ACCOUNT_CONFLICT',
      );
    let user = byPhone ?? byEmail;
    if (!user && own) {
      // Re-inviting after a withdrawn invitation, with new contact details.
      const previous = await tx.user.findUnique({ where: { id: own.userId } });
      if (previous && !previous.passwordHash) user = previous;
    }
    if (user && user.status !== 'ACTIVE')
      throw refuse(
        HttpStatus.CONFLICT,
        'This person’s EduTrack account is blocked.',
        'ACCOUNT_BLOCKED',
      );

    let membershipId: string | null = own && (!user || own.userId === user.id) ? own.id : null;
    if (own && !membershipId) {
      // This record's earlier (withdrawn or closed) account belongs to someone else: let it go.
      if (HOLDS_ACCESS.includes(own.status as (typeof HOLDS_ACCESS)[number]))
        throw refuse(
          HttpStatus.CONFLICT,
          `${g.fullName}’s phone number or email changed while an invitation was pending. Withdraw it first.`,
          'INVITATION_PENDING',
        );
      await tx.schoolMembership.delete({ where: { id: own.id } });
    }
    if (user && !membershipId) {
      const theirs = await tx.schoolMembership.findUnique({
        where: { schoolId_userId_kind: { schoolId, userId: user.id, kind: 'GUARDIAN' } },
        include: { guardian: { select: { fullName: true, mergedIntoId: true } } },
      });
      if (theirs) {
        if (
          HOLDS_ACCESS.includes(theirs.status as (typeof HOLDS_ACCESS)[number]) &&
          !theirs.guardian?.mergedIntoId
        )
          throw refuse(
            HttpStatus.CONFLICT,
            `This parent already has an account here as ${theirs.guardian?.fullName ?? 'another guardian'}. Merge the two records first.`,
            'GUARDIAN_DUPLICATE',
          );
        // A closed account of the same person on another record moves to this one.
        await tx.schoolMembership.update({
          where: { id: theirs.id },
          data: { guardianId: g.id },
        });
        membershipId = theirs.id;
      }
    }
    if (!user) {
      const parts = splitName(g.fullName);
      user = await tx.user.create({
        data: {
          phone: g.phone,
          email: g.email,
          title: g.title ?? parts.title,
          firstName: parts.firstName,
          lastName: parts.lastName,
        },
      });
    }

    const fields = {
      status: 'INVITED' as const,
      invitedAt: now,
      activatedAt: null,
      statusReason: null,
    };
    const membership = membershipId
      ? await tx.schoolMembership.update({ where: { id: membershipId }, data: fields })
      : await tx.schoolMembership.create({
          data: { schoolId, userId: user.id, kind: 'GUARDIAN', guardianId: g.id, ...fields },
        });
    await tx.invitation.updateMany({
      where: { membershipId: membership.id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'REVOKED', revokedAt: now },
    });
    const children = current.map((l) => l.student.firstName);
    const invitation = await tx.invitation.create({
      data: {
        kind: 'GUARDIAN',
        email: g.email,
        phone: g.phone,
        userId: user.id,
        schoolId,
        membershipId: membership.id,
        position: `Parent of ${children.join(' and ').replace(/ and (?=.* and )/g, ', ')}`,
        invitedById: RequestContext.get()?.userId ?? null,
        // Replaced with a real token hash when the link is sent.
        tokenHash: `pending:${randomUUID()}`,
        expiresAt: now,
      },
    });
    await this.audit.record(
      {
        action: 'guardian.invite',
        area: 'Students',
        entity: 'Guardian',
        entityId: g.id,
        summary: `${g.fullName} invited to the Parent Portal`,
        detail: `Sent to ${this.destination(g)}`,
        after: { userId: user.id, reusedAccount: !!user.passwordHash },
      },
      asTx(tx),
    );
    return { invitationId: invitation.id, resent: false };
  }

  /** Sends through the shared invitation service; a delivery outage is a 502 the screen can show. */
  private async deliver(invitationId: string, resend: boolean) {
    try {
      await this.invitations.send(invitationId, { resend });
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.warn({ msg: 'Guardian invitation not sent', invitationId, error: String(error) });
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'We couldn’t send the invitation. Try again in a few minutes.',
        'INVITATION_NOT_SENT',
      );
    }
  }
}
