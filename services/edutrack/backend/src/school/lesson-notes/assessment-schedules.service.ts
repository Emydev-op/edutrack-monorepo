import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { fromIso, isIso, isoDate, staffName } from '../academics/academic-format.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { localDay } from '../communication/comms-time.js';
import { ResultsCoreService, type SheetCtx, stamp } from '../results/results-core.service.js';
import type { Scheme } from '../results/scoring.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import { dayLabel } from './lesson-weeks.js';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
type Assignment = Awaited<ReturnType<TeacherScopeService['assignments']>>[number];

const TONE: Record<string, Tone> = {
  'assessment.schedule': 'info',
  'assessment.reschedule': 'warning',
  'assessment.update': 'neutral',
};

const invalid = (field: string, message: string) =>
  AppException.validation({ [field]: message }, message);
const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
/** "18 Nov 2026". */
const longDay = (iso: string) => `${dayLabel(iso)} ${iso.slice(0, 4)}`;

/**
 * Teacher Workspace › Assessments: the school's scheme per section (read-only) and when each of
 * its components (CA 1, CA 2, the exam) is taken by a class I teach (lead or co-teacher), at most
 * once per class per term. Counts of scored, absent and exempt students come from the class's
 * result sheet. A date must be a school day in the term, today or later; it can't move once the
 * day has passed or scores are on the sheet. Past and upcoming terms are read-only.
 */
@Injectable()
export class AssessmentSchedulesService {
  constructor(
    private readonly scope: TeacherScopeService,
    private readonly core: ResultsCoreService,
    private readonly attendance: AttendanceService,
    private readonly audit: SchoolAuditService,
  ) {}

  get db() {
    return this.scope.db;
  }

  private today() {
    return localDay(this.core.now());
  }

  /** My class × subject pairs with the section's score-based scheme. */
  private async mine(staffId: string, term: TermRow) {
    const [assignments, schemes, codes] = await Promise.all([
      this.scope.assignments(staffId, term.id),
      this.core.schemes(term.sessionId),
      this.core.sectionCodes(),
    ]);
    const out: { a: Assignment; scheme: Scheme; section: string }[] = [];
    for (const a of assignments) {
      const scheme = schemes.get(a.arm.sectionId);
      if (scheme?.mode === 'SCORES')
        out.push({ a, scheme, section: codes.get(a.arm.sectionId) ?? a.arm.section });
    }
    return out;
  }

  /** The result sheets of these pairs (created when missing, like My results). */
  private async sheets(term: TermRow, pairs: { armId: string; subjectId: string }[]) {
    const info = await this.core.term(term.id);
    const sheets = await this.core.ensureSheets(info, pairs);
    const ctxs = await this.core.contexts(sheets, info);
    return new Map(ctxs.map((c) => [`${c.sheet.armId}|${c.sheet.subjectId}`, c]));
  }

  private static counts(ctx: SheetCtx | undefined, componentId: string) {
    if (!ctx) return { students: 0, scored: 0, absent: 0, exempt: 0, missing: 0, sheetId: '' };
    const i = ctx.scheme.components.findIndex((c) => c.id === componentId);
    let scored = 0;
    let absent = 0;
    let exempt = 0;
    for (const row of ctx.rows) {
      const v = i >= 0 ? row.scores[i] : null;
      if (typeof v === 'number') scored++;
      else if (v === 'ABS') absent++;
      else if (v === 'EXM') exempt++;
    }
    const students = ctx.rows.length;
    return {
      students,
      scored,
      absent,
      exempt,
      missing: students - scored - absent - exempt,
      sheetId: ctx.sheet.id,
    };
  }

  private summary(
    row: {
      id: string;
      termId: string;
      armId: string;
      subjectId: string;
      componentId: string;
      scheduledOn: Date;
      topics: string;
    },
    a: Assignment,
    scheme: Scheme,
    ctx: SheetCtx | undefined,
  ) {
    const comp = scheme.components.find((c) => c.id === row.componentId);
    const counts = AssessmentSchedulesService.counts(ctx, row.componentId);
    const date = isoDate(row.scheduledOn);
    return {
      id: row.id,
      termId: row.termId,
      armId: a.armId,
      arm: a.arm.label,
      subject: a.subject.code,
      subjectName: a.subject.name,
      branchName: a.arm.branch,
      componentKey: comp?.key ?? '',
      component: comp?.name ?? 'Removed component',
      max: comp?.max ?? 0,
      weight: comp?.weight ?? 0,
      date,
      topics: row.topics,
      status:
        date > this.today()
          ? ('Scheduled' as const)
          : counts.students > 0 && counts.missing === 0
            ? ('Scored' as const)
            : ('Done' as const),
      ...counts,
    };
  }

