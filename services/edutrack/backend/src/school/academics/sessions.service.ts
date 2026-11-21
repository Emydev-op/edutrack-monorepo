import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SessionStatus } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { promotionProgress } from '../promotion/promotion-progress.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import {
  addDays,
  days,
  eventTypeFromDb,
  eventTypeToDb,
  fail,
  fmtDate,
  fromIso,
  isIso,
  isoDate,
  plural,
  SESSION_STATUS,
  STRUCTURE_LABEL,
  structureFromLabel,
  TERM_STATUS,
  type CopyArea,
} from './academic-format.js';
import { ACADEMIC_STEP, AcademicStructureService } from './academic-structure.service.js';
import type { NewSessionDto, TermInputDto } from './dto/academics.dto.js';

const SESSION_NOT_FOUND = 'Session not found';

type SessionRow = Prisma.AcademicSessionGetPayload<{
  include: { terms: { include: { events: true } } };
}>;

export interface TermEventView {
  id: string;
  type: string;
  name: string;
  start: string;
  end: string;
}
export interface TermView {
  id: string;
  name: string;
  start: string;
  end: string;
  status: string;
  events: TermEventView[];
}
export interface SessionView {
  id: string;
  name: string;
  start: string;
  end: string;
  status: string;
  structure: string;
  terms: TermView[];
  students: number;
  note: string;
  closedOn: string | null;
}
export interface ChecklistItemView {
  label: string;
  detail: string;
  status: string;
  to: { name: string } | null;
}
export interface SessionsView {
  sessions: SessionView[];
  currentId: string | null;
  termChecklist: {
    termId: string;
    title: string;
    items: ChecklistItemView[];
    canClose: boolean;
    reason: string;
  } | null;
  copyAreas: { id: CopyArea; label: string; detail: string }[];
  confirmed: { session: boolean; terms: boolean };
}

const termInclude = {
  terms: {
    orderBy: { sequence: 'asc' as const },
    include: { events: { orderBy: [{ startsOn: 'asc' as const }, { createdAt: 'asc' as const }] } },
  },
};

/** Spreads terms evenly across the session with a two-week break between them. */
export function evenTerms(start: string, end: string, names: string[]) {
  const total = days(start, end);
  const gap = names.length > 1 ? 14 : 0;
  const len = Math.floor((total - gap * (names.length - 1)) / names.length);
  return names.map((name, i) => {
    const s = addDays(start, i * (len + gap));
    return { name, start: s, end: i === names.length - 1 ? end : addDays(s, len) };
  });
}

