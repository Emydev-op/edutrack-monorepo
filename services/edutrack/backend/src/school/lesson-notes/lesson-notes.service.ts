import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { LessonNoteStatus } from '../../generated/prisma/enums.js';
import { fromIso, isoDate, plural, staffName } from '../academics/academic-format.js';
import { localDay, localStamp } from '../communication/comms-time.js';
import { HomeworkFilesService } from '../homework/homework-files.js';
import { sizeText } from '../profile/school-files.js';
import { stamp } from '../results/results-core.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import {
  currentWeek,
  dayLabel,
  shortDay,
  termWeeks,
  type Closure,
  type TermWeek,
} from './lesson-weeks.js';

type Staff = Awaited<ReturnType<TeacherScopeService['staff']>>;
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export type NoteStatusLabel = 'Draft' | 'Submitted' | 'Approved' | 'Returned';
type SlotStatus = NoteStatusLabel | 'Not written';

export const NOTE_STATUS: Record<LessonNoteStatus, NoteStatusLabel> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
};

/** The Teacher Workspace's limits (`LESSON_NOTE_LIMITS`). */
export const NOTE_LIMITS = {
  topic: { min: 3, max: 120 },
  objectives: { min: 1, max: 5, each: 200 },
  content: { min: 50, max: 5000 },
  schemeTopic: 120,
  attachmentBytes: 10 * 1024 * 1024,
} as const;

export const FILED_BY_HEAD = 'Filed by the Academic Head — no review needed';
const NO_REVIEW = 'No review needed (Academic Head)';
const OFFICE = 'the academic office';

const person = { select: { id: true, title: true, firstName: true, lastName: true } } as const;

export const NOTE_INCLUDE = {
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      department: { select: { id: true, name: true, hodStaffId: true } },
    },
  },
  level: { select: { id: true, name: true, sectionId: true } },
  teacher: person,
  reviewer: person,
  attachmentFile: {
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, storageKey: true },
  },
} satisfies Prisma.LessonNoteInclude;
export type NoteRow = Prisma.LessonNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

/** Where a note goes on submit: a reviewer (HOD or Academic Head), the academic office, or filed. */
export interface Chain {
  reviewerId: string | null;
  /** The Academic Head's own note with no HOD above it: filed as Approved, no review. */
  filed: boolean;
}
export type ChainFor = (o: {
  teacherId: string;
  teacherIsHead: boolean;
  hodId: string | null;
  sectionId: string;
}) => Chain;

/** A subject and class level I lead, e.g. Mathematics · JSS 2. */
interface Slot {
  key: string;
  subjectId: string;
  code: string;
  subjectName: string;
  levelId: string;
  level: string;
  label: string;
  chain: Chain;
}

interface TermCtx {
  term: TermRow;
  weeks: TermWeek[];
  today: string;
  cw: number;
}

export interface NoteRowView {
  key: string;
  week: number;
  weekLabel: string;
  midterm: boolean;
  due: string;
  subject: string;
  subjectName: string;
  level: string;
  label: string;
  status: SlotStatus;
  overdue: boolean;
  dueThisWeek: boolean;
  noteId: string | null;
  topic: string | null;
  returnComment: string;
}

interface CleanNote {
  topic: string;
  objectives: string[];
  content: string;
  schemeTopic: string;
  attachment: { id: string; name: string; bytes: number } | null;
  submit: boolean;
}

const TONE: Record<string, Tone> = {
  'lesson_note.create': 'neutral',
  'lesson_note.submit': 'info',
  'lesson_note.file': 'success',
  'lesson_note.approve': 'success',
  'lesson_note.return': 'error',
};

const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
const forbidden = (message: string) => new AppException(HttpStatus.FORBIDDEN, message, 'FORBIDDEN');
const NOT_YOURS =
  'You don’t have access to that lesson note. It belongs to another teacher. Your notes are under Lesson notes.';
const NOT_SENT: SlotStatus[] = ['Not written', 'Draft'];

/**
 * Weekly lesson notes in the Teacher Workspace: one per teacher × subject × class level × week of
 * the term, written by the subject's lead teacher in that class level (co-teachers don't write
 * one). Draft → Submitted → Approved, or Returned with the reviewer's comment and resubmitted to
 * the same reviewer. The reviewer is the department's HOD; departments with no HOD and the HODs'
 * own notes go to the Academic Head; the Academic Head's own notes are filed without review.
 * A note is due on the Friday before its week; unsent after that, it is overdue.
 */
@Injectable()
export class LessonNotesService {
  constructor(
    private readonly scope: TeacherScopeService,
    private readonly files: HomeworkFilesService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.scope.db;
  }

  private today() {
    return localDay(this.clock.now());
  }

  /* ---------------- Weeks and the review chain ---------------- */

