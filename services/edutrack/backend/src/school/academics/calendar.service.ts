import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
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
  /** One campus's event (by name); empty: the whole school. */
  branch?: string | null;
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

  /** The working branch (the header's), or null for all branches. */
  private async workingBranch() {
    const name = RequestContext.working().branch;
    if (!name || name === 'All branches') return null;
    return this.db.branch.findFirst({ where: { name }, select: { id: true, name: true } });
  }

  async view() {
    const session = await this.structure.currentSession();
    const today = isoDate(this.clock.now());
    if (!session)
      return {
        session: '',
        branch: null,
        events: [],
        holidays: [],
        branchTerms: [],
        start: today,
        end: today,
      };
    // One campus: the school's events and its own; all branches: everything, labelled.
    const branch = await this.workingBranch();
    const [own, holidays, branchDates, branches] = await Promise.all([
      this.db.calendarEvent.findMany({
        where: {
          sessionId: session.id,
          ...(branch && { OR: [{ branchId: null }, { branchId: branch.id }] }),
        },
        orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.db.publicHoliday.findMany({
        where: { country: 'NG', date: { gte: session.startsOn, lte: session.endsOn } },
        orderBy: { date: 'asc' },
      }),
      this.db.branchTermDates.findMany({
        where: {
          termId: { in: session.terms.map((t) => t.id) },
          ...(branch && { branchId: branch.id }),
        },
        include: { branch: { select: { name: true } } },
      }),
      this.db.branch.findMany({ select: { id: true, name: true } }),
    ]);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    // At one campus, its own term dates replace the term's.
    const datesOf = (t: { id: string; startsOn: Date; endsOn: Date }) => {
      const own = branch ? branchDates.find((d) => d.termId === t.id) : undefined;
      return own ?? t;
    };
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
          start: isoDate(datesOf(t).endsOn),
          end: isoDate(datesOf(t).endsOn),
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
      ...own.map((e) => ({
        ...this.toView(e),
        branch: e.branchId ? (branchName.get(e.branchId) ?? null) : null,
      })),
    ].sort((a, b) => a.start.localeCompare(b.start));
    return {
      session: session.name,
      branch: branch?.name ?? null,
      events,
      /** The session's terms with their dates at the working campus (its own, when shifted). */
      terms: session.terms.map((t) => ({
        id: t.id,
        name: t.name,
        start: isoDate(datesOf(t).startsOn),
        end: isoDate(datesOf(t).endsOn),
        own: !!branch && branchDates.some((d) => d.termId === t.id),
      })),
      /** Campuses' own term dates (the working one only, when one is chosen). */
      branchTerms: branchDates.map((d) => ({
        termId: d.termId,
        term: session.terms.find((t) => t.id === d.termId)?.name ?? '',
        branch: d.branch.name,
        start: isoDate(d.startsOn),
        end: isoDate(d.endsOn),
      })),
      holidays: holidays.map((h) => ({ date: isoDate(h.date), name: h.name })),
      start: isoDate(session.startsOn),
      end: isoDate(session.endsOn),
    };
  }

  private toView(e: {
    id: string;
    branchId?: string | null;
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
    const branchId = await this.branchIdOf(input.branch);
    return {
      session,
      data: {
        branchId,
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

  /**
   * An event's campus by name (null: the whole school). Branch-scoped admins only add events for
   * their own branches.
   */
  private async branchIdOf(name: string | null | undefined) {
    const scope = RequestContext.get()?.branchScope;
    const wanted = (name ?? '').trim();
    if (!wanted || wanted === 'All branches') {
      if (scope) throw fail(`Choose your branch: ${scope.names.join(' or ')}.`, 'VALIDATION');
      return null;
    }
    const b = await this.db.branch.findFirst({ where: { name: wanted, status: 'ACTIVE' } });
    if (!b) throw fail('Choose one of the school’s active branches.', 'VALIDATION');
    if (scope && !scope.ids.includes(b.id))
      throw fail(
        `You manage ${scope.names.join(' and ')} only.`,
        'BRANCH_SCOPE',
        HttpStatus.FORBIDDEN,
      );
    return b.id;
  }

  /** A branch-scoped admin can only change their own branches' events. */
  private requireOwn(e: { branchId: string | null }) {
    const scope = RequestContext.get()?.branchScope;
    if (scope && (!e.branchId || !scope.ids.includes(e.branchId)))
      throw fail(
        `Only whole-school admins can change ${e.branchId ? 'another branch’s' : 'whole-school'} events.`,
        'BRANCH_SCOPE',
        HttpStatus.FORBIDDEN,
      );
  }

  /**
   * `PUT /v1/academics/calendar/branch-terms`: a campus's own start and end for a term, or (both
   * null) back to the term's dates.
   */
  async setBranchTermDates(input: {
    branch: string;
    termId: string;
    start?: string | null;
    end?: string | null;
  }) {
    const session = await this.structure.currentSession();
    const term = session?.terms.find((t) => t.id === input.termId);
    if (!session || !term) throw fail('Choose a term of the current session.', 'VALIDATION');
    const branchId = await this.branchIdOf(input.branch);
    if (!branchId) throw fail('Choose the branch.', 'VALIDATION');
    if (!input.start && !input.end) {
      await this.db.branchTermDates.deleteMany({ where: { termId: term.id, branchId } });
    } else {
      const start = input.start ?? isoDate(term.startsOn);
      const end = input.end ?? isoDate(term.endsOn);
      if (!isIso(start) || !isIso(end)) throw fail('Choose the dates.', 'VALIDATION');
      if (end <= start) throw fail('The term ends before it starts.', 'VALIDATION');
      const sStart = isoDate(session.startsOn);
      const sEnd = isoDate(session.endsOn);
      if (start < sStart || end > sEnd)
        throw fail(`Term dates must fall within ${session.name}.`, 'VALIDATION');
      const data = {
        startsOn: new Date(`${start}T00:00:00Z`),
        endsOn: new Date(`${end}T00:00:00Z`),
      };
      await this.db.branchTermDates.upsert({
        where: { termId_branchId: { termId: term.id, branchId } },
        create: { schoolId: RequestContext.schoolId()!, termId: term.id, branchId, ...data },
        update: data,
      });
    }
    await this.audit.record({
      action: 'calendar.branch_term',
      area: 'Academic',
      entity: 'Term',
      entityId: term.id,
      summary: `${input.branch} · ${term.name} dates ${input.start || input.end ? 'set' : 'reset to the term’s'}`,
    });
    return { ...(await this.view()), saved: { branch: input.branch, term: term.name } };
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
    this.requireOwn(await this.find(id));
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
    this.requireOwn(e);
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
