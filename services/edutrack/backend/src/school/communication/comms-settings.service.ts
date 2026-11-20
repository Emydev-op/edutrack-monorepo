import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx } from '../shared/tenant-tx.js';
import {
  EVENTS,
  MAX_SMS_PAGES,
  channelToDb,
  eventDef,
  eventToDb,
  render,
  smsLength,
  smsSafe,
  sortChannels,
  variablesIn,
  variablesOf,
  type Channel,
  type ChannelTemplate,
  type EventDef,
} from './comms-catalog.js';
import { CommsDispatchService } from './comms-dispatch.service.js';
import { HHMM, atLabel, hhmm, localStamp, timeValue } from './comms-time.js';
import type { QuietHoursDto, TemplateDto } from './dto/comms.dto.js';
import { LOW_UNITS, SENDER_STATUS, SmsLedgerService } from './sms-ledger.service.js';

const PENDING_NOTE =
  'EduTrack checks the name with the networks, usually in 5–10 working days. SMS goes out from “EDUTRACK” until it’s approved.';

const fail = (message: string, field = 'body') => AppException.validation({ [field]: message });
const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);

/**
 * Settings → Notifications and Delivery Logs → Templates: which automatic messages go out and on
 * which channels, their wording, SMS quiet hours, the SMS sender ID and units. Changes are
 * recorded in the audit trail (area Notifications), which is the panel's history. Only
 * whole-school admins change them.
 */
