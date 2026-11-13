import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, DAY } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import type { Prisma } from '../generated/prisma/client.js';
import { Portal } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AcceptInvitationDto } from './dto/auth.dto.js';
import { normalizePhone } from './identifiers.js';
import {
  hashPassword,
  meetsPasswordPolicy,
  PASSWORD_POLICY_MESSAGE,
  verifyPassword,
} from './password.js';
import { opensPortal, membershipInclude } from './portal-access.service.js';
import { PortalLinksService } from './portal-links.service.js';
import { randomToken, sha256 } from './tokens.js';

const invitationInclude = {
  user: true,
  school: true,
  membership: { include: membershipInclude },
  platformStaff: { include: { role: true } },
} satisfies Prisma.InvitationInclude;

type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

/**
 * Invitation links: look one up for the accept page, accept it (activates the membership or
 * platform-staff row and sets the password), and (re)send one with a fresh token.
 */
@Injectable()
export class InvitationService {
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly links: PortalLinksService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlDays = config.get('INVITATION_TTL_DAYS', { infer: true });
  }

  private async load(token: string): Promise<InvitationRow> {
    const invitation =
      token.length > 0 && token.length <= 200
        ? await this.prisma.invitation.findUnique({
            where: { tokenHash: sha256(token) },
            include: invitationInclude,
          })
        : null;
    if (!invitation)
      throw AppException.notFound('This invitation link isn’t valid.', 'INVITATION_INVALID');
    if (invitation.status === 'REVOKED')
      throw AppException.gone('This invitation was withdrawn.', 'INVITATION_REVOKED');
    if (
      invitation.status === 'EXPIRED' ||
      (invitation.status === 'PENDING' && invitation.expiresAt <= this.clock.now())
    )
      throw AppException.gone('This invitation has expired.', 'INVITATION_EXPIRED');
    return invitation;
  }

  /** What the accept page shows. Fields cover the School Admin, Teacher and back-office pages. */
  async lookup(token: string) {
    const inv = await this.load(token);
    const staff = inv.membership?.staff;
    const roleNames = inv.membership
      ? inv.membership.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.name)
      : inv.platformStaff
        ? [inv.platformStaff.role.name]
        : [];
    const position = inv.position ?? staff?.positionTitle ?? roleNames[0] ?? null;
    const daysLeft = Math.ceil((inv.expiresAt.getTime() - this.clock.nowMs()) / DAY);
    return {
      token,
      kind: inv.kind.toLowerCase(),
      status: inv.status === 'ACCEPTED' ? ('accepted' as const) : ('pending' as const),
      email: inv.email ?? inv.user.email ?? '',
      firstName: inv.user.firstName,
      lastName: inv.user.lastName,
      title: staff?.title ?? inv.user.title ?? '',
      position: position ?? '',
      roleName: roleNames.join(', '),
      department: staff?.department?.name ?? null,
      schoolName: inv.school?.name ?? 'EduTrack',
      invitedBy: await this.inviterLabel(inv),
      expiresAt: inv.expiresAt.toISOString(),
      expiresOn: DATE.format(inv.expiresAt),
      expiresIn: daysLeft <= 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`,
    };
  }

  private async inviterLabel(inv: InvitationRow): Promise<string> {
    if (!inv.invitedById) return inv.school?.name ?? 'EduTrack';
    const inviter = await this.prisma.user.findUnique({
      where: { id: inv.invitedById },
      include: {
        memberships: {
          where: { schoolId: inv.schoolId ?? undefined, kind: 'STAFF' },
          include: { staff: true },
        },
        platformStaff: { include: { role: true } },
      },
    });
    if (!inviter) return inv.school?.name ?? 'EduTrack';
    const staff = inviter.memberships[0]?.staff;
    const name = [staff?.title ?? inviter.title, inviter.firstName, inviter.lastName]
      .filter(Boolean)
      .join(' ');
    const role = inv.schoolId ? staff?.positionTitle : inviter.platformStaff?.role.name;
    return role ? `${name} · ${role}` : name;
  }

  async accept(token: string, dto: AcceptInvitationDto): Promise<{ email: string; name: string }> {
    const inv = await this.load(token);
    if (inv.status === 'ACCEPTED')
      throw AppException.conflict('This invitation has already been accepted.', 'INVITATION_USED');

    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone)
      throw AppException.validation({ phone: 'Enter a mobile number, like 0803 412 7781.' });
    if (phone && phone !== inv.user.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phone } });
      if (taken && taken.id !== inv.userId)
        throw AppException.validation({
          phone: 'This phone number is already used by another EduTrack account.',
        });
    }

    // Someone who already has an EduTrack password (invited to a second school) confirms it
    // instead of replacing it: an invitation link never silently changes an existing password.
    let passwordHash: string | undefined;
    if (inv.user.passwordHash) {
      if (!(await verifyPassword(inv.user.passwordHash, dto.password)))
        throw AppException.validation({
          password: 'You already have an EduTrack account. Enter its password to accept.',
        });
    } else {
      if (!meetsPasswordPolicy(dto.password))
        throw AppException.validation({ password: PASSWORD_POLICY_MESSAGE });
      passwordHash = await hashPassword(dto.password);
    }

    const now = this.clock.now();
    const user = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: inv.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (count !== 1)
        throw AppException.conflict(
          'This invitation has already been accepted.',
          'INVITATION_USED',
        );
      if (inv.membershipId && inv.schoolId)
        await tx.schoolMembership.updateMany({
          where: { id: inv.membershipId, schoolId: inv.schoolId, status: 'INVITED' },
          data: { status: 'ACTIVE', activatedAt: now },
        });
      if (inv.platformStaffId)
        await tx.platformStaff.updateMany({
          where: { id: inv.platformStaffId, status: 'INVITED' },
          data: { status: 'ACTIVE', activatedAt: now },
        });
      return tx.user.update({
        where: { id: inv.userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(phone && { phone }),
          ...(passwordHash && { passwordHash, passwordChangedAt: now, mustChangePassword: false }),
          // The link went to this address, so following it proves the user controls it.
          ...(inv.email && inv.email === inv.user.email && !inv.user.emailVerifiedAt
            ? { emailVerifiedAt: now }
            : {}),
        },
      });
    });
    return { email: user.email ?? '', name: `${user.firstName} ${user.lastName}` };
  }

  /**
   * Issues a fresh token for a pending invitation and sends it by email, SMS or both (the database
   * guarantees at least one). Call it after creating an invitation, and with `resend` to resend.
   */
  async send(
    invitationId: string,
    { resend = false }: { resend?: boolean } = {},
  ): Promise<{ token: string; link: string }> {
    const inv = await this.prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: invitationInclude,
    });
    if (inv.status !== 'PENDING' && inv.status !== 'EXPIRED')
      throw AppException.conflict(
        'Only pending invitations can be sent.',
        'INVITATION_NOT_PENDING',
      );
    const token = randomToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.ttlDays * DAY);
    await this.prisma.invitation.update({
      where: { id: inv.id },
      data: {
        tokenHash: sha256(token),
        status: 'PENDING',
        expiresAt,
        lastSentAt: now,
        ...(resend && { sendCount: { increment: 1 } }),
      },
    });
    const portal = inv.platformStaffId
      ? Portal.PLATFORM
      : inv.membership && opensPortal(inv.membership, 'SCHOOL_ADMIN')
        ? Portal.SCHOOL_ADMIN
        : Portal.TEACHER;
    const link = this.links.acceptInvitation(portal, inv.school?.slug, token);
    const data = {
      firstName: inv.user.firstName,
      invitedBy: await this.inviterLabel(inv),
      organisation: inv.school?.name ?? 'EduTrack',
      position: inv.position,
      link,
      expiresOn: DATE.format(expiresAt),
    };
    if (inv.email) await this.notifications.email(inv.email, 'invitation', data);
    if (inv.phone) await this.notifications.sms(inv.phone, 'invitation', data);
    return { token, link };
  }
}
