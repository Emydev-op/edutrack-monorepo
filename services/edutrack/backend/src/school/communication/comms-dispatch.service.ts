import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { normalizePhone } from '../../auth/identifiers.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DeliveryStatus, RecipientRole } from '../../generated/prisma/enums.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { asTx } from '../shared/tenant-tx.js';
import {
  channelLabel,
  channelToDb,
  eventDef,
  eventToDb,
  render,
  smsSafe,
  smsUnits,
  sortChannels,
  type Channel,
  type ChannelTemplate,
  type CommsEventKey,
} from './comms-catalog.js';
import { hhmm, inWindow, localStamp, nextLocal } from './comms-time.js';
import { type Db, SmsLedgerService } from './sms-ledger.service.js';

/** Someone a message goes to, with the contact details to use and their template variables. */
export interface CommsRecipient {
  /** De-duplicates recipients within one message (a guardian once per family, per child…). */
  key: string;
  role: RecipientRole;
  name: string;
  /** Their portal account, for in-app (null: not activated yet). */
  userId: string | null;
  guardianId?: string | null;
  studentId?: string | null;
  staffId?: string | null;
  email: string | null;
  phone: string | null;
  vars?: Record<string, string>;
  /** What the in-app notification points at (absence alerts: the student). */
  entity?: { type: string; id: string };
}

export interface DispatchInput {
  event: CommsEventKey;
  title: string;
  /** "JSS 2B parents", "Mrs. Funke Adeyemi". */
  audienceLabel: string;
  recipients: CommsRecipient[];
  createdById?: string | null;
  /** Announcements bring their own channels and wording; events use the school's settings. */
  channels?: Channel[];
  content?: Partial<Record<Channel, ChannelTemplate>>;
  announcementId?: string;
  source?: { type: string; id: string };
  /** Shared variables; each recipient's own win. */
  vars?: Record<string, string>;
  /** The in-app notification's category and portal link. */
  inApp: { category: string; link: string };
}

export interface DispatchResult {
  messageId: string | null;
  recipients: number;
  smsUnits: number;
  /** Recipient keys at least one channel reached (in-app shown, email or SMS handed over). */
  reached: Set<string>;
  /** Hands email and SMS to the transports. Call after the transaction commits. */
  flush: () => Promise<void>;
}

interface Outbound {
  deliveryId: string;
  messageId: string;
  channel: 'EMAIL' | 'SMS';
  to: string;
  subject: string;
  body: string;
  schoolName: string;
  sender: string;
  units: number;
}

export const OUT_OF_UNITS = 'Not sent · out of SMS units';
export const PORTAL_OF: Record<RecipientRole, string> = {
  PARENT: 'Parent portal',
  STUDENT: 'Student portal',
  TEACHER: 'Staff portal',
  STAFF: 'Staff portal',
};

type DeliveryRow = Prisma.MessageDeliveryCreateManyInput;

const NOTHING: Omit<DispatchResult, 'reached'> = {
  messageId: null,
  recipients: 0,
  smsUnits: 0,
  flush: () => Promise.resolve(),
};

/**
 * The messaging core every module sends through: announcements, absence alerts, report cards
 * ready… One `Message` per send, a `MessageRecipient` per person and a `MessageDelivery` per
 * person and channel (what Delivery Logs list). In-app becomes a `Notification` in their portal;
 * email and SMS go to the transports after the transaction commits ("Sent" = handed over; the
 * transports give no delivery receipts). SMS uses the school's prepaid units, page by page: with
 * too few units left it isn't sent ("out of SMS units", retryable once topped up), while in-app
 * and email still go. SMS for events that respect quiet hours waits until they end.
 */