@Injectable()
export class CommsSettingsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly dispatch: CommsDispatchService,
    private readonly ledger: SmsLedgerService,
    private readonly sections: SectionAccessService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private get tx() {
    return this.db as unknown as Prisma.TransactionClient;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  private log(what: string, detail: string, db?: Prisma.TransactionClient) {
    return this.audit.record(
      {
        action: 'comms.settings',
        area: 'Notifications',
        entity: 'CommunicationSettings',
        entityId: this.schoolId(),
        summary: what,
        detail,
      },
      db,
    );
  }

  private requireWholeSchool() {
    return this.sections.require(null, 'notification settings');
  }

  /* ---------------- Events ---------------- */

  async events() {
    return Promise.all(
      EVENTS.map(async (e) => {
        const cfg = await this.dispatch.eventConfig(this.tx, this.schoolId(), e.key);
        return {
          key: e.key,
          label: e.label,
          description: e.description,
          who: e.who,
          available: e.available,
          channels: cfg.channels,
          active: cfg.active,
          locked: e.locked,
          trigger: e.trigger,
        };
      }),
    );
  }

  async saveEvents(body: unknown) {
    await this.requireWholeSchool();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw fail('Send each event’s switch and channels.');
    const next: { e: EventDef; active: boolean; channels: Channel[] }[] = [];
    for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
      const e = eventDef(key);
      if (!e) throw fail(`Unknown event: ${key}`);
      if (key === 'announcement') continue;
      const val = (raw ?? {}) as { active?: unknown; channels?: unknown };
      const wanted = Array.isArray(val.channels) ? val.channels : [];
      const channels = e.available.filter((c) => wanted.includes(c));
      const active = val.active === true;
      if (e.locked && !active) throw fail(`${e.label} can’t be switched off. ${e.locked}`);
      if (e.required && !channels.includes(e.required))
        throw fail(`${e.label} must keep ${e.required} on. ${e.locked}`);
      if (active && !channels.length)
        throw fail(`Choose at least one channel for ${e.label}, or switch it off.`);
      next.push({ e, active, channels });
    }
    const schoolId = this.schoolId();
    const auth = RequestContext.get();
    let changed = 0;
    await this.db.$transaction(async (tx) => {
      for (const { e, active, channels } of next) {
        const cur = await this.dispatch.eventConfig(asTx(tx), schoolId, e.key);
        const before = cur.active ? cur.channels.join(', ') || 'none' : 'Off';
        const after = active ? channels.join(', ') : 'Off';
        if (before === after && cur.active === active) continue;
        changed++;
        await tx.commsEventSetting.upsert({
          where: { schoolId_event: { schoolId, event: eventToDb(e.key) } },
          create: {
            schoolId,
            event: eventToDb(e.key),
            active,
            channels: channels.map(channelToDb),
            updatedById: auth?.userId ?? null,
          },
          update: {
            active,
            channels: channels.map(channelToDb),
            updatedById: auth?.userId ?? null,
          },
        });
        await this.log(`${e.label} notifications changed`, `${before} → ${after}`, asTx(tx));
      }
    });
    if (!changed) throw conflict('Nothing changed.', 'NOTHING_CHANGED');
    return this.settings();
  }

  /* ---------------- Settings ---------------- */

  async settings() {
    const schoolId = this.schoolId();
    await this.ledger.addTermAllowance(schoolId);
    const termId = await this.ledger.currentTermId(this.tx, schoolId);
    const [events, s, sender, used, latest, history] = await Promise.all([
      this.events(),
      this.ledger.read(this.tx, schoolId),
      this.ledger.sender(this.tx, schoolId),
      this.ledger.usedThisTerm(this.tx, schoolId, termId),
      this.db.senderIdRequest.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.db.auditEvent.findMany({
        where: { area: 'Notifications' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    const now = this.clock.now();
    return {
      events,
      senderId: {
        name: s.senderId ?? '',
        status: SENDER_STATUS[s.senderIdStatus],
        requestedAt: latest ? localStamp(latest.createdAt).slice(0, 10) : null,
        note:
          s.senderIdStatus === 'PENDING_APPROVAL'
            ? PENDING_NOTE
            : s.senderIdStatus === 'REJECTED'
              ? latest?.note || 'EduTrack couldn’t register this name. Request a different one.'
              : (latest?.note ?? ''),
      },
      sender,
      credit: { units: s.smsBalanceUnits, usedThisTerm: used, low: s.smsBalanceUnits < LOW_UNITS },
      quietHours: {
        enabled: s.quietHoursEnabled,
        start: hhmm(s.quietHoursStart),
        end: hhmm(s.quietHoursEnd),
      },
      history: history.map((h) => ({
        id: h.id,
        at: localStamp(h.createdAt),
        atLabel: atLabel(h.createdAt, now),
        by: h.actorName ?? 'EduTrack',
        what: h.summary,
        detail: h.detail ?? '',
      })),
    };
  }

  async quietHours(dto: QuietHoursDto) {
    await this.requireWholeSchool();
    const schoolId = this.schoolId();
    const cur = await this.ledger.read(this.tx, schoolId);
    const start = dto.start ?? hhmm(cur.quietHoursStart);
    const end = dto.end ?? hhmm(cur.quietHoursEnd);
    if (!HHMM.test(start) || !HHMM.test(end)) throw fail('Enter times as HH:MM.', 'start');
    if (start === end) throw fail('Quiet hours must start and end at different times.', 'end');
    const before = cur.quietHoursEnabled
      ? `${hhmm(cur.quietHoursStart)}–${hhmm(cur.quietHoursEnd)}`
      : 'Off';
    const after = dto.enabled ? `${start}–${end}` : 'Off';
    if (before === after && cur.quietHoursEnabled === dto.enabled)
      throw conflict('Nothing changed.', 'NOTHING_CHANGED');
    await this.db.$transaction(async (tx) => {
      await this.ledger.settings(asTx(tx), schoolId);
      await tx.communicationSettings.update({
        where: { schoolId },
        data: {
          quietHoursEnabled: dto.enabled,
          quietHoursStart: timeValue(start),
          quietHoursEnd: timeValue(end),
        },
      });
      await this.log('SMS quiet hours changed', `${before} → ${after}`, asTx(tx));
    });
    return this.settings();
  }

  async requestSenderId(auth: AuthUserContext, input: string) {
    await this.requireWholeSchool();
    const name = (input ?? '').trim().toUpperCase();
    if (!name) throw fail('Enter the sender ID.', 'name');
    if (!/^[A-Z][A-Z0-9]{2,10}$/.test(name))
      throw fail('Use 3 to 11 letters or numbers, starting with a letter, with no spaces.', 'name');
    const schoolId = this.schoolId();
    const cur = await this.ledger.read(this.tx, schoolId);
    if (cur.senderId === name && cur.senderIdStatus === 'PENDING_APPROVAL')
      throw conflict(`“${name}” is already waiting for approval.`, 'SENDER_ID_PENDING');
    if (cur.senderId === name && cur.senderIdStatus === 'APPROVED')
      throw conflict(`“${name}” is already approved.`, 'SENDER_ID_APPROVED');
    const before = cur.senderId ? `${cur.senderId} (${SENDER_STATUS[cur.senderIdStatus]})` : 'None';
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      // A name still waiting is replaced by the new request.
      await tx.senderIdRequest.updateMany({
        where: { status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', decidedAt: now, note: `Replaced by a request for “${name}”.` },
      });
      await tx.senderIdRequest.create({
        data: { schoolId, name, requestedById: auth.userId, createdAt: now },
      });
      await this.ledger.settings(asTx(tx), schoolId);
      await tx.communicationSettings.update({
        where: { schoolId },
        data: { senderId: name, senderIdStatus: 'PENDING_APPROVAL' },
      });
      await this.log('SMS sender ID requested', `${before} → ${name}`, asTx(tx));
    });
    return this.settings();
  }

  /* ---------------- Templates ---------------- */

  async templates() {
    return Promise.all(
      EVENTS.filter((e) => e.key !== 'announcement').map(async (e) => {
        const cfg = await this.dispatch.eventConfig(this.tx, this.schoolId(), e.key);
        return {
          event: e.key,
          label: e.label,
          channels: cfg.channels,
          variables: e.variables.map((v) => v.name),
          customised: cfg.customised,
        };
      }),
    );
  }

  private def(key: string) {
    const e = eventDef(key);
    if (!e || key === 'announcement') throw AppException.notFound('Template not found');
    return e;
  }

  async template(key: string) {
    const e = this.def(key);
    const cfg = await this.dispatch.eventConfig(this.tx, this.schoolId(), e.key);
    const by = cfg.updatedById
      ? await this.db.user.findUnique({
          where: { id: cfg.updatedById },
          select: { firstName: true, lastName: true },
        })
      : null;
    return {
      event: e.key,
      label: e.label,
      description: e.description,
      variables: variablesOf(e),
      available: e.available,
      enabled: cfg.channels,
      templates: Object.fromEntries(
        e.available.map((c) => [c, cfg.templates[c] ?? e.templates[c]!]),
      ) as Partial<Record<Channel, ChannelTemplate>>,
      defaults: e.templates,
      customised: cfg.customised,
      updatedBy: cfg.customised && by ? `${by.firstName} ${by.lastName}` : '',
      updatedAt: cfg.customised && cfg.updatedAt ? localStamp(cfg.updatedAt) : null,
    };
  }

  async saveTemplate(key: string, dto: TemplateDto) {
    await this.requireWholeSchool();
    const d = await this.template(key);
    const e = this.def(key);
    const known = new Set(d.variables.map((v) => v.name));
    const sample = Object.fromEntries(d.variables.map((v) => [v.name, v.sample]));
    const next: Partial<Record<Channel, ChannelTemplate>> = {};
    for (const ch of e.available) {
      const t = dto[ch];
      if (!t) {
        next[ch] = d.templates[ch]!;
        continue;
      }
      const subject = (t.subject ?? '').trim();
      const body = (t.body ?? '').trim();
      if (!body) throw fail(`Write the ${ch} message.`, `${ch}.body`);
      if (ch === 'Email' && !subject) throw fail('Write the email subject.', `${ch}.subject`);
      if (ch === 'In-app' && !subject) throw fail('Write the in-app title.', `${ch}.subject`);
      if (subject.length > 150)
        throw fail(
          `Keep the ${ch} ${ch === 'Email' ? 'subject' : 'title'} to 150 characters.`,
          `${ch}.subject`,
        );
      if (body.length > 5000)
        throw fail(`Keep the ${ch} message to 5,000 characters.`, `${ch}.body`);
      const unknown = [...variablesIn(subject), ...variablesIn(body)].filter((x) => !known.has(x));
      if (unknown.length)
        throw fail(
          `[${unknown[0]}] isn’t a variable for this message. Use one of: ${[...known].map((x) => `[${x}]`).join(' ')}.`,
          `${ch}.body`,
        );
      if (ch === 'SMS' && smsLength(smsSafe(render(body, sample))).pages > MAX_SMS_PAGES)
        throw fail(
          `With sample details the SMS runs past ${MAX_SMS_PAGES} pages. Shorten it.`,
          'SMS.body',
        );
      next[ch] = { subject: ch === 'SMS' ? '' : subject, body };
    }
    const same = (a?: ChannelTemplate, b?: ChannelTemplate) =>
      (a?.subject ?? '') === (b?.subject ?? '') && (a?.body ?? '') === (b?.body ?? '');
    const changed = e.available.filter((c) => !same(next[c], d.templates[c]));
    if (!changed.length) return d;
    const schoolId = this.schoolId();
    const userId = RequestContext.get()?.userId ?? null;
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      for (const ch of e.available) {
        const where = {
          schoolId_event_channel: { schoolId, event: eventToDb(e.key), channel: channelToDb(ch) },
        };
        // Wording back to the default needs no row.
        if (same(next[ch], e.templates[ch])) {
          await tx.messageTemplate.deleteMany({
            where: { event: eventToDb(e.key), channel: channelToDb(ch) },
          });
          continue;
        }
        await tx.messageTemplate.upsert({
          where,
          create: {
            schoolId,
            event: eventToDb(e.key),
            channel: channelToDb(ch),
            subject: next[ch]!.subject,
            body: next[ch]!.body,
            updatedById: userId,
            updatedAt: now,
          },
          update: {
            subject: next[ch]!.subject,
            body: next[ch]!.body,
            updatedById: userId,
            updatedAt: now,
          },
        });
      }
      await this.log(`${e.label} template edited`, sortChannels(changed).join(', '), asTx(tx));
    });
    return this.template(key);
  }

  async resetTemplate(key: string) {
    await this.requireWholeSchool();
    const e = this.def(key);
    const event = eventToDb(e.key);
    const rows = await this.db.messageTemplate.count({ where: { event } });
    if (!rows)
      throw conflict('This template already uses the default wording.', 'TEMPLATE_IS_DEFAULT');
    await this.db.$transaction(async (tx) => {
      await tx.messageTemplate.deleteMany({ where: { event } });
      await this.log(`${e.label} template reset to default`, '', asTx(tx));
    });
    return this.template(key);
  }
}