  async list(auth: AuthUserContext, q: { term?: string; class?: string; subject?: string }) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(q.term);
    const mine = await this.mine(s.id, term);
    const sections = new Map<string, { section: string; sectionName: string; scheme: Scheme }>();
    for (const m of mine)
      if (!sections.has(m.section))
        sections.set(m.section, {
          section: m.section,
          sectionName: m.a.arm.section,
          scheme: m.scheme,
        });
    const pairs = mine.filter(
      (m) => (!q.class || m.a.armId === q.class) && (!q.subject || m.a.subject.code === q.subject),
    );
    const rows = pairs.length
      ? await this.db.assessmentSchedule.findMany({
          where: {
            termId: term.id,
            OR: pairs.map((m) => ({ armId: m.a.armId, subjectId: m.a.subjectId })),
          },
        })
      : [];
    const ctxs = await this.sheets(
      term,
      pairs.map((m) => ({ armId: m.a.armId, subjectId: m.a.subjectId })),
    );
    return {
      termId: term.id,
      editable: term.status === 'ACTIVE',
      schemes: [...sections.values()]
        .sort((a, b) => a.section.localeCompare(b.section))
        .map((x) => ({
          section: x.section,
          sectionName: x.sectionName,
          scaleName: x.scheme.scaleName,
          components: ResultsCoreService.components(x.scheme),
        })),
      rows: rows
        .map((r) => {
          const m = pairs.find((p) => p.a.armId === r.armId && p.a.subjectId === r.subjectId)!;
          return this.summary(r, m.a, m.scheme, ctxs.get(`${r.armId}|${r.subjectId}`));
        })
        .sort((a, b) => b.date.localeCompare(a.date) || a.arm.localeCompare(b.arm)),
    };
  }

  async options(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const mine = await this.mine(s.id, term);
    const taken = await this.db.assessmentSchedule.findMany({
      where: { termId: term.id },
      select: { armId: true, subjectId: true, componentId: true },
    });
    return {
      termId: term.id,
      termStart: isoDate(term.startsOn),
      termEnd: isoDate(term.endsOn),
      today: this.today(),
      classes: mine.map(({ a, scheme, section }) => {
        const done = new Set(
          taken
            .filter((x) => x.armId === a.armId && x.subjectId === a.subjectId)
            .map((x) => x.componentId),
        );
        return {
          assignmentId: a.id,
          armId: a.armId,
          arm: a.arm.label,
          subject: a.subject.code,
          subjectName: a.subject.name,
          branchName: a.arm.branch,
          section,
          available: ResultsCoreService.components({
            ...scheme,
            components: scheme.components.filter((c) => !done.has(c.id)),
          }),
        };
      }),
    };
  }

  /**
   * A real date in the term, a school day, and (for a new date) today or later. 422 on `date`.
   */
  private async checkDate(term: TermRow, date: unknown, isNew: boolean) {
    if (!isIso(date)) throw invalid('date', 'Choose a date.');
    const start = isoDate(term.startsOn);
    const end = isoDate(term.endsOn);
    if (date < start || date > end)
      throw invalid(
        'date',
        `Choose a date inside ${term.name} (${longDay(start)} – ${longDay(end)}).`,
      );
    const today = this.today();
    if (isNew && date < today)
      throw invalid('date', `Choose today (${longDay(today)}) or a later date.`);
    const weekday = fromIso(date).getUTCDay();
    const closed =
      weekday === 0 || weekday === 6 ? 'Weekend' : (await this.attendance.closures(term)).get(date);
    if (closed) throw invalid('date', `There are no classes on ${longDay(date)} (${closed}).`);
    return date;
  }

  private static text(body: { topics?: unknown; instructions?: unknown }) {
    const topics = typeof body.topics === 'string' ? body.topics.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    const fields: Record<string, string> = {};
    if (topics.length < 3) fields.topics = 'List the topics it covers.';
    else if (topics.length > 300) fields.topics = 'Keep the topics under 300 characters.';
    if (instructions.length > 1000)
      fields.instructions = 'Keep the instructions under 1,000 characters.';
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Check the highlighted fields.');
    return { topics, instructions };
  }

  private static termLocked(term: TermRow) {
    const reason = TeacherScopeService.lockReason(term);
    if (reason) throw conflict(reason, 'TERM_LOCKED');
  }

  async create(
    auth: AuthUserContext,
    termId: string | undefined,
    body: {
      armId?: string;
      subject?: string;
      componentKey?: string;
      date?: unknown;
      topics?: string;
      instructions?: string;
    },
  ) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    AssessmentSchedulesService.termLocked(term);
    if (!body.armId || !body.subject) throw invalid('classKey', 'Choose one of your classes.');
    const mine = await this.mine(s.id, term);
    const m = mine.find((x) => x.a.armId === body.armId && x.a.subject.code === body.subject);
    if (!m) {
      const all = await this.scope.assignments(s.id, term.id);
      if (all.some((a) => a.armId === body.armId && a.subject.code === body.subject))
        throw invalid('classKey', 'This class’s section has no score-based assessment scheme.');
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t teach that class and subject this term. Choose one of your classes.',
        'FORBIDDEN',
      );
    }
    const comp = m.scheme.components.find((c) => c.key === body.componentKey);
    if (!comp) throw invalid('componentKey', 'Choose a component from the school’s scheme.');
    const date = await this.checkDate(term, body.date, true);
    const { topics, instructions } = AssessmentSchedulesService.text(body);
    const existing = await this.db.assessmentSchedule.findFirst({
      where: { termId: term.id, armId: m.a.armId, subjectId: m.a.subjectId, componentId: comp.id },
    });
    if (existing)
      throw conflict(
        `${comp.name} is already scheduled for ${m.a.arm.label} · ${m.a.subject.name} on ${longDay(isoDate(existing.scheduledOn))}. Reschedule it instead.`,
        'DUPLICATE',
      );
    const id = await this.db.$transaction(async (tx) => {
      const row = await tx.assessmentSchedule.create({
        data: {
          schoolId: TeacherScopeService.schoolId(),
          termId: term.id,
          armId: m.a.armId,
          subjectId: m.a.subjectId,
          componentId: comp.id,
          teachingAssignmentId: m.a.id,
          scheduledOn: fromIso(date),
          topics,
          instructions,
          createdById: auth.userId,
          createdAt: this.core.now(),
        },
      });
      await this.audit.record(
        {
          action: 'assessment.schedule',
          area: 'Academic',
          entity: 'AssessmentSchedule',
          entityId: row.id,
          summary: `Scheduled by ${staffName(s)}`,
          detail: `${comp.name} · ${longDay(date)}`,
        },
        asTx(tx),
      );
      return row.id;
    });
    return this.get(auth, id);
  }

  /** One of my classes' schedules, with its class and scheme (403 for other classes). */
  private async own(auth: AuthUserContext, id: string) {
    const s = await this.scope.staff(auth);
    const row = await this.db.assessmentSchedule.findFirst({ where: { id } });
    if (!row) throw AppException.notFound('That assessment doesn’t exist.', 'NOT_FOUND');
    const term = await this.scope.term(row.termId);
    const m = (await this.mine(s.id, term)).find(
      (x) => x.a.armId === row.armId && x.a.subjectId === row.subjectId,
    );
    if (!m)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t have access to that assessment. It’s for a class and subject you don’t teach this term.',
        'FORBIDDEN',
      );
    return { s, row, term, m };
  }

  async get(auth: AuthUserContext, id: string) {
    const { row, term, m } = await this.own(auth, id);
    const ctx = (await this.sheets(term, [{ armId: row.armId, subjectId: row.subjectId }])).get(
      `${row.armId}|${row.subjectId}`,
    );
    const events = await this.db.auditEvent.findMany({
      where: { entityType: 'AssessmentSchedule', entityId: row.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const date = isoDate(row.scheduledOn);
    return {
      ...this.summary(row, m.a, m.scheme, ctx),
      instructions: row.instructions,
      canReschedule: term.status === 'ACTIVE' && date >= this.today(),
      history: events.map((e) => ({
        id: e.id,
        title: e.summary,
        detail: e.detail ?? undefined,
        tone: TONE[e.action] ?? ('neutral' as Tone),
        when: stamp(e.createdAt),
      })),
    };
  }

  async update(
    auth: AuthUserContext,
    id: string,
    body: { date?: unknown; topics?: string; instructions?: string },
  ) {
    const { s, row, term, m } = await this.own(auth, id);
    AssessmentSchedulesService.termLocked(term);
    const from = isoDate(row.scheduledOn);
    if (from < this.today())
      throw conflict(
        `This assessment took place on ${longDay(from)}. Enter its scores on the sheet instead.`,
        'ALREADY_TAKEN',
      );
    const wanted = body.date ?? from;
    const moved = wanted !== from;
    if (moved) {
      const ctx = (await this.sheets(term, [{ armId: row.armId, subjectId: row.subjectId }])).get(
        `${row.armId}|${row.subjectId}`,
      );
      const c = AssessmentSchedulesService.counts(ctx, row.componentId);
      if (c.scored + c.absent + c.exempt > 0)
        throw conflict(
          'Scores for this component are already on the result sheet, so its date can’t move. You can still change the topics and instructions.',
          'SCORES_ENTERED',
        );
    }
    const date = await this.checkDate(term, wanted, moved);
    const { topics, instructions } = AssessmentSchedulesService.text(body);
    const comp = m.scheme.components.find((c) => c.id === row.componentId);
    await this.db.$transaction(async (tx) => {
      await tx.assessmentSchedule.update({
        where: { id: row.id },
        data: { scheduledOn: fromIso(date), topics, instructions },
      });
      await this.audit.record(
        moved
          ? {
              action: 'assessment.reschedule',
              area: 'Academic',
              entity: 'AssessmentSchedule',
              entityId: row.id,
              summary: `Rescheduled by ${staffName(s)}`,
              detail: `${comp?.name ?? 'Assessment'} · ${longDay(from)} → ${longDay(date)}`,
            }
          : {
              action: 'assessment.update',
              area: 'Academic',
              entity: 'AssessmentSchedule',
              entityId: row.id,
              summary: `Details updated by ${staffName(s)}`,
              detail: 'Topics and instructions',
            },
        asTx(tx),
      );
    });
    return this.get(auth, row.id);
  }
}