  /** Mid-term breaks, public holidays and calendar closures that fall in the term. */
  private async closures(term: TermRow): Promise<Closure[]> {
    const [holidays, events, calendar] = await Promise.all([
      this.db.publicHoliday.findMany({
        where: { country: 'NG', date: { gte: term.startsOn, lte: term.endsOn } },
      }),
      this.db.termEvent.findMany({
        where: { termId: term.id, OR: [{ closesSchool: true }, { type: 'MIDTERM' }] },
      }),
      this.db.calendarEvent.findMany({
        where: {
          sessionId: term.sessionId,
          startsOn: { lte: term.endsOn },
          endsOn: { gte: term.startsOn },
          OR: [{ closesSchool: true }, { type: { in: ['HOLIDAY', 'BREAK'] } }],
        },
      }),
    ]);
    return [
      ...events.map((e) => ({
        from: isoDate(e.startsOn),
        to: isoDate(e.endsOn),
        name: e.name,
        midterm: e.type === 'MIDTERM' || /mid-?term/i.test(e.name),
      })),
      ...calendar.map((e) => ({
        from: isoDate(e.startsOn),
        to: isoDate(e.endsOn),
        name: e.title,
        midterm: /mid-?term/i.test(e.title),
      })),
      ...holidays.map((h) => ({
        from: isoDate(h.date),
        to: isoDate(h.date),
        name: h.name,
        midterm: false,
      })),
    ];
  }

  async termCtx(term: TermRow): Promise<TermCtx> {
    const weeks = termWeeks(
      { start: isoDate(term.startsOn), end: isoDate(term.endsOn) },
      await this.closures(term),
    );
    const today = this.today();
    return { term, weeks, today, cw: currentWeek(weeks, today) };
  }

  /**
   * The review chain: the department's HOD (never the teacher themself), else an Academic Head
   * (one covering the class level's section first, then a school-wide one). The Academic Head's
   * own notes with no HOD above them are filed without review; Academic Heads don't review each
   * other's notes. With nobody to send to, a note goes to the academic office (null).
   */
  async chainFor(): Promise<ChainFor> {
    const heads = await this.db.schoolMembership.findMany({
      where: {
        kind: 'STAFF',
        status: 'ACTIVE',
        staffId: { not: null },
        staff: { status: 'ACTIVE' },
        roles: { some: { role: { key: 'academic_head' } } },
      },
      select: {
        staffId: true,
        scope: true,
        sections: { select: { sectionId: true } },
        staff: { select: { staffNumber: true } },
      },
    });
    return ({ teacherId, teacherIsHead, hodId, sectionId }) => {
      if (hodId && hodId !== teacherId) return { reviewerId: hodId, filed: false };
      if (teacherIsHead) return { reviewerId: null, filed: true };
      const head = heads
        .filter(
          (h) =>
            h.staffId !== teacherId &&
            (!h.sections.length || h.sections.some((x) => x.sectionId === sectionId)),
        )
        .sort(
          (a, b) =>
            Number(b.sections.length > 0) - Number(a.sections.length > 0) ||
            Number(a.scope === 'BRANCH') - Number(b.scope === 'BRANCH') ||
            (a.staff?.staffNumber ?? '').localeCompare(b.staff?.staffNumber ?? ''),
        )[0];
      return { reviewerId: head?.staffId ?? null, filed: false };
    };
  }

  private async names(ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map<string, string>();
    const rows = await this.db.staff.findMany({ where: { id: { in: wanted } }, ...person });
    return new Map(rows.map((r) => [r.id, staffName(r)]));
  }

