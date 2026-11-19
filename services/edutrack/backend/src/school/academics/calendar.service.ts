import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { CalendarEventType, TermEventType } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { fail, fmtDate, isIso, isoDate } from './academic-format.js';
import { AcademicStructureService } from './academic-structure.service.js';

export const CALENDAR_TYPES = ['Term', 'Break', 'Exam', 'Holiday', 'Meeting', 'Event'] as const;
export type CalendarTypeLabel = (typeof CALENDAR_TYPES)[number];

const TO_DB: Record<CalendarTypeLabel, CalendarEventType> = {
  Term: 'TERM',
  Break: 'BREAK',
  Exam: 'EXAM',
  Holiday: 'HOLIDAY',
  Meeting: 'MEETING',
  Event: 'EVENT',
};
const FROM_DB = Object.fromEntries(
  Object.entries(TO_DB).map(([label, db]) => [db, label]),
) as Record<CalendarEventType, CalendarTypeLabel>;

/** How a term's own events show on the calendar. */
const TERM_EVENT_TYPE: Record<TermEventType, CalendarTypeLabel> = {
  RESUMPTION: 'Term',
  MIDTERM: 'Break',
  CA: 'Exam',
  EXAMS: 'Exam',
  PTA: 'Meeting',
  RESULTS: 'Event',
  CUSTOM: 'Event',
};

export interface CalendarEventInput {
  title: string;
  type: CalendarTypeLabel;
  start: string;
  end: string;
  audience?: string;
  notes?: string;
}

/**
 * Academics › Academic calendar for the current session: the terms' own dates and events (edited
 * in Sessions & Terms), Nigerian public holidays, and the school's own events. Holidays and
 * breaks close the school, so registers and the Teacher Workspace skip those days.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  async view() {
    const session = await this.structure.currentSession();
    const today = isoDate(this.clock.now());
    if (!session) return { session: '', events: [], holidays: [], start: today, end: today };
    const [own, holidays] = await Promise.all([
      this.db.calendarEvent.findMany({
        where: { sessionId: session.id },
        orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.db.publicHoliday.findMany({
        where: { country: 'NG', date: { gte: session.startsOn, lte: session.endsOn } },
        orderBy: { date: 'asc' },
      }),
    ]);
    const events = [
      ...session.terms.flatMap((t) => [
        ...t.events.map((e) => ({
          id: `${t.id}-${e.id}`,
          title: e.type === 'RESUMPTION' ? `${t.name} resumes` : e.name,
          type: TERM_EVENT_TYPE[e.type],
          start: isoDate(e.startsOn),
          end: isoDate(e.endsOn),
          audience: 'Everyone',
          source: 'term' as const,
          notes: t.name,
        })),
        {
          id: `${t.id}-end`,
          title: `${t.name} ends`,
          type: 'Term' as const,
          start: isoDate(t.endsOn),
          end: isoDate(t.endsOn),
          audience: 'Everyone',
          source: 'term' as const,
          notes: t.name,
        },
      ]),
      ...holidays.map((h) => ({
        id: `hol-${isoDate(h.date)}`,
        title: h.name,
        type: 'Holiday' as const,
        start: isoDate(h.date),
        end: isoDate(h.date),
        audience: 'Everyone',
        source: 'holiday' as const,
        notes: 'Public holiday',
      })),
      ...own.map((e) => this.toView(e)),
    ].sort((a, b) => a.start.localeCompare(b.start));
    return {
      session: session.name,
      events,
      holidays: holidays.map((h) => ({ date: isoDate(h.date), name: h.name })),
      start: isoDate(session.startsOn),
      end: isoDate(session.endsOn),
    };
  }

  private toView(e: {
    id: string;
    title: string;
    type: CalendarEventType;
    startsOn: Date;
    endsOn: Date;
    audience: string;
    notes: string;
  }) {
    return {
      id: e.id,
      title: e.title,
      type: FROM_DB[e.type],
      start: isoDate(e.startsOn),
      end: isoDate(e.endsOn),
      audience: e.audience,
      source: 'custom' as const,
      notes: e.notes,
    };
  }

  private async valid(input: CalendarEventInput) {
    const session = await this.structure.currentSession();
    if (!session) throw fail('Create a session first.', 'NO_SESSION', HttpStatus.CONFLICT);
    const title = (input.title ?? '').trim();
    if (!title) throw fail('Give the event a title.', 'VALIDATION');
    if (title.length > 120) throw fail('Keep the title to 120 characters.', 'VALIDATION');
    const type = TO_DB[input.type];
    if (!type) throw fail('Choose a type.', 'VALIDATION');
    if (!isIso(input.start) || !isIso(input.end)) throw fail('Choose the dates.', 'VALIDATION');
    if (input.end < input.start) throw fail('The event ends before it starts.', 'VALIDATION');
    const start = isoDate(session.startsOn);
    const end = isoDate(session.endsOn);
    if (input.start < start || input.end > end)
      throw fail(
        `Events must fall within ${session.name} (${fmtDate(start)} – ${fmtDate(end)}).`,
        'VALIDATION',
      );
    const notes = (input.notes ?? '').trim();
    return {
      session,
      data: {
        title,
        type,
        startsOn: new Date(`${input.start}T00:00:00Z`),
        endsOn: new Date(`${input.end}T00:00:00Z`),
        audience: (input.audience ?? '').trim() || 'Everyone',
        notes: notes.slice(0, 500),
        // Holidays and breaks are days without classes (registers skip them).
        closesSchool: type === 'HOLIDAY' || type === 'BREAK' || /no classes/i.test(notes),
      },
    };
  }

  async create(schoolId: string, input: CalendarEventInput) {
    const { session, data } = await this.valid(input);
    const row = await this.db.$transaction(async (tx) => {
      const e = await tx.calendarEvent.create({
        data: { ...data, schoolId, sessionId: session.id },
      });
      await this.audit.record(
        {
          action: 'calendar.add',
          area: 'Academic',
          entity: 'CalendarEvent',
          entityId: e.id,
          summary: `Calendar event added: ${e.title}`,
          detail: `${fmtDate(data.startsOn)}${data.closesSchool ? ' · no classes' : ''}`,
        },
        asTx(tx),
      );
      return e;
    });
    return this.toView(row);
  }

  private async find(id: string) {
    const e = await this.db.calendarEvent.findFirst({ where: { id } });
    if (!e)
      throw AppException.notFound(
        'Only school events can be edited here. Term events are edited in Sessions & Terms.',
        'EVENT_NOT_FOUND',
      );
    return e;
  }

  async update(id: string, input: CalendarEventInput) {
    await this.find(id);
    const { data } = await this.valid(input);
    const row = await this.db.calendarEvent.update({ where: { id }, data });
    await this.audit.record({
      action: 'calendar.update',
      area: 'Academic',
      entity: 'CalendarEvent',
      entityId: id,
      summary: `Calendar event updated: ${row.title}`,
    });
    return this.toView(row);
  }

  async remove(id: string) {
    const e = await this.find(id);
    await this.db.calendarEvent.delete({ where: { id } });
    await this.audit.record({
      action: 'calendar.remove',
      area: 'Academic',
      entity: 'CalendarEvent',
      entityId: id,
      summary: `Calendar event removed: ${e.title}`,
    });
    return { ok: true as const, title: e.title };
  }
}