/** Academics › Sessions & Terms: sessions, their terms and term events. */
@Injectable()
export class SessionsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
    private readonly setupState: SetupStateService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private today() {
    return isoDate(this.clock.now());
  }

  /* ---------------- Views ---------------- */

  toView(s: SessionRow, students: number): SessionView {
    return {
      id: s.id,
      name: s.name,
      start: isoDate(s.startsOn),
      end: isoDate(s.endsOn),
      status: SESSION_STATUS[s.status],
      structure: STRUCTURE_LABEL[s.structure],
      terms: s.terms.map((t) => ({
        id: t.id,
        name: t.name,
        start: isoDate(t.startsOn),
        end: isoDate(t.endsOn),
        status: TERM_STATUS[t.status],
        events: t.events.map((e) => ({
          id: e.id,
          type: eventTypeFromDb(e.type),
          name: e.name,
          start: isoDate(e.startsOn),
          end: isoDate(e.endsOn),
        })),
      })),
      students,
      note: s.note ?? '',
      closedOn: s.closedAt ? fmtDate(s.closedAt) : null,
    };
  }

  /** Students enrolled in each session (active ones while it runs, everyone once it's over). */
  private async studentCounts(): Promise<Map<string, number>> {
    const rows = await this.db.enrollment.groupBy({
      by: ['sessionId', 'status'],
      _count: { _all: true },
    });
    const sessions = await this.db.academicSession.findMany({ select: { id: true, status: true } });
    const live = new Map(sessions.map((s) => [s.id, s.status === 'ACTIVE']));
    const out = new Map<string, number>();
    for (const r of rows) {
      if (live.get(r.sessionId) && r.status !== 'ACTIVE') continue;
      out.set(r.sessionId, (out.get(r.sessionId) ?? 0) + r._count._all);
    }
    return out;
  }

  async sessionView(id: string): Promise<SessionView> {
    const row = await this.db.academicSession.findUnique({ where: { id }, include: termInclude });
    if (!row) throw AppException.notFound(SESSION_NOT_FOUND, 'SESSION_NOT_FOUND');
    return this.toView(row, (await this.studentCounts()).get(id) ?? 0);
  }

  async view(): Promise<SessionsView> {
    const [rows, counts, current, confirmed] = await Promise.all([
      this.db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, include: termInclude }),
      this.studentCounts(),
      this.structure.activeSession(),
      this.structure.confirmedKeys(),
    ]);
    return {
      sessions: rows.map((s) => this.toView(s, counts.get(s.id) ?? 0)),
      currentId: current?.id ?? null,
      termChecklist: await this.termChecklist(current),
      copyAreas: await this.copyAreas(),
      confirmed: {
        session: confirmed.has(ACADEMIC_STEP.session),
        terms: confirmed.has(ACADEMIC_STEP.terms),
      },
    };
  }

  /** Closing checklist for the active term, from its result sheets. */
  private async termChecklist(session: SessionRow | null): Promise<SessionsView['termChecklist']> {
    const term = session?.terms.find((t) => t.status === 'ACTIVE');
    if (!session || !term) return null;
    const [sheets, published] = await Promise.all([
      this.db.resultSheet.findMany({
        where: { termId: term.id },
        select: { status: true, armId: true },
      }),
      this.db.resultPublication.findMany({ where: { termId: term.id }, select: { armId: true } }),
    ]);
    const notIn = sheets.filter((s) => ['NOT_STARTED', 'DRAFT'].includes(s.status)).length;
    const waiting = sheets.filter((s) =>
      ['SUBMITTED', 'UNDER_REVIEW', 'RETURNED'].includes(s.status),
    ).length;
    const returned = sheets.filter((s) => s.status === 'RETURNED').length;
    const armIds = [...new Set(sheets.map((s) => s.armId))];
    const pub = armIds.filter((id) => published.some((p) => p.armId === id)).length;
    const results = { name: 'results' };
    const items: ChecklistItemView[] = [
      {
        label: 'Result entry',
        detail: sheets.length
          ? `${sheets.length - notIn} of ${sheets.length} sheets entered${notIn ? ` · ${plural(notIn, 'draft')} or not started` : ''}`
          : 'No result sheets this term',
        status: notIn ? 'Blocking' : 'Complete',
        to: results,
      },
      {
        label: 'Results approved',
        detail: waiting
          ? [
              waiting - returned && `${plural(waiting - returned, 'sheet')} awaiting review`,
              returned && `${plural(returned, 'sheet')} returned to teachers`,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'All submitted sheets approved',
        status: waiting || notIn ? 'Blocking' : 'Complete',
        to: results,
      },
      {
        label: 'Results published',
        detail: armIds.length
          ? `${pub} of ${plural(armIds.length, 'class', 'classes')} published`
          : 'No results recorded this term',
        // A term with no result sheets (results not kept in EduTrack yet) has nothing to wait for.
        status:
          !armIds.length || pub === armIds.length ? 'Complete' : pub ? 'In progress' : 'Pending',
        to: results,
      },
      {
        label: 'Unresolved student decisions',
        detail: 'None',
        status: 'Complete',
        to: results,
      },
      {
        label: 'Fee review',
        detail: 'Outstanding balances stay attached to this term and do not block closing.',
        status: 'Optional',
        to: null,
      },
    ];
    const blocking = items.filter((i) => ['Blocking', 'Pending', 'In progress'].includes(i.status));
    const end = isoDate(term.endsOn);
    const early = this.today() < end;
    return {
      termId: term.id,
      title: `${term.name} closing checklist`,
      items,
      canClose: !blocking.length && !early,
      reason: early
        ? `Available after ${fmtDate(end, false)} once blocking items are resolved.`
        : blocking.length
          ? `Blocked by ${plural(blocking.length, 'item')} above.`
          : '',
    };
  }

  private async copyAreas(): Promise<SessionsView['copyAreas']> {
    const db = this.db;
    const [sections, levels, arms, subjects, curricula, schemes, assignments] = await Promise.all([
      db.section.count(),
      db.branchLevel.count(),
      db.classArm.count({ where: { archivedAt: null } }),
      db.subject.count({ where: { status: 'ACTIVE' } }),
      db.curriculumEntry.groupBy({ by: ['levelId'] }),
      db.assessmentScheme.count(),
      db.teachingAssignment.count(),
    ]);
    const rows: [CopyArea, string, string][] = [
      ['sections', 'Academic sections', plural(sections, 'section')],
      ['classes', 'Class levels', plural(levels, 'level')],
      ['arms', 'Class arms', plural(arms, 'arm')],
      ['subjects', 'Subjects', plural(subjects, 'active subject')],
      [
        'curriculum',
        'Curriculum',
        `${plural(curricula.length, 'curriculum', 'curricula')} · elective groups`,
      ],
      ['grading', 'Grading scales', plural(schemes, 'scale')],
      ['assessment', 'Assessment scheme', 'CA and exam weights'],
      ['assignments', 'Teacher assignments', plural(assignments, 'assignment')],
      ['timetable', 'Timetables', 'Copied as drafts'],
      ['calendar', 'Calendar pattern', 'Term breaks and events, shifted to the new dates'],
    ];
    return rows.map(([id, label, detail]) => ({ id, label, detail }));
  }

  /* ---------------- Create ---------------- */

  async create(schoolId: string, p: NewSessionDto): Promise<SessionView> {
    const name = (p.name ?? '').trim();
    if (!name) throw fail('Name the session, e.g. 2027/2028.', 'VALIDATION');
    const all = await this.db.academicSession.findMany({ include: termInclude });
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      throw fail(`${name} already exists.`, 'SESSION_NAME_TAKEN');
    if (!isIso(p.start) || !isIso(p.end))
      throw fail('Choose the start and end dates.', 'VALIDATION');
    if (p.end <= p.start) throw fail('The session must end after it starts.', 'VALIDATION');
    const months = days(p.start, p.end) / 30.44;
    if (months < 5 || months > 15)
      throw fail('A session runs between 5 and 15 months.', 'SESSION_LENGTH');
    const overlap = all.find((s) => p.start <= isoDate(s.endsOn) && p.end >= isoDate(s.startsOn));
    if (overlap)
      throw fail(
        `These dates overlap ${overlap.name} (${fmtDate(overlap.startsOn)} – ${fmtDate(overlap.endsOn)}).`,
        'SESSION_OVERLAP',
      );
    const names = (p.termNames ?? []).map((n) => n.trim());
    if (names.length < 1 || names.length > 4)
      throw fail('Use between 1 and 4 terms.', 'VALIDATION');
    if (names.some((n) => !n)) throw fail('Name every term.', 'VALIDATION');
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
      throw fail('Term names must be different.', 'VALIDATION');

    const first = !all.some((s) => ['ACTIVE', 'UPCOMING'].includes(s.status));
    const from =
      all.find((s) => s.status === 'ACTIVE') ??
      all
        .filter((s) => s.status === 'UPCOMING')
        .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())[0] ??
      null;
    const copy = p.copy ?? [];
    const status: SessionStatus = first ? 'ACTIVE' : 'UPCOMING';
    const terms = evenTerms(p.start, p.end, names);

    const id = await this.db.$transaction(async (tx) => {
      const session = await tx.academicSession.create({
        data: {
          schoolId,
          name,
          startsOn: fromIso(p.start),
          endsOn: fromIso(p.end),
          status,
          structure: structureFromLabel(p.structure),
          note:
            from && copy.length
              ? `Configuration copied from ${from.name}`
              : first
                ? 'First session on Edutrack'
                : 'Started blank',
          copiedFromId: from && copy.length ? from.id : null,
        },
      });
      for (const [i, t] of terms.entries()) {
        const term = await tx.term.create({
          data: {
            schoolId,
            sessionId: session.id,
            name: t.name,
            sequence: i + 1,
            startsOn: fromIso(t.start),
            endsOn: fromIso(t.end),
            status: first && i === 0 ? 'ACTIVE' : 'UPCOMING',
          },
        });
        // The calendar pattern: the same term's events, shifted by the difference in start dates.
        const src = from && copy.includes('calendar') ? from.terms[i] : undefined;
        if (!src) continue;
        const shift = days(isoDate(src.startsOn), t.start);
        const events = src.events
          .map((e) => ({
            schoolId,
            termId: term.id,
            type: e.type,
            name: e.name,
            closesSchool: e.closesSchool,
            start: addDays(isoDate(e.startsOn), shift),
            end: addDays(isoDate(e.endsOn), shift),
          }))
          .filter((e) => e.start >= t.start && e.end <= t.end);
        if (events.length)
          await tx.termEvent.createMany({
            data: events.map(({ start, end, ...e }) => ({
              ...e,
              startsOn: fromIso(start),
              endsOn: fromIso(end),
            })),
          });
      }
      await this.setupState.confirm(ACADEMIC_STEP.session, tx);
      await this.audit.record(
        {
          action: 'session.create',
          area: 'Academic',
          entity: 'AcademicSession',
          entityId: session.id,
          summary: `Session ${name} created`,
          detail: `${SESSION_STATUS[status]} · ${plural(names.length, 'term')}`,
        },
        asTx(tx),
      );
      return session.id;
    });
    return this.sessionView(id);
  }

  /* ---------------- Terms ---------------- */

  private validateTerms(session: SessionRow, terms: TermInputDto[]) {
    const start = isoDate(session.startsOn);
    const end = isoDate(session.endsOn);
    if (!terms.length || terms.length > 4) throw fail('Use between 1 and 4 terms.', 'VALIDATION');
    const names = new Set<string>();
    for (const t of terms) {
      const name = (t.name ?? '').trim();
      if (!name) throw fail('Name every term.', 'VALIDATION');
      if (names.has(name.toLowerCase())) throw fail('Term names must be different.', 'VALIDATION');
      names.add(name.toLowerCase());
      if (!isIso(t.start) || !isIso(t.end))
        throw fail(`${name}: choose its start and end dates.`, 'VALIDATION');
      if (t.end <= t.start) throw fail(`${name} must end after it starts.`, 'TERM_DATES');
      if (t.start < start || t.end > end)
        throw fail(
          `${name} must fall within the session (${fmtDate(start)} – ${fmtDate(end)}).`,
          'TERM_DATES',
        );
      if (days(t.start, t.end) < 28) throw fail(`${name} is shorter than 4 weeks.`, 'TERM_DATES');
      for (const e of t.events ?? []) {
        const en = (e.name ?? '').trim();
        if (!en) throw fail(`${name}: name every event.`, 'VALIDATION');
        if (!isIso(e.start) || !isIso(e.end))
          throw fail(`${name} · ${en}: choose its dates.`, 'VALIDATION');
        if (e.end < e.start) throw fail(`${name} · ${en} ends before it starts.`, 'TERM_DATES');
        if (e.start < t.start || e.end > t.end)
          throw fail(`${name} · ${en} must fall within the term.`, 'TERM_DATES');
      }
    }
    const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((t, i) => {
      const next = sorted[i + 1];
      if (next && next.start <= t.end)
        throw fail(`${t.name.trim()} and ${next.name.trim()} overlap.`, 'TERM_OVERLAP');
    });
  }

  /** Replaces the session's terms and their events; kept terms keep their status and records. */
  async saveTerms(schoolId: string, id: string, terms: TermInputDto[]): Promise<SessionView> {
    const session = await this.db.academicSession.findUnique({
      where: { id },
      include: termInclude,
    });
    if (!session) throw AppException.notFound(SESSION_NOT_FOUND, 'SESSION_NOT_FOUND');
    if (['CLOSED', 'ARCHIVED'].includes(session.status))
      throw fail(`${session.name} is closed and read-only.`, 'SESSION_CLOSED', HttpStatus.CONFLICT);
    this.validateTerms(session, terms);

    const kept = session.terms.filter((t) => terms.some((x) => x.id === t.id));
    const removed = session.terms.filter((t) => !kept.includes(t));
    if (removed.length) {
      const ids = removed.map((t) => t.id);
      const [sheets, timetables] = await Promise.all([
        this.db.resultSheet.findMany({ where: { termId: { in: ids } }, select: { termId: true } }),
        this.db.timetable.findMany({ where: { termId: { in: ids } }, select: { termId: true } }),
      ]);
      const withData = removed.filter((t) =>
        [...sheets, ...timetables].some((x) => x.termId === t.id),
      );
      if (withData.length)
        throw fail(
          `${withData.map((t) => t.name).join(', ')} already has results or timetables and can't be removed.`,
          'TERM_HAS_RECORDS',
          HttpStatus.CONFLICT,
        );
    }

    const ordered = [...terms].sort((a, b) => a.start.localeCompare(b.start));
    await this.db.$transaction(async (tx) => {
      const eventIds = new Set(session.terms.flatMap((t) => t.events.map((e) => e.id)));
      await tx.termEvent.deleteMany({ where: { termId: { in: session.terms.map((t) => t.id) } } });
      if (removed.length)
        await tx.term.deleteMany({ where: { id: { in: removed.map((t) => t.id) } } });
      // Park kept terms so reordering and renames don't trip (session, sequence/name) keys.
      for (const [i, t] of kept.entries())
        await tx.term.update({
          where: { id: t.id },
          data: { sequence: 1000 + i, name: `~${t.id}` },
        });

      const termIds: string[] = [];
      for (const [i, t] of ordered.entries()) {
        const old = kept.find((k) => k.id === t.id);
        const data = {
          name: t.name.trim(),
          sequence: i + 1,
          startsOn: fromIso(t.start),
          endsOn: fromIso(t.end),
        };
        const row = old
          ? await tx.term.update({ where: { id: old.id }, data })
          : await tx.term.create({
              data: { schoolId, sessionId: session.id, status: 'UPCOMING', ...data },
            });
        termIds.push(row.id);
        const events = t.events ?? [];
        if (events.length)
          await tx.termEvent.createMany({
            data: events.map((e) => ({
              ...(e.id && eventIds.has(e.id) && { id: e.id }),
              schoolId,
              termId: row.id,
              type: eventTypeToDb(e.type),
              name: e.name.trim(),
              startsOn: fromIso(e.start),
              endsOn: fromIso(e.end),
              closesSchool: e.type === 'midterm',
            })),
          });
      }
      // An active session always has a term under way.
      if (session.status === 'ACTIVE') {
        const live = await tx.term.count({
          where: { sessionId: session.id, status: { in: ['ACTIVE', 'ENDED', 'CLOSED'] } },
        });
        if (!live) await tx.term.update({ where: { id: termIds[0]! }, data: { status: 'ACTIVE' } });
      }
      await this.setupState.confirm(ACADEMIC_STEP.terms, tx);
      await this.audit.record(
        {
          action: 'session.terms',
          area: 'Academic',
          entity: 'AcademicSession',
          entityId: session.id,
          summary: `Terms saved for ${session.name}`,
          detail: plural(terms.length, 'term'),
        },
        asTx(tx),
      );
    });
    return this.sessionView(session.id);
  }

  /* ---------------- Start ---------------- */

  async start(id: string): Promise<SessionView> {
    const session = await this.db.academicSession.findUnique({
      where: { id },
      include: termInclude,
    });
    if (!session) throw AppException.notFound(SESSION_NOT_FOUND, 'SESSION_NOT_FOUND');
    if (session.status !== 'UPCOMING')
      throw fail(
        'Only an upcoming session can be started.',
        'SESSION_NOT_UPCOMING',
        HttpStatus.CONFLICT,
      );
    const active = await this.db.academicSession.findFirst({
      where: { status: 'ACTIVE' },
      include: termInclude,
    });
    if (active && active.terms.some((t) => t.status !== 'CLOSED'))
      throw fail(
        `Close every term of ${active.name} first. ${active.name} then moves to Closing.`,
        'SESSION_TERMS_OPEN',
        HttpStatus.CONFLICT,
      );
    await this.db.$transaction(async (tx) => {
      if (active)
        await tx.academicSession.update({ where: { id: active.id }, data: { status: 'CLOSING' } });
      await tx.academicSession.update({ where: { id: session.id }, data: { status: 'ACTIVE' } });
      const first = session.terms[0];
      if (first) await tx.term.update({ where: { id: first.id }, data: { status: 'ACTIVE' } });
      await this.audit.record(
        {
          action: 'session.start',
          area: 'Academic',
          entity: 'AcademicSession',
          entityId: session.id,
          summary: `Session ${session.name} started`,
          detail: active ? `${active.name} moved to Closing` : null,
        },
        asTx(tx),
      );
    });
    return this.sessionView(session.id);
  }

  /* ---------------- Close a term ---------------- */

  /**
   * Closes the active term once its end date has passed and its results are done: its registers,
   * scores, assignments and timetables become read-only, and the session's next term becomes the
   * active one (teachers plan and the office sets up for it; its registers open on its first day).
   * The last term of a session stays closed until the next session starts.
   */
  async closeTerm(id: string) {
    const session = await this.db.academicSession.findFirst({
      where: { status: 'ACTIVE' },
      include: termInclude,
    });
    const term = session?.terms.find((t) => t.status === 'ACTIVE');
    if (!session || !term || term.id !== id)
      throw fail('Only the active term can be closed.', 'TERM_NOT_ACTIVE', HttpStatus.CONFLICT);
    const checklist = await this.termChecklist(session);
    if (!checklist?.canClose)
      throw fail(
        checklist?.reason || 'Resolve the blocking items first.',
        'TERM_NOT_READY',
        HttpStatus.CONFLICT,
      );
    const next = session.terms.find((t) => t.sequence > term.sequence && t.status === 'UPCOMING');
    await this.db.$transaction(async (tx) => {
      await tx.term.update({
        where: { id: term.id },
        data: { status: 'CLOSED', closedAt: this.clock.now() },
      });
      if (next) await tx.term.update({ where: { id: next.id }, data: { status: 'ACTIVE' } });
      await this.audit.record(
        {
          action: 'term.close',
          area: 'Academic',
          entity: 'Term',
          entityId: term.id,
          summary: `${term.name} closed · ${session.name}`,
          detail: next
            ? `Now read-only · ${next.name} is the active term`
            : `Now read-only · the last term of ${session.name}`,
        },
        asTx(tx),
      );
    });
    return { ok: true as const, next: next?.name ?? null };
  }

  /* ---------------- Close a session ---------------- */

  /**
   * Whether a session can close. A session moves to Closing when the next one starts; it closes
   * once every term is closed. Promotion and fees are reminders, not blockers: schools often
   * settle promotion appeals and old balances into the new session.
   */
  async sessionChecklist(id: string) {
    const session = await this.db.academicSession.findUnique({
      where: { id },
      include: termInclude,
    });
    if (!session) throw AppException.notFound(SESSION_NOT_FOUND, 'SESSION_NOT_FOUND');
    const termIds = session.terms.map((t) => t.id);
    const [open, sheets, published, left, notPlaced, promotion] = await Promise.all([
      Promise.resolve(session.terms.filter((t) => t.status !== 'CLOSED')),
      this.db.resultSheet.findMany({
        where: { termId: { in: termIds } },
        select: { status: true, armId: true, termId: true },
      }),
      this.db.resultPublication.findMany({
        where: { termId: { in: termIds } },
        select: { armId: true, termId: true },
      }),
      this.db.enrollment.findMany({
        where: { sessionId: id, status: 'LEFT' },
        select: { student: { select: { status: true } } },
      }),
      this.db.enrollment.count({ where: { sessionId: id, status: 'ACTIVE', armId: null } }),
      promotionProgress(this.db, id),
    ]);
    const unapproved = sheets.filter((x) => x.status !== 'APPROVED').length;
    const published_ = new Set(published.map((p) => `${p.termId}:${p.armId}`));
    const toPublish = new Set(sheets.map((x) => `${x.termId}:${x.armId}`));
    const unpublished = [...toPublish].filter((k) => !published_.has(k)).length;
    const transfers = left.filter((e) => e.student.status === 'TRANSFERRED').length;
    const withdrawals = left.filter((e) => e.student.status === 'WITHDRAWN').length;
    const sessions = { name: 'sessions' };
    const items: ChecklistItemView[] = [
      {
        label: 'Terms closed',
        detail: open.length
          ? `${open.map((t) => t.name).join(', ')} still open`
          : `All ${plural(session.terms.length, 'term')} closed`,
        status: open.length ? 'Blocking' : 'Complete',
        to: sessions,
      },
      {
        label: 'Results complete and approved',
        detail: sheets.length
          ? unapproved
            ? `${plural(unapproved, 'sheet')} not approved`
            : `All ${plural(sheets.length, 'sheet')} approved`
          : 'No results recorded this session',
        status: unapproved ? 'Blocking' : 'Complete',
        to: { name: 'results' },
      },
      {
        label: 'Results published',
        detail: toPublish.size
          ? unpublished
            ? `${plural(unpublished, 'class result', 'class results')} not published`
            : 'Every class’s results are published'
          : 'Nothing to publish',
        status: unpublished ? 'Blocking' : 'Complete',
        to: { name: 'results' },
      },
      {
        label: 'Students awaiting a class',
        detail: notPlaced
          ? `${plural(notPlaced, 'student')} admitted but never placed in an arm`
          : 'Every student was placed in a class',
        status: notPlaced ? 'Review needed' : 'Complete',
        to: { name: 'students' },
      },
      {
        label: 'Transfers and withdrawals processed',
        detail: `${plural(transfers, 'transfer')} · ${plural(withdrawals, 'withdrawal')}`,
        status: 'Complete',
        to: null,
      },
      {
        // A reminder, not a blocker: schools settle promotion appeals into the new session.
        label: 'Promotion',
        detail: !promotion.classes
          ? 'No classes to promote'
          : promotion.applied === promotion.classes
            ? `All ${plural(promotion.classes, 'class', 'classes')} promoted`
            : `${promotion.applied} of ${plural(promotion.classes, 'class', 'classes')} promoted`,
        status: promotion.applied === promotion.classes ? 'Complete' : 'Review needed',
        to: { name: 'promotion' },
      },
      {
        label: 'Financial review',
        detail: 'Outstanding balances carry over to the new session and don’t block closing.',
        status: 'Optional',
        to: null,
      },
    ];
    const blocking = items.filter((i) => i.status === 'Blocking').length;
    const done = session.status === 'CLOSED' || session.status === 'ARCHIVED';
    const reason = done
      ? `${session.name} is closed.`
      : session.status !== 'CLOSING'
        ? `${session.name} is ${SESSION_STATUS[session.status].toLowerCase()}. A session closes after the next one starts.`
        : blocking
          ? `Blocked by ${plural(blocking, 'item')} above.`
          : '';
    return {
      session: this.toView(session, (await this.studentCounts()).get(id) ?? 0),
      checklist: {
        title: `Close ${session.name}`,
        items,
        canClose: session.status === 'CLOSING' && !blocking,
        reason,
      },
    };
  }

  /** Closes a session: everything in it becomes read-only and its enrollments are complete. */
  async closeSession(id: string) {
    const { checklist } = await this.sessionChecklist(id);
    if (!checklist.canClose)
      throw fail(
        checklist.reason || 'Resolve the blocking items first.',
        'SESSION_NOT_READY',
        HttpStatus.CONFLICT,
      );
    const session = await this.db.academicSession.findUniqueOrThrow({ where: { id } });
    await this.db.$transaction(async (tx) => {
      await tx.academicSession.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: this.clock.now() },
      });
      // Students who finished the year in this session: their place in it is complete.
      const { count } = await tx.enrollment.updateMany({
        where: { sessionId: id, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
      await this.audit.record(
        {
          action: 'session.close',
          area: 'Academic',
          entity: 'AcademicSession',
          entityId: id,
          summary: `Session ${session.name} closed`,
          detail: `Now read-only · ${plural(count, 'enrollment')} completed`,
        },
        asTx(tx),
      );
    });
    return this.sessionChecklist(id);
  }
}