  /** The subjects and class levels I lead in a term, with where their notes go. */
  private async slots(s: Staff, term: TermRow, chain: ChainFor): Promise<Slot[]> {
    const mine = (await this.scope.assignments(s.id, term.id)).filter((a) => a.lead);
    const seen = new Map<string, Slot>();
    for (const a of mine) {
      const key = `${a.subject.code}|${a.arm.level}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        key,
        subjectId: a.subjectId,
        code: a.subject.code,
        subjectName: a.subject.name,
        levelId: a.arm.levelId,
        level: a.arm.level,
        label: `${a.arm.level} · ${a.subject.name}`,
        chain: chain({
          teacherId: s.id,
          teacherIsHead: s.roleKeys.includes('academic_head'),
          hodId: a.subject.department?.hodStaffId ?? null,
          sectionId: a.arm.sectionId,
        }),
      });
    }
    return [...seen.values()].sort(
      (a, b) => a.level.localeCompare(b.level) || a.subjectName.localeCompare(b.subjectName),
    );
  }

  /* ---------------- Views ---------------- */

  private static reviewerName(n: NoteRow) {
    return n.reviewer ? staffName(n.reviewer) : OFFICE;
  }

  /** Who the note shows as its reviewer: who it went to, or (unsent) where it would go. */
  private static reviewerOf(n: NoteRow, predicted: Chain | null, names: Map<string, string>) {
    if (n.filedWithoutReview || (!n.submittedAt && predicted?.filed)) return NO_REVIEW;
    if (n.submittedAt) return LessonNotesService.reviewerName(n);
    return predicted?.reviewerId ? (names.get(predicted.reviewerId) ?? OFFICE) : OFFICE;
  }

  private summary(
    n: NoteRow,
    tc: TermCtx,
    predicted: Chain | null = null,
    names = new Map<string, string>(),
  ) {
    const w = tc.weeks.find((x) => x.week === n.week);
    const due = isoDate(n.dueOn);
    return {
      id: n.id,
      subject: n.subject.code,
      subjectName: n.subject.name,
      level: n.level.name,
      week: n.week,
      weekLabel: w?.label ?? `Week ${n.week}`,
      topic: n.topic,
      status: NOTE_STATUS[n.status],
      due,
      overdue: tc.term.status === 'ACTIVE' && n.status === 'DRAFT' && due < tc.today,
      teacher: staffName(n.teacher),
      reviewer: LessonNotesService.reviewerOf(n, predicted, names),
      noReview: n.filedWithoutReview || (!n.submittedAt && !!predicted?.filed),
      submittedAt: n.submittedAt ? localStamp(n.submittedAt) : null,
      decidedAt: n.decidedAt ? localStamp(n.decidedAt) : null,
      returnComment: n.returnComment ?? '',
    };
  }

  /** Why the teacher can't change the note now, or null. */
  private static lock(n: NoteRow, term: TermRow) {
    const reason = TeacherScopeService.lockReason(term);
    if (reason) return reason;
    if (n.status === 'APPROVED')
      return n.filedWithoutReview
        ? 'Filed by you as Academic Head (no review needed). Filed notes are read-only.'
        : `Approved by ${LessonNotesService.reviewerName(n)}. Approved notes are read-only.`;
    if (n.status === 'SUBMITTED')
      return `With ${LessonNotesService.reviewerName(n)} for review. You can change it if it’s returned.`;
    return null;
  }

  /** The note's timeline from the audit trail, newest first. */
  private async history(noteId: string) {
    const events = await this.db.auditEvent.findMany({
      where: { entityType: 'LessonNote', entityId: noteId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return events.map((e) => ({
      id: e.id,
      title: e.summary,
      detail:
        e.action === 'lesson_note.return'
          ? (e.detail ?? undefined)
          : e.action === 'lesson_note.approve'
            ? undefined
            : e.actorName
              ? `By ${e.actorName}`
              : undefined,
      tone: TONE[e.action] ?? ('neutral' as Tone),
      when: stamp(e.createdAt),
    }));
  }

  private async view(
    n: NoteRow,
    tc: TermCtx,
    predicted: Chain | null = null,
    names = new Map<string, string>(),
  ) {
    const w = tc.weeks.find((x) => x.week === n.week);
    const lock = LessonNotesService.lock(n, tc.term);
    const f = n.attachmentFile;
    return {
      ...this.summary(n, tc, predicted, names),
      termId: n.termId,
      weekStart: w?.start ?? isoDate(n.weekStartsOn),
      weekEnd: w?.end ?? isoDate(n.weekStartsOn),
      midterm: w?.midterm ?? false,
      objectives: [...n.objectives],
      content: n.content,
      attachment: f ? await this.files.view(f) : null,
      schemeTopic: n.schemeTopic,
      createdAt: localStamp(n.createdAt),
      updatedAt: localStamp(n.updatedAt),
      editable: lock === null,
      lockReason: lock,
      history: await this.history(n.id),
    };
  }

  /**
   * Every expected note (slot × week), newest week first: up to next week, or further when I've
   * already written a note for a later week (every week in a closed term).
   */
  private static rows(tc: TermCtx, slots: Slot[], notes: NoteRow[]): NoteRowView[] {
    const { term, weeks, cw, today } = tc;
    const active = term.status === 'ACTIVE';
    const ahead = Math.max(cw + 1, ...notes.map((n) => n.week));
    const last = term.status === 'CLOSED' ? weeks.length : Math.min(ahead, weeks.length);
    const out: NoteRowView[] = [];
    for (const w of weeks.filter((x) => x.week <= last).reverse())
      for (const s of slots) {
        const n = notes.find(
          (x) => x.subjectId === s.subjectId && x.levelId === s.levelId && x.week === w.week,
        );
        const status: SlotStatus = n ? NOTE_STATUS[n.status] : 'Not written';
        const unsent = NOT_SENT.includes(status);
        out.push({
          key: `${s.key}|${w.week}`,
          week: w.week,
          weekLabel: w.label,
          midterm: w.midterm,
          due: w.due,
          subject: s.code,
          subjectName: s.subjectName,
          level: s.level,
          label: s.label,
          status,
          overdue: active && unsent && w.due < today,
          dueThisWeek: active && w.week === cw + 1 && w.due >= today && unsent,
          noteId: n?.id ?? null,
          topic: n?.topic ?? null,
          returnComment: n?.returnComment ?? '',
        });
      }
    return out;
  }

  /* ---------------- My notes ---------------- */

  private async mine(s: Staff, term: TermRow) {
    const [tc, chain] = await Promise.all([this.termCtx(term), this.chainFor()]);
    const [slots, notes] = await Promise.all([
      this.slots(s, term, chain),
      this.db.lessonNote.findMany({
        where: { termId: term.id, teacherStaffId: s.id },
        include: NOTE_INCLUDE,
      }),
    ]);
    return { tc, slots, notes, rows: LessonNotesService.rows(tc, slots, notes) };
  }

  async list(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const { tc, slots, notes, rows } = await this.mine(s, term);
    const names = await this.names(slots.map((x) => x.chain.reviewerId));
    const lock = TeacherScopeService.lockReason(term);
    return {
      termId: term.id,
      editable: !lock,
      lockReason: lock,
      today: tc.today,
      currentWeek: tc.cw,
      weeks: tc.weeks,
      slots: slots.map((x) => ({
        key: x.key,
        subject: x.code,
        subjectName: x.subjectName,
        level: x.level,
        label: x.label,
        reviewer: x.chain.filed
          ? NO_REVIEW
          : x.chain.reviewerId
            ? (names.get(x.chain.reviewerId) ?? OFFICE)
            : OFFICE,
        noReview: x.chain.filed,
      })),
      rows,
      counts: {
        overdue: rows.filter((x) => x.overdue).length,
        dueThisWeek: rows.filter((x) => x.dueThisWeek).length,
        returned: rows.filter((x) => x.status === 'Returned').length,
        waiting: rows.filter((x) => x.status === 'Submitted').length,
        approved: notes.filter((n) => n.status === 'APPROVED').length,
      },
    };
  }

  /** A note of mine with the term, its weeks and (for drafts) where it would go. */
  private async ownView(s: Staff, n: NoteRow) {
    const term = await this.scope.term(n.termId);
    const [tc, chain] = await Promise.all([this.termCtx(term), this.chainFor()]);
    const predicted = n.submittedAt
      ? null
      : chain({
          teacherId: s.id,
          teacherIsHead: s.roleKeys.includes('academic_head'),
          hodId: n.subject.department?.hodStaffId ?? null,
          sectionId: n.level.sectionId,
        });
    const names = await this.names([predicted?.reviewerId]);
    return this.view(n, tc, predicted, names);
  }

  private async own(s: Staff, noteId: string) {
    const n = await this.db.lessonNote.findFirst({ where: { id: noteId }, include: NOTE_INCLUDE });
    if (!n) throw AppException.notFound('That lesson note doesn’t exist.', 'NOT_FOUND');
    if (n.teacherStaffId !== s.id) throw forbidden(NOT_YOURS);
    return n;
  }

  async get(auth: AuthUserContext, noteId: string) {
    const s = await this.scope.staff(auth);
    return this.ownView(s, await this.own(s, noteId));
  }

  /** Checks a note's fields: drafts need a topic; submitting needs every required field. */
  private static clean(body: Record<string, unknown>): CleanNote {
    const L = NOTE_LIMITS;
    const submit = body.submit === true;
    const fields: Record<string, string> = {};
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (topic.length < L.topic.min)
      fields.topic = topic ? 'Give the topic a few more words.' : 'Enter the week’s topic.';
    else if (topic.length > L.topic.max)
      fields.topic = `Keep the topic to ${L.topic.max} characters.`;

    const objectives = (Array.isArray(body.objectives) ? body.objectives : [])
      .filter((o): o is string => typeof o === 'string')
      .map((o) => o.trim())
      .filter(Boolean);
    if (objectives.length > L.objectives.max)
      fields.objectives = `List up to ${L.objectives.max} objectives (${objectives.length} now).`;
    else if (objectives.some((o) => o.length > L.objectives.each))
      fields.objectives = `Keep each objective under ${L.objectives.each} characters.`;
    else if (submit && objectives.length < L.objectives.min)
      fields.objectives = 'List at least one objective, one per line.';

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (content.length > L.content.max)
      fields.content = `Keep the summary to ${L.content.max} characters.`;
    else if (submit && content.length < L.content.min)
      fields.content = `Write at least ${L.content.min} characters (${content.length} so far).`;

    const schemeTopic = typeof body.schemeTopic === 'string' ? body.schemeTopic.trim() : '';
    if (schemeTopic.length > L.schemeTopic)
      fields.schemeTopic = `Keep it to ${L.schemeTopic} characters.`;

    let attachment: CleanNote['attachment'] = null;
    const a = body.attachment as { id?: unknown; name?: unknown; bytes?: unknown } | null;
    if (a && typeof a === 'object') {
      if (typeof a.id !== 'string' || !a.id)
        fields.attachment = 'That file couldn’t be read. Choose it again.';
      else
        attachment = {
          id: a.id,
          name: typeof a.name === 'string' ? a.name : '',
          bytes: typeof a.bytes === 'number' ? a.bytes : 0,
        };
    } else if (a !== null && a !== undefined)
      fields.attachment = 'That file couldn’t be read. Choose it again.';

    if (Object.keys(fields).length)
      throw AppException.validation(
        fields,
        submit ? 'Complete the note before submitting it.' : 'Check the highlighted fields.',
      );
    return { topic, objectives, content, schemeTopic, attachment, submit };
  }

  /** The note's file: a fresh upload of mine (or the one it already has), up to 10 MB. */
  private async attachmentId(auth: AuthUserContext, clean: CleanNote, current: string | null) {
    if (!clean.attachment) return null;
    const { id } = clean.attachment;
    const rows = await this.files.claim(auth, [id], 'attachment', current ? [current] : []);
    const f = rows.get(id)!;
    const bytes = Number(f.sizeBytes);
    if (bytes > NOTE_LIMITS.attachmentBytes) {
      const message = `“${f.originalName}” is ${sizeText(bytes)}. Attach a file up to 10 MB.`;
      throw AppException.validation({ attachment: message }, message);
    }
    return id;
  }

  private static termLocked(term: TermRow) {
    const reason = TeacherScopeService.lockReason(term);
    if (reason) throw conflict(reason, 'TERM_LOCKED');
  }

  async create(auth: AuthUserContext, termId: string | undefined, body: Record<string, unknown>) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    LessonNotesService.termLocked(term);
    const [tc, chain] = await Promise.all([this.termCtx(term), this.chainFor()]);
    const slots = await this.slots(s, term, chain);
    const fields: Record<string, string> = {};
    const slot = slots.find((x) => x.code === body.subject && x.level === body.level);
    if (!slot) {
      const co = (await this.scope.assignments(s.id, term.id)).find(
        (a) => !a.lead && a.subject.code === body.subject && a.arm.level === body.level,
      );
      fields.slot = co
        ? `The lead teacher writes the lesson note for ${co.arm.level} · ${co.subject.name}. You co-teach it.`
        : slots.length
          ? 'Choose one of your subjects and class levels.'
          : 'You have no classes this term, so there’s nothing to write a note for.';
    }
    const week =
      typeof body.week === 'number' ? tc.weeks.find((w) => w.week === body.week) : undefined;
    if (!week) fields.week = `Choose a week from 1 to ${tc.weeks.length}.`;
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Choose the class and week.');
    const clean = LessonNotesService.clean(body);
    const existing = await this.db.lessonNote.findFirst({
      where: {
        termId: term.id,
        teacherStaffId: s.id,
        subjectId: slot!.subjectId,
        levelId: slot!.levelId,
        week: week!.week,
      },
    });
    if (existing)
      throw conflict(
        `You already have a lesson note for ${slot!.label}, week ${week!.week} (${NOTE_STATUS[existing.status]}). Open it to make changes.`,
        'DUPLICATE',
      );
    const fileId = await this.attachmentId(auth, clean, null);
    const id = await this.db.$transaction(async (tx) => {
      const n = await tx.lessonNote.create({
        data: {
          schoolId: TeacherScopeService.schoolId(),
          termId: term.id,
          teacherStaffId: s.id,
          subjectId: slot!.subjectId,
          levelId: slot!.levelId,
          week: week!.week,
          weekStartsOn: fromIso(week!.start),
          dueOn: fromIso(week!.due),
          topic: clean.topic,
          objectives: clean.objectives,
          content: clean.content,
          schemeTopic: clean.schemeTopic,
          attachmentFileId: fileId,
          createdAt: this.clock.now(),
        },
        include: NOTE_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'lesson_note.create',
          area: 'Academic',
          entity: 'LessonNote',
          entityId: n.id,
          summary: 'Draft started',
        },
        asTx(tx),
      );
      if (clean.submit) await this.send(tx, n, s, chain);
      return n.id;
    });
    return this.ownView(s, await this.own(s, id));
  }

  async update(auth: AuthUserContext, noteId: string, body: Record<string, unknown>) {
    const s = await this.scope.staff(auth);
    const n = await this.own(s, noteId);
    const term = await this.scope.term(n.termId);
    LessonNotesService.termLocked(term);
    if (n.status === 'SUBMITTED' || n.status === 'APPROVED')
      throw conflict(LessonNotesService.lock(n, term)!, 'NOTE_LOCKED');
    const clean = LessonNotesService.clean(body);
    const fileId = await this.attachmentId(auth, clean, n.attachmentFileId);
    const chain = await this.chainFor();
    await this.db.$transaction(async (tx) => {
      const saved = await tx.lessonNote.update({
        where: { id: n.id },
        data: {
          topic: clean.topic,
          objectives: clean.objectives,
          content: clean.content,
          schemeTopic: clean.schemeTopic,
          attachmentFileId: fileId,
          updatedAt: this.clock.now(),
        },
        include: NOTE_INCLUDE,
      });
      if (clean.submit) await this.send(tx, saved, s, chain);
    });
    return this.ownView(s, await this.own(s, n.id));
  }

  /** Sends a note for review (a returned one back to the same reviewer), or files it. */
  private async send(tx: TenantTx, n: NoteRow, s: Staff, chainFor: ChainFor) {
    const now = this.clock.now();
    const resubmit = n.status === 'RETURNED';
    const chain: Chain = resubmit
      ? { reviewerId: n.reviewerStaffId, filed: false }
      : chainFor({
          teacherId: s.id,
          teacherIsHead: s.roleKeys.includes('academic_head'),
          hodId: n.subject.department?.hodStaffId ?? null,
          sectionId: n.level.sectionId,
        });
    const label = `${n.level.name} · ${n.subject.name} · Week ${n.week}`;
    if (chain.filed) {
      await tx.lessonNote.update({
        where: { id: n.id },
        data: {
          status: 'APPROVED',
          filedWithoutReview: true,
          reviewerStaffId: null,
          submittedAt: now,
          decidedAt: now,
          decidedByStaffId: null,
          returnComment: null,
        },
      });
      await this.audit.record(
        {
          action: 'lesson_note.file',
          area: 'Academic',
          entity: 'LessonNote',
          entityId: n.id,
          summary: FILED_BY_HEAD,
        },
        asTx(tx),
      );
      return;
    }
    await tx.lessonNote.update({
      where: { id: n.id },
      data: {
        status: 'SUBMITTED',
        reviewerStaffId: chain.reviewerId,
        filedWithoutReview: false,
        submittedAt: now,
        decidedAt: null,
        decidedByStaffId: null,
      },
    });
    const to = chain.reviewerId
      ? ((await this.names([chain.reviewerId])).get(chain.reviewerId) ?? OFFICE)
      : OFFICE;
    await this.audit.record(
      {
        action: 'lesson_note.submit',
        area: 'Academic',
        entity: 'LessonNote',
        entityId: n.id,
        summary: `${resubmit ? 'Resubmitted' : 'Submitted'} to ${to}`,
      },
      asTx(tx),
    );
    const name = staffName(s);
    await this.notify(tx, chain.reviewerId, {
      category: 'reviews',
      title: `${name} ${resubmit ? 'resubmitted' : 'submitted'} a lesson note`,
      body: `${label} is waiting for your review.`,
      link: `/reviews/lesson-notes/${n.id}`,
      noteId: n.id,
    });
  }

  /** An in-app notification to a staff member (through their active account). */
  private async notify(
    tx: TenantTx,
    staffId: string | null,
    n: { category: string; title: string; body: string; link: string; noteId: string },
  ) {
    if (!staffId) return;
    const members = await tx.schoolMembership.findMany({
      where: { staffId, status: 'ACTIVE' },
      select: { userId: true },
    });
    for (const userId of new Set(members.map((m) => m.userId)))
      await tx.notification.create({
        data: {
          userId,
          schoolId: TeacherScopeService.schoolId(),
          category: n.category,
          title: n.title,
          body: n.body,
          link: n.link,
          entityType: 'LessonNote',
          entityId: n.noteId,
          createdAt: this.clock.now(),
        },
      });
  }

  /* ---------------- Reviews (HODs and the Academic Head) ---------------- */

  static isReviewer(s: Staff) {
    return s.hodOf.length > 0 || s.roleKeys.includes('hod') || s.roleKeys.includes('academic_head');
  }

  /** The departments whose notes this teacher reviews: theirs as HOD, and (Academic Head) those with none. */
  private async reviewDepartments(s: Staff) {
    const head = s.roleKeys.includes('academic_head');
    return this.db.department.findMany({
      where: { OR: [{ hodStaffId: s.id }, ...(head ? [{ hodStaffId: null }] : [])] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private requireReviewer(s: Staff) {
    if (!LessonNotesService.isReviewer(s))
      throw forbidden('Lesson note reviews are for HODs and the Academic Head.');
  }

  private static decision(n: NoteRow) {
    if (n.status === 'APPROVED' && n.decidedAt && !n.filedWithoutReview)
      return `Approved ${stamp(n.decidedAt)}`;
    if (n.status === 'RETURNED' && n.decidedAt) return `Returned ${stamp(n.decidedAt)}`;
    return null;
  }

  private reviewSummary(n: NoteRow, tc: TermCtx) {
    return {
      ...this.summary(n, tc),
      department: n.subject.department?.name ?? 'No department',
      decision: LessonNotesService.decision(n),
    };
  }

  async reviewList(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    this.requireReviewer(s);
    const term = await this.scope.term(termId);
    const [tc, depts] = await Promise.all([this.termCtx(term), this.reviewDepartments(s)]);
    const notes = await this.db.lessonNote.findMany({
      where: {
        termId: term.id,
        submittedAt: { not: null },
        NOT: { teacherStaffId: s.id },
        OR: [{ reviewerStaffId: s.id }, { decidedByStaffId: s.id }],
      },
      include: NOTE_INCLUDE,
    });
    const time = (d: Date | null) => d?.getTime() ?? 0;
    return {
      scope:
        [
          ...depts.map((d) => d.name),
          ...(s.roleKeys.includes('academic_head') ? ['HODs’ own notes'] : []),
        ].join(', ') || 'No department',
      waiting: notes
        .filter((n) => n.status === 'SUBMITTED' && n.reviewerStaffId === s.id)
        .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))
        .map((n) => this.reviewSummary(n, tc)),
      recent: notes
        .filter((n) => (n.status === 'APPROVED' || n.status === 'RETURNED') && n.decidedAt)
        .sort((a, b) => time(b.decidedAt) - time(a.decidedAt))
        .slice(0, 12)
        .map((n) => this.reviewSummary(n, tc)),
    };
  }

  /** A note this reviewer may open: sent to them (or decided by them), never their own. */
  private async reviewable(s: Staff, noteId: string) {
    this.requireReviewer(s);
    const n = await this.db.lessonNote.findFirst({ where: { id: noteId }, include: NOTE_INCLUDE });
    if (!n) throw AppException.notFound('That lesson note doesn’t exist.', 'NOT_FOUND');
    if (n.teacherStaffId === s.id)
      throw forbidden(
        'You can’t review your own lesson note. It goes to the Academic Head when you submit it.',
      );
    if (n.submittedAt && (n.reviewerStaffId === s.id || n.decidedByStaffId === s.id)) return n;
    const depts = await this.reviewDepartments(s);
    const head = s.roleKeys.includes('academic_head');
    const dept = n.subject.department;
    if (dept ? !depts.some((d) => d.id === dept.id) : !head)
      throw forbidden(
        `You don’t review ${dept?.name ?? 'these'} lesson notes. You review ${
          depts.length ? depts.map((d) => d.name).join(', ') : 'HODs’'
        } notes${head && depts.length ? ' and HODs’ own notes' : ''}.`,
      );
    throw forbidden('This lesson note hasn’t been submitted to you for review.');
  }

  private async reviewView(n: NoteRow, s: Staff) {
    const term = await this.scope.term(n.termId);
    const tc = await this.termCtx(term);
    const waiting = n.status === 'SUBMITTED' && n.reviewerStaffId === s.id;
    const canDecide = waiting && term.status === 'ACTIVE';
    return {
      ...(await this.view(n, tc)),
      department: n.subject.department?.name ?? 'No department',
      decision: LessonNotesService.decision(n),
      canDecide,
      decisionNote: canDecide
        ? null
        : waiting
          ? 'This term is closed. Its lesson notes are read-only.'
          : n.status === 'RETURNED'
            ? 'You returned this note to the teacher. It comes back to you when they resubmit it.'
            : n.status === 'APPROVED'
              ? 'You approved this note.'
              : 'The teacher is still working on this note.',
    };
  }

  async reviewNote(auth: AuthUserContext, noteId: string) {
    const s = await this.scope.staff(auth);
    return this.reviewView(await this.reviewable(s, noteId), s);
  }

  /** 409 unless the note is waiting on this reviewer in the active term. */
  private async requireWaiting(n: NoteRow, s: Staff) {
    LessonNotesService.termLocked(await this.scope.term(n.termId));
    if (n.status === 'APPROVED')
      throw conflict('This note was already approved.', 'ALREADY_DECIDED');
    if (n.status === 'RETURNED')
      throw conflict(
        'This note was already returned to the teacher. It comes back to you when they resubmit it.',
        'ALREADY_DECIDED',
      );
    if (n.status !== 'SUBMITTED')
      throw conflict('This note hasn’t been submitted for review.', 'NOT_SUBMITTED');
    if (n.reviewerStaffId !== s.id)
      throw forbidden('This lesson note hasn’t been submitted to you for review.');
  }

  async approve(auth: AuthUserContext, noteId: string) {
    const s = await this.scope.staff(auth);
    const n = await this.reviewable(s, noteId);
    await this.requireWaiting(n, s);
    const name = staffName(s);
    await this.db.$transaction(async (tx) => {
      await tx.lessonNote.update({
        where: { id: n.id },
        data: {
          status: 'APPROVED',
          decidedAt: this.clock.now(),
          decidedByStaffId: s.id,
          returnComment: null,
        },
      });
      await this.audit.record(
        {
          action: 'lesson_note.approve',
          area: 'Academic',
          entity: 'LessonNote',
          entityId: n.id,
          summary: `Approved by ${name}`,
        },
        asTx(tx),
      );
      await this.notify(tx, n.teacherStaffId, {
        category: 'lesson-notes',
        title: `${name} approved your lesson note`,
        body: `${n.level.name} · ${n.subject.name} · Week ${n.week}: ${n.topic}`,
        link: `/lesson-notes/${n.id}`,
        noteId: n.id,
      });
    });
    return this.reviewNote(auth, n.id);
  }

  async returnNote(auth: AuthUserContext, noteId: string, comment: unknown) {
    const s = await this.scope.staff(auth);
    const n = await this.reviewable(s, noteId);
    await this.requireWaiting(n, s);
    const text = typeof comment === 'string' ? comment.trim() : '';
    if (text.length < 10) {
      const message = 'Tell the teacher what to change (10 characters or more).';
      throw AppException.validation({ comment: message }, message);
    }
    const name = staffName(s);
    await this.db.$transaction(async (tx) => {
      await tx.lessonNote.update({
        where: { id: n.id },
        data: {
          status: 'RETURNED',
          decidedAt: this.clock.now(),
          decidedByStaffId: s.id,
          returnComment: text,
        },
      });
      await this.audit.record(
        {
          action: 'lesson_note.return',
          area: 'Academic',
          entity: 'LessonNote',
          entityId: n.id,
          summary: `Returned by ${name}`,
          detail: text,
        },
        asTx(tx),
      );
      await this.notify(tx, n.teacherStaffId, {
        category: 'lesson-notes',
        title: `${name} returned a lesson note`,
        body: `${n.level.name} · ${n.subject.name} · Week ${n.week}: “${text}”`,
        link: `/lesson-notes/${n.id}`,
        noteId: n.id,
      });
    });
    return this.reviewNote(auth, n.id);
  }

  /* ---------------- The Teacher Workspace frame ---------------- */

  /**
   * Lesson notes in the frame: the sidebar counts (my returned + overdue notes, notes waiting on
   * me as reviewer), the dashboard's review metric, and the lesson-note to-dos (returned, then
   * overdue oldest first, then due this week).
   */
  async frame(s: Staff, term: TermRow) {
    const { rows } = await this.mine(s, term);
    const reviewer = LessonNotesService.isReviewer(s);
    const waiting = reviewer
      ? await this.db.lessonNote.count({
          where: {
            termId: term.id,
            status: 'SUBMITTED',
            reviewerStaffId: s.id,
            NOT: { teacherStaffId: s.id },
          },
        })
      : 0;
    const returned = rows.filter((x) => x.status === 'Returned');
    const overdue = rows.filter((x) => x.status !== 'Returned' && x.overdue).reverse();
    const due = rows.filter((x) => x.status !== 'Returned' && !x.overdue && x.dueThisWeek);
    const todo: unknown[] = [];
    if (term.status === 'ACTIVE') {
      for (const row of [...returned, ...overdue, ...(due.length === 1 ? due : [])]) {
        const to = row.noteId
          ? { name: 'lesson-note', params: { noteId: row.noteId } }
          : {
              name: 'lesson-note-new',
              query: { slot: `${row.subject}|${row.level}`, week: String(row.week) },
            };
        const what = `${row.label} · ${row.weekLabel}`;
        if (row.status === 'Returned')
          todo.push({
            id: `note-returned:${row.key}`,
            kind: 'note-returned',
            badge: { label: 'Returned', tone: 'error' },
            title: `Lesson note returned: ${what}`,
            detail: `“${row.returnComment}”`,
            action: 'Revise',
            to,
          });
        else if (row.overdue)
          todo.push({
            id: `note-overdue:${row.key}`,
            kind: 'note-overdue',
            badge: { label: 'Overdue', tone: 'error' },
            title: `Lesson note overdue: ${what}`,
            detail: `Was due ${dayLabel(row.due)} · ${row.status === 'Draft' ? 'draft not submitted' : 'not written yet'}`,
            action: row.noteId ? 'Finish' : 'Write',
            to,
          });
        else
          todo.push({
            id: `note-due:${row.key}`,
            kind: 'note-due',
            badge: { label: 'Due this week', tone: 'neutral' },
            title: `Lesson note due: ${what}`,
            detail: `Due ${shortDay(row.due)}`,
            action: row.noteId ? 'Finish' : 'Write',
            to,
          });
      }
      if (due.length > 1)
        todo.push({
          id: `note-due:week-${due[0]!.week}`,
          kind: 'note-due',
          badge: { label: 'Due this week', tone: 'neutral' },
          title: `${due.length} lesson notes due ${shortDay(due[0]!.due)}`,
          detail: `${due[0]!.weekLabel} · ${due.map((x) => x.label).join(', ')}`,
          action: 'Open',
          to: { name: 'lesson-notes' },
        });
    }
    const reviewTodo =
      term.status === 'ACTIVE' && waiting
        ? {
            id: 'review-notes',
            kind: 'review-notes',
            badge: { label: 'Review', tone: 'info' },
            title: `${plural(waiting, 'lesson note')} waiting for your review`,
            detail: 'Approve or return with a comment',
            action: 'Review',
            to: { name: 'review-notes' },
          }
        : null;
    return {
      counts: {
        'lesson-notes': returned.length + rows.filter((x) => x.overdue).length,
        'review-notes': waiting,
      },
      reviewNotes: reviewer ? waiting : null,
      todo,
      reviewTodo,
    };
  }
}
