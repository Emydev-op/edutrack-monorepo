import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnnouncementsService } from '../communication/announcements.service.js';
import type { Channel } from '../communication/comms-catalog.js';
import { asGroupSchool } from './group-context.js';

/** Who a group announcement can go to in each school (classes are picked school by school). */
export const GROUP_AUDIENCES = ['everyone', 'parents', 'students', 'teachers', 'staff'] as const;
export type GroupAudience = (typeof GROUP_AUDIENCES)[number];

export interface GroupAnnouncementInput {
  title: string;
  body: string;
  channels: Channel[];
  smsText?: string;
  audience: GroupAudience;
  schoolIds: string[];
}

const message = (e: unknown) =>
  e instanceof AppException
    ? (((e.getResponse() as { message?: string }).message ?? e.message) as string)
    : e instanceof Error
      ? e.message
      : 'Not sent';

/**
 * One announcement for several schools of the group (School Admin › Group overview ›
 * Announcement): each chosen school sends its own copy, to its own parents, students or staff, from
 * its own SMS units and sender ID, and it shows in that school's Communication history. It runs
 * as the group owner's account in each school, so each school's own rules apply (school-wide
 * messaging permission, quiet hours, SMS units). A school that can't send it is reported and the
 * others still go.
 */
@Injectable()
export class GroupAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly announcements: AnnouncementsService,
  ) {}

  private async owner(auth: AuthUserContext) {
    const s = await this.prisma.groupStaff.findFirst({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'asc' },
      include: {
        group: {
          include: { schools: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
        },
      },
    });
    if (!s)
      throw AppException.forbidden(
        'Group announcements are for the school group’s own staff.',
        'NOT_GROUP_STAFF',
      );
    if (s.role !== 'OWNER')
      throw AppException.forbidden(
        'Only the group owner can send an announcement to every school.',
        'GROUP_ROLE_FORBIDDEN',
      );
    return s;
  }

  private targets(schools: { id: string; name: string }[], ids: string[]) {
    const chosen = schools.filter((s) => ids.includes(s.id));
    if (!chosen.length)
      throw AppException.validation(
        { schoolIds: 'Choose at least one school.' },
        'Choose at least one school.',
      );
    return chosen;
  }

  /** Who it reaches in each school, and whether each has the SMS units. */
  async preview(auth: AuthUserContext, dto: Omit<GroupAnnouncementInput, 'title' | 'body'>) {
    const s = await this.owner(auth);
    const schools = this.targets(s.group.schools, dto.schoolIds);
    const rows = await Promise.all(
      schools.map(async (sc) => {
        try {
          const p = await asGroupSchool(this.prisma, sc.id, auth.userId, () =>
            this.announcements.preview({
              audience: { kind: dto.audience },
              channels: dto.channels,
              smsText: dto.smsText,
            }),
          );
          return {
            schoolId: sc.id,
            school: sc.name,
            recipients: p.recipients,
            reach: p.reach,
            smsUnits: p.smsUnits,
            credit: p.credit,
            enough: p.enough,
            notes: [p.senderNote, p.quietHoursNote, ...p.gaps].filter(Boolean),
            error: null,
          };
        } catch (e) {
          return {
            schoolId: sc.id,
            school: sc.name,
            recipients: 0,
            reach: null,
            smsUnits: 0,
            credit: 0,
            enough: true,
            notes: [],
            error: message(e),
          };
        }
      }),
    );
    return {
      schools: rows,
      recipients: rows.reduce((a, r) => a + r.recipients, 0),
      smsUnits: rows.reduce((a, r) => a + r.smsUnits, 0),
    };
  }

  /** Sends it now in each chosen school. */
  async send(auth: AuthUserContext, dto: GroupAnnouncementInput) {
    const s = await this.owner(auth);
    const schools = this.targets(s.group.schools, dto.schoolIds);
    const results = [];
    // One school at a time: each send queues its own deliveries.
    for (const sc of schools) {
      try {
        const a = await asGroupSchool(this.prisma, sc.id, auth.userId, () =>
          this.announcements.create(auth, {
            title: dto.title,
            body: dto.body,
            channels: dto.channels,
            smsText: dto.smsText,
            audience: { kind: dto.audience },
            action: 'send',
          }),
        );
        results.push({
          schoolId: sc.id,
          school: sc.name,
          sent: true,
          recipients: (a as { recipients?: number | null }).recipients ?? 0,
          error: null,
        });
      } catch (e) {
        // A validation error (no title, no channel) is the same in every school: stop there.
        if (e instanceof AppException && e.getStatus() === 422) throw e;
        results.push({
          schoolId: sc.id,
          school: sc.name,
          sent: false,
          recipients: 0,
          error: message(e),
        });
      }
    }
    return {
      results,
      sent: results.filter((r) => r.sent).length,
      recipients: results.reduce((a, r) => a + r.recipients, 0),
    };
  }
}