@Injectable()
export class CommsDispatchService {
  private readonly logger = new Logger(CommsDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly ledger: SmsLedgerService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** An event's switch, channels and wording for a school (its settings over the defaults). */
  async eventConfig(db: Db, schoolId: string, key: CommsEventKey) {
    const def = eventDef(key)!;
    const event = eventToDb(key);
    const [setting, rows] = await Promise.all([
      db.commsEventSetting.findUnique({ where: { schoolId_event: { schoolId, event } } }),
      db.messageTemplate.findMany({ where: { schoolId, event }, orderBy: { updatedAt: 'desc' } }),
    ]);
    const enabled = setting ? setting.channels.map(channelLabel) : def.defaults;
    const templates: Partial<Record<Channel, ChannelTemplate>> = { ...def.templates };
    for (const r of rows)
      if (def.available.includes(channelLabel(r.channel)))
        templates[channelLabel(r.channel)] = { subject: r.subject, body: r.body };
    return {
      active: key === 'announcement' || (setting?.active ?? true),
      channels: key === 'announcement' ? def.available : sortChannels(enabled),
      templates,
      customised: rows.length > 0,
      updatedById: rows[0]?.updatedById ?? null,
      updatedAt: rows[0]?.updatedAt ?? null,
    };
  }

  /** Sends in its own transaction (announcements, retries from screens). */
  async send(input: DispatchInput) {
    const schoolId = RequestContext.schoolId()!;
    const result = await this.tenant.db.$transaction(
      (tx) => this.dispatch(asTx(tx), schoolId, input),
      { timeout: 60_000 },
    );
    await result.flush();
    return result;
  }

  /**
   * Records and sends one message inside the caller's transaction. Returns nothing sent (and no
   * message) when the event is off, has no channels or nobody to reach. Call `flush()` once the
   * transaction has committed.
   */
  async dispatch(db: Db, schoolId: string, input: DispatchInput): Promise<DispatchResult> {
    const def = eventDef(input.event)!;
    const reached = new Set<string>();
    let channels = input.channels;
    let content = input.content;
    if (!channels || !content) {
      const cfg = await this.eventConfig(db, schoolId, input.event);
      channels ??= cfg.active ? cfg.channels : [];
      content ??= cfg.templates;
    }
    channels = sortChannels(channels);
    // Students only use their portal.
    const channelsFor = (role: RecipientRole) =>
      role === 'STUDENT' ? channels.filter((c) => c === 'In-app') : channels;
    if (!input.recipients.some((r) => channelsFor(r.role).length)) return { ...NOTHING, reached };
    // Parents choose channels per kind of notification in the Parent Portal (no row: all on).
    const parentUsers = [
      ...new Set(
        input.recipients.filter((r) => r.role === 'PARENT' && r.userId).map((r) => r.userId!),
      ),
    ];
    const prefs = parentUsers.length
      ? await db.notificationPreference.findMany({
          where: { schoolId, userId: { in: parentUsers }, event: input.inApp.category },
        })
      : [];
    const wanted = (r: CommsRecipient) => {
      const base = channelsFor(r.role);
      const p = r.role === 'PARENT' && r.userId && prefs.find((x) => x.userId === r.userId);
      if (!p) return base;
      return base.filter((c) =>
        c === 'In-app' ? p.inApp : c === 'Email' ? p.email : c === 'SMS' ? p.sms : true,
      );
    };

    await this.ledger.addTermAllowance(schoolId);
    const settings = await this.ledger.lock(db, schoolId);
    const [sender, school, termId] = await Promise.all([
      this.ledger.sender(db, schoolId),
      db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
      this.ledger.currentTermId(db, schoolId),
    ]);
    const now = this.clock.now();
    const end = hhmm(settings.quietHoursEnd);
    const quiet =
      def.quiet &&
      settings.quietHoursEnabled &&
      inWindow(localStamp(now).slice(11, 16), hhmm(settings.quietHoursStart), end);
    const releaseAt = quiet ? nextLocal(now, end) : null;
    let balance = settings.smsBalanceUnits;

    // Created first so its id (time-ordered) can tie the recipients and deliveries to it.
    const { id: messageId } = await db.message.create({
      data: {
        schoolId,
        event: eventToDb(input.event),
        title: input.title,
        audienceLabel: input.audienceLabel,
        sender,
        channels: channels.map(channelToDb),
        content: content as Prisma.InputJsonValue,
        sourceType: input.source?.type ?? null,
        sourceId: input.source?.id ?? null,
        announcementId: input.announcementId ?? null,
        createdById: input.createdById ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    const recipients: Prisma.MessageRecipientCreateManyInput[] = [];
    const deliveries: DeliveryRow[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    const outbound: Outbound[] = [];
    let used = 0;
    const seen = new Set<string>();
    for (const r of input.recipients) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      const mine = wanted(r);
      if (!mine.length) continue;
      const vars = { school_name: school.name, ...input.vars, ...r.vars };
      const recipientId = randomUUID();
      recipients.push({
        id: recipientId,
        schoolId,
        messageId,
        role: r.role,
        name: r.name,
        userId: r.userId,
        guardianId: r.guardianId ?? null,
        studentId: r.studentId ?? null,
        staffId: r.staffId ?? null,
        email: r.email,
        phone: r.phone,
        variables: vars,
        createdAt: now,
      });
      for (const ch of mine) {
        const d: DeliveryRow = {
          id: randomUUID(),
          schoolId,
          messageId,
          recipientId,
          channel: channelToDb(ch),
          address: '',
          status: 'QUEUED',
          attempts: 0,
          createdAt: now,
        };
        const t = content[ch] ?? { subject: '', body: '' };
        if (ch === 'In-app') {
          d.address = PORTAL_OF[r.role];
          if (r.userId) {
            Object.assign(d, { status: 'DELIVERED', attempts: 1, sentAt: now, deliveredAt: now });
            notifications.push({
              userId: r.userId,
              schoolId,
              category: input.inApp.category,
              title: render(t.subject, vars),
              body: render(t.body, vars),
              link: input.inApp.link,
              entityType: r.entity?.type ?? null,
              entityId: r.entity?.id ?? null,
              deliveryId: d.id,
              createdAt: now,
            });
            reached.add(r.key);
          } else d.detail = 'Shows when they activate their portal account';
        } else if (ch === 'Email') {
          d.address = r.email ?? '';
          if (!r.email) Object.assign(d, failed(now, 'No email address on record'));
          else {
            Object.assign(d, { status: 'SENT', attempts: 1, sentAt: now });
            outbound.push({
              deliveryId: d.id!,
              messageId,
              channel: 'EMAIL',
              to: r.email,
              subject: render(t.subject, vars),
              body: render(t.body, vars),
              schoolName: school.name,
              sender,
              units: 0,
            });
            reached.add(r.key);
          }
        } else {
          const phone = r.phone ? normalizePhone(r.phone) : null;
          d.address = phone ?? r.phone ?? '';
          if (!r.phone) Object.assign(d, failed(now, 'No phone number on record'));
          else if (!phone) Object.assign(d, failed(now, `Invalid phone number: ${r.phone}`));
          else if (releaseAt)
            Object.assign(d, {
              releaseAt,
              detail: `Held for quiet hours · goes out at ${end}`,
            });
          else {
            const body = smsSafe(render(t.body, vars));
            const units = smsUnits(body);
            if (units > balance)
              Object.assign(d, failed(now, OUT_OF_UNITS), {
                retryable: true,
                waitingForCredit: true,
              });
            else {
              balance -= units;
              used += units;
              Object.assign(d, { status: 'SENT', attempts: 1, sentAt: now, smsUnits: units });
              outbound.push({
                deliveryId: d.id!,
                messageId,
                channel: 'SMS',
                to: phone,
                subject: '',
                body,
                schoolName: school.name,
                sender,
                units,
              });
              reached.add(r.key);
            }
          }
        }
        deliveries.push(d);
      }
    }
    await db.message.update({
      where: { id: messageId },
      data: { recipientCount: recipients.length, smsUnits: used },
    });
    await db.messageRecipient.createMany({ data: recipients });
    await db.messageDelivery.createMany({ data: deliveries });
    if (notifications.length) await db.notification.createMany({ data: notifications });
    if (used)
      await this.ledger.post(db, schoolId, { kind: 'USAGE', units: -used, messageId, termId });
    return {
      messageId,
      recipients: recipients.length,
      smsUnits: used,
      reached,
      flush: () => this.flush(schoolId, outbound),
    };
  }

  /**
   * Hands email and SMS to the transports. A transport that refuses (provider down, bad
   * address) marks the delivery Failed and retryable, and gives SMS units back.
   */
  private async flush(schoolId: string, outbound: Outbound[]) {
    for (const o of outbound) {
      try {
        if (o.channel === 'EMAIL')
          await this.notifications.email(o.to, 'announcement', {
            subject: o.subject,
            body: o.body,
            schoolName: o.schoolName,
          });
        else
          await this.notifications.sms(
            o.to,
            'announcement',
            { subject: '', body: o.body, schoolName: o.schoolName },
            { senderId: o.sender },
          );
      } catch (error) {
        this.logger.warn({
          msg: 'Message not handed over',
          channel: o.channel,
          error: String(error),
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.messageDelivery.update({
            where: { id: o.deliveryId, schoolId },
            data: {
              ...failed(
                this.clock.now(),
                `The ${o.channel === 'SMS' ? 'SMS' : 'email'} provider didn’t take it. Retry later.`,
              ),
              retryable: true,
              smsUnits: 0,
            },
          });
          if (o.units) {
            await tx.message.update({
              where: { id: o.messageId, schoolId },
              data: { smsUnits: { decrement: o.units } },
            });
            await this.ledger.post(tx, schoolId, {
              kind: 'REFUND',
              units: o.units,
              messageId: o.messageId,
              termId: await this.ledger.currentTermId(tx, schoolId),
              note: 'SMS not sent',
            });
          }
        });
      }
    }
  }

  /**
   * Sends again: email and SMS that failed in a way worth retrying (provider errors, out of
   * units), or SMS held for quiet hours that are now over (`released`). Units are checked and
   * used as for a first send.
   */
  async resend(
    where: Prisma.MessageDeliveryWhereInput,
  ): Promise<{ retried: number; flush: () => Promise<void> }> {
    const schoolId = RequestContext.schoolId()!;
    await this.ledger.addTermAllowance(schoolId);
    const out: Outbound[] = [];
    const retried = await this.tenant.db.$transaction(
      async (tx) => {
        const db = asTx(tx);
        const rows = await db.messageDelivery.findMany({
          where: { ...where, channel: { in: ['EMAIL', 'SMS'] } },
          include: { message: true, recipient: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!rows.length) return 0;
        const settings = await this.ledger.lock(db, schoolId);
        const [sender, school, termId] = await Promise.all([
          this.ledger.sender(db, schoolId),
          db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
          this.ledger.currentTermId(db, schoolId),
        ]);
        const now = this.clock.now();
        let balance = settings.smsBalanceUnits;
        const usedBy = new Map<string, number>();
        for (const d of rows) {
          const content = (d.message.content ?? {}) as Partial<Record<Channel, ChannelTemplate>>;
          const t = content[channelLabel(d.channel)] ?? { subject: '', body: '' };
          const vars = (d.recipient.variables ?? {}) as Record<string, string>;
          let data: Prisma.MessageDeliveryUpdateInput;
          if (d.channel === 'EMAIL') {
            data = sent(now);
            out.push({
              deliveryId: d.id,
              messageId: d.messageId,
              channel: 'EMAIL',
              to: d.address,
              subject: render(t.subject, vars),
              body: render(t.body, vars),
              schoolName: school.name,
              sender,
              units: 0,
            });
          } else {
            const body = smsSafe(render(t.body, vars));
            const units = smsUnits(body);
            if (units > balance)
              data = {
                ...failed(now, OUT_OF_UNITS),
                retryable: true,
                waitingForCredit: true,
                releaseAt: null,
              };
            else {
              balance -= units;
              usedBy.set(d.messageId, (usedBy.get(d.messageId) ?? 0) + units);
              data = { ...sent(now), smsUnits: units };
              out.push({
                deliveryId: d.id,
                messageId: d.messageId,
                channel: 'SMS',
                to: d.address,
                subject: '',
                body,
                schoolName: school.name,
                sender,
                units,
              });
            }
          }
          await db.messageDelivery.update({
            where: { id: d.id },
            data: { ...data, attempts: { increment: 1 } },
          });
        }
        for (const [messageId, units] of usedBy) {
          await db.message.update({
            where: { id: messageId },
            data: { smsUnits: { increment: units } },
          });
          await this.ledger.post(db, schoolId, { kind: 'USAGE', units: -units, messageId, termId });
        }
        return rows.length;
      },
      { timeout: 60_000 },
    );
    return { retried, flush: () => this.flush(schoolId, out) };
  }

  /** SMS held for quiet hours that have ended, for the signed-in (or job's) school. */
  async releaseHeld() {
    const { retried, flush } = await this.resend({
      status: 'QUEUED',
      channel: 'SMS',
      releaseAt: { lte: this.clock.now() },
    });
    await flush();
    return retried;
  }
}

const failed = (now: Date, detail: string) => ({
  status: 'FAILED' as DeliveryStatus,
  detail,
  failedAt: now,
  retryable: false,
});

const sent = (now: Date) => ({
  status: 'SENT' as DeliveryStatus,
  detail: '',
  retryable: false,
  waitingForCredit: false,
  releaseAt: null,
  sentAt: now,
  failedAt: null,
});
