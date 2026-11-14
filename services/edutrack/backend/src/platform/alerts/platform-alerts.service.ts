import { Injectable, Logger } from '@nestjs/common';
import type { PlatformPermission } from '../../auth/permissions/platform-permissions.js';
import { PortalLinksService } from '../../auth/portal-links.service.js';
import { Clock } from '../../common/clock/clock.js';
import { Portal } from '../../generated/prisma/enums.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatAgo } from '../shared/format.js';
import { permissionsOf, unprocessable } from '../shared/staff.js';

export const NOTIFICATION_CHANNELS = ['in-app', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
type Channels = Record<NotificationChannel, boolean>;

/**
 * Back-office notification events, in the order the preferences screen lists them. `label` is
 * what the screen shows and sends back; `key` is stored on preferences and notifications.
 */
export const PLATFORM_EVENTS = [
  { key: 'user.invitation', label: 'User invitation', on: [true, true, false] },
  { key: 'subscription.expiring', label: 'Subscription expiring', on: [true, true, true] },
  { key: 'subscription.overdue', label: 'Subscription overdue', on: [true, true, true] },
  { key: 'school.provisioned', label: 'School provisioned', on: [true, true, false] },
  { key: 'issue.created', label: 'Support issue created', on: [true, false, false] },
  { key: 'issue.urgent', label: 'Support issue urgent', on: [true, true, true] },
  { key: 'security.alert', label: 'Security alert', on: [true, true, true] },
] as const;
export type PlatformEventKey = (typeof PLATFORM_EVENTS)[number]['key'];

/** Channels a staff member can't switch off for an event. */
const LOCKED: Partial<Record<PlatformEventKey, NotificationChannel[]>> = {
  'security.alert': ['email'],
};

const eventByKey = new Map<string, (typeof PLATFORM_EVENTS)[number]>(
  PLATFORM_EVENTS.map((e) => [e.key, e]),
);
const eventByLabel = new Map<string, (typeof PLATFORM_EVENTS)[number]>(
  PLATFORM_EVENTS.map((e) => [e.label.toLowerCase(), e]),
);

const defaults = (key: PlatformEventKey): Channels => {
  const on = eventByKey.get(key)!.on;
  return { 'in-app': on[0], email: on[1], sms: on[2] };
};

/** Who receives an alert: staff whose role grants a permission, or named users. */
export type Audience =
  | { permission: PlatformPermission; exclude?: (string | null | undefined)[] }
  | { userIds: string[] };

export interface Alert {
  title: string;
  detail?: string;
  /** Back-office path, e.g. `/schools/<id>`. */
  link: string;
  entityType?: string;
  /** The record the alert is about (a UUID); used to avoid repeating daily alerts. */
  entityId?: string;
}

/**
 * Back-office notifications: who gets each alert, on which channels (each person's preferences;
 * security alerts are always emailed), the in-app inbox, and the preferences screen.
 */
@Injectable()
export class PlatformAlertsService {
  private readonly logger = new Logger(PlatformAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly links: PortalLinksService,
    private readonly clock: Clock,
  ) {}

  private async recipients(audience: Audience) {
    const staff = await this.prisma.platformStaff.findMany({
      where: {
        status: 'ACTIVE',
        user: { status: 'ACTIVE', deletedAt: null },
        ...('userIds' in audience && { userId: { in: audience.userIds } }),
      },
      select: {
        user: { select: { id: true, firstName: true, email: true, phone: true } },
        role: { select: { permissions: true } },
      },
    });
    if ('userIds' in audience) return staff.map((s) => s.user);
    const excluded = new Set(audience.exclude?.filter(Boolean));
    return staff
      .filter((s) => !excluded.has(s.user.id) && permissionsOf(s.role).has(audience.permission))
      .map((s) => s.user);
  }

  /**
   * Sends one alert. With `onceSince`, people who already got this event for the same record
   * since then are skipped (the daily checks run every morning). Returns how many were alerted.
   */
  async notify(
    event: PlatformEventKey,
    alert: Alert,
    audience: Audience,
    { onceSince }: { onceSince?: Date } = {},
  ): Promise<number> {
    let people = await this.recipients(audience);
    if (onceSince && alert.entityId && people.length) {
      const already = await this.prisma.notification.findMany({
        where: {
          userId: { in: people.map((p) => p.id) },
          schoolId: null,
          category: event,
          entityId: alert.entityId,
          createdAt: { gte: onceSince },
        },
        select: { userId: true },
      });
      const skip = new Set(already.map((n) => n.userId));
      people = people.filter((p) => !skip.has(p.id));
    }
    if (people.length === 0) return 0;

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: people.map((p) => p.id) }, schoolId: null, event },
    });
    const byUser = new Map(prefs.map((p) => [p.userId, p]));
    const locked = LOCKED[event] ?? [];
    const link = `${this.links.base(Portal.PLATFORM)}${alert.link}`;

    const inApp: string[] = [];
    for (const person of people) {
      const pref = byUser.get(person.id);
      const channels: Channels = pref
        ? { 'in-app': pref.inApp, email: pref.email, sms: pref.sms }
        : defaults(event);
      for (const channel of locked) channels[channel] = true;
      if (channels['in-app']) inApp.push(person.id);
      const data = {
        firstName: person.firstName,
        title: alert.title,
        detail: alert.detail ?? '',
        link,
      };
      try {
        if (channels.email && person.email)
          await this.notifications.email(person.email, 'platform-alert', data);
        if (channels.sms && person.phone)
          await this.notifications.sms(person.phone, 'platform-alert', data);
      } catch (error) {
        this.logger.warn({ msg: 'Alert not queued', event, error: String(error) });
      }
    }
    if (inApp.length)
      await this.prisma.notification.createMany({
        data: inApp.map((userId) => ({
          userId,
          category: event,
          title: alert.title,
          body: alert.detail ?? '',
          link: alert.link,
          entityType: alert.entityType ?? null,
          entityId: alert.entityId ?? null,
        })),
      });
    return people.length;
  }

  /** Like `notify`, but never fails the caller (alerts are a side effect of the real action). */
  async tryNotify(...args: Parameters<PlatformAlertsService['notify']>): Promise<void> {
    await this.notify(...args).catch((error: unknown) =>
      this.logger.warn({ msg: 'Alert failed', event: args[0], error: String(error) }),
    );
  }

  /* ---------- Inbox ---------- */

  async inbox(userId: string) {
    const now = this.clock.now();
    const rows = await this.prisma.notification.findMany({
      where: { userId, schoolId: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      detail: n.body,
      when: formatAgo(n.createdAt, now),
      unread: n.readAt === null,
      to: n.link ?? '/',
    }));
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, schoolId: null, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return this.inbox(userId);
  }

  /* ---------- Preferences ---------- */

  async preferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId, schoolId: null },
    });
    const byEvent = new Map(rows.map((r) => [r.event, r]));
    return PLATFORM_EVENTS.map((e) => {
      const row = byEvent.get(e.key);
      const channels: Channels = row
        ? { 'in-app': row.inApp, email: row.email, sms: row.sms }
        : defaults(e.key);
      const locked = LOCKED[e.key] ?? [];
      for (const channel of locked) channels[channel] = true;
      return { event: e.label, channels, locked };
    });
  }

  async setPreference(
    userId: string,
    { event, channel, enabled }: { event: string; channel: NotificationChannel; enabled: boolean },
  ) {
    const found = eventByLabel.get(event.trim().toLowerCase());
    if (!found) throw unprocessable('Unknown notification event.');
    if (!enabled && LOCKED[found.key]?.includes(channel))
      throw unprocessable(`${found.label}s are always sent by ${channel}.`, 'CHANNEL_LOCKED');
    const current = (await this.preferences(userId)).find((p) => p.event === found.label)!;
    const next = { ...current.channels, [channel]: enabled };
    const data = { inApp: next['in-app'], email: next.email, sms: next.sms };
    // Platform preferences have no school; the partial unique index is (user, event).
    const existing = await this.prisma.notificationPreference.findFirst({
      where: { userId, schoolId: null, event: found.key },
      select: { id: true },
    });
    if (existing)
      await this.prisma.notificationPreference.update({ where: { id: existing.id }, data });
    else
      await this.prisma.notificationPreference.create({
        data: { userId, event: found.key, ...data },
      });
    return this.preferences(userId);
  }
}
