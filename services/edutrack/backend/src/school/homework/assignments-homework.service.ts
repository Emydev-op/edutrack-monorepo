import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AssignmentStatus, SubmissionStatus } from '../../generated/prisma/enums.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import { fmtDate, isoDate, plural } from '../academics/academic-format.js';
import { fromLocalStamp, LOCAL_STAMP } from '../communication/comms-time.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import {
  ASSIGNMENT_STATUS,
  fieldError,
  forbidden,
  fullName,
  guardianName,
  HANDED_IN,
  HomeworkCoreService,
  type RollEntry,
  SUBMISSION_BY_LABEL,
  SUBMISSION_LABELS,
  SUBMISSION_STATUS,
  type SubmissionLabel,
  termLocked,
  TO_GRADE,
  unprocessable,
} from './homework-core.service.js';
import { HomeworkFilesService, type FileRefView } from './homework-files.js';

export const ASSIGNMENT_LIMITS = { title: 120, instructions: 4000, maxScore: 100, files: 5 };

const include = {
  subject: { select: { id: true, code: true, name: true } },
  attachments: {
    orderBy: { sortOrder: 'asc' },
    include: { file: true, material: { include: { file: true } } },
  },
  submissions: true,
} satisfies Prisma.AssignmentInclude;
type AssignmentFull = Prisma.AssignmentGetPayload<{ include: typeof include }>;
type SubmissionRow = AssignmentFull['submissions'][number];

/** The create / edit body, as the Teacher Workspace sends it. */
export interface AssignmentBody {
  armId?: string;
  subject?: string;
  title?: string;
  instructions?: string;
  dueAt?: string | null;
  maxScore?: number | string | null;
  allowLate?: boolean;
  attachments?: { id?: string; materialId?: string; name?: string }[];
  publish?: boolean;
}

const STATUS_ORDER: Record<AssignmentStatus, number> = { PUBLISHED: 0, DRAFT: 1, CLOSED: 2 };
const SKIP_REASON: Record<SubmissionStatus, string> = {
  NOT_SUBMITTED: 'Nothing handed in',
  SUBMITTED: 'Not graded yet',
  LATE: 'Not graded yet',
  GRADED: 'No score',
  RETURNED: 'Already returned',
  EXCUSED: 'Excused',
};

/**
 * Teacher Workspace › Assignments: homework a teacher sets for a class they teach this term
 * (lead or co-teacher), the class's submissions, grading, returning and excusing. Every student
 * on the class's list for the subject has a submission once it's published (Not submitted until
 * they, or for primary pupils their parent, hand in). Shapes follow the Teacher Workspace mock
 * (`teacher-portal/src/api/mock/handlers/assignments.ts`).
 */
@Injectable()
export class AssignmentsHomeworkService {
  constructor(
    private readonly core: HomeworkCoreService,
    private readonly files: HomeworkFilesService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }
  private get scope() {
    return this.core.scope;
  }

  /* ---------------- Scope ---------------- */

  /** The teacher's assignment for an arm × subject code this term, or 403 naming their classes. */
  private async teaching(staffId: string, term: TermRow, armId: string, subject: string) {
    const mine = await this.scope.assignments(staffId, term.id);
    const found = mine.find((a) => a.armId === armId && a.subject.code === subject);
    if (!found) {
      const list = [...new Set(mine.map((a) => `${a.arm.label} ${a.subject.name}`))];
      throw forbidden(
        `You don’t teach that class and subject this term.${list.length ? ` You teach ${list.join(', ')}.` : ''}`,
      );
    }
    return found;
  }

  /** One of the teacher's own assignments (403 for someone else's, naming the class only). */
  private async own(auth: AuthUserContext, id: string) {
    const s = await this.scope.staff(auth);
    const a = await this.db.assignment.findFirst({ where: { id }, include });
    if (!a) throw AppException.notFound('That assignment doesn’t exist.', 'NOT_FOUND');
    const [term, arm] = await Promise.all([
      this.scope.term(a.termId),
      this.scope.catalog.arm(a.armId),
    ]);
    if (a.teacherStaffId !== s.id)
      throw forbidden(
        `You don’t have access to this assignment for ${arm?.label ?? 'that class'} · ${a.subject.name}.`,
      );
    await this.teaching(s.id, term, a.armId, a.subject.code);
    return { staff: s, a, term, arm: arm! };
  }

  /* ---------------- Shapes ---------------- */

  private roll(sessionId: string, arm: { id: string; levelId: string }, subjectId: string) {
    return this.core.rolls()(sessionId, arm, subjectId);
  }

  private students(a: AssignmentFull, term: TermRow, arm: ArmInfo) {
    return this.roll(term.sessionId, arm, a.subjectId);
  }

  /** One row per student on the list, in class order (drafts have none). */
  private async listOf(a: AssignmentFull, term: TermRow, arm: ArmInfo) {
    if (a.status === 'DRAFT') return [];
    const roll = await this.students(a, term, arm);
    const by = new Map(a.submissions.map((s) => [s.studentId, s]));
    return roll.map((e) => ({ e, s: by.get(e.studentId) ?? null }));
  }

  private counts(list: { s: SubmissionRow | null }[]) {
    const counts = Object.fromEntries(SUBMISSION_LABELS.map((l) => [l, 0])) as Record<
      SubmissionLabel,
      number
    >;
    for (const { s } of list) counts[SUBMISSION_STATUS[s?.status ?? 'NOT_SUBMITTED']]++;
    return counts;
  }

  private async row(a: AssignmentFull, term: TermRow, arm: ArmInfo) {
    const list = await this.listOf(a, term, arm);
    const roll = await this.students(a, term, arm);
    const status = (s: SubmissionRow | null) => s?.status ?? 'NOT_SUBMITTED';
    return {
      id: a.id,
      termId: a.termId,
      armId: a.armId,
      armName: arm.label,
      subject: a.subject.code,
      subjectName: a.subject.name,
      classLabel: HomeworkCoreService.classLabel(arm, a.subject),
      branchName: arm.branch,
      title: a.title,
      status: ASSIGNMENT_STATUS[a.status],
      dueAt: this.core.local(a.dueAt),
      maxScore: a.maxScore,
      allowLate: a.allowLate,
      students: roll.length,
      submitted: list.filter(({ s }) => HANDED_IN.includes(status(s))).length,
      toGrade: list.filter(({ s }) => TO_GRADE.includes(status(s))).length,
      dueSoon: this.core.dueSoon(a),
      pastDue: this.core.pastDue(a),
    };
  }

  private permissions(a: AssignmentFull, term: TermRow) {
    const lockReason = TeacherScopeService.lockReason(term);
    const open = lockReason === null;
    return {
      edit: open && a.status !== 'CLOSED',
      publish: open && a.status === 'DRAFT',
      close: open && a.status === 'PUBLISHED',
      reopen:
        open && a.status === 'CLOSED' && this.core.nowLocal().slice(0, 10) <= isoDate(term.endsOn),
      delete: open && a.status === 'DRAFT',
      grade: open && a.status !== 'DRAFT',
      lockReason,
    };
  }

  /** Attachments with download links; linked materials show as unavailable while archived. */
  private async attachments(a: AssignmentFull): Promise<FileRefView[]> {
    return Promise.all(
      a.attachments.map(async (x) => {
        if (x.material) {
          const m = x.material;
          const unavailable = m.status !== 'PUBLISHED';
          const base = m.file ? await this.files.view(m.file) : null;
          return {
            id: m.fileId ?? m.id,
            name: m.file?.originalName ?? m.title,
            type: m.file?.mimeType ?? 'link',
            bytes: m.file ? Number(m.file.sizeBytes) : 1,
            url: unavailable ? null : (base?.url ?? m.linkUrl),
            materialId: m.id,
            unavailable,
          };
        }
        return this.files.view(x.file!);
      }),
    );
  }

  private async detail(a: AssignmentFull, term: TermRow, arm: ArmInfo) {
    const list = await this.listOf(a, term, arm);
    let best: { score: number; studentName: string } | null = null;
    for (const { e, s } of list)
      if (s?.score != null && (!best || Number(s.score) > best.score))
        best = { score: Number(s.score), studentName: fullName(e.student) };
    return {
      ...(await this.row(a, term, arm)),
      instructions: a.instructions,
      attachments: await this.attachments(a),
      createdAt: this.core.local(a.createdAt)!,
      updatedAt: this.core.local(a.updatedAt)!,
      publishedAt: this.core.local(a.publishedAt),
      closedAt: this.core.local(a.closedAt),
      counts: this.counts(list),
      highestScore: best,
      permissions: this.permissions(a, term),
      history: await this.core.timeline('Assignment', a.id),
    };
  }

  private async reload(id: string) {
    return this.db.assignment.findFirstOrThrow({ where: { id }, include });
  }

  /* ---------------- Assignments ---------------- */

  async list(
    auth: AuthUserContext,
    q: {
      term?: string;
      class?: string;
      subject?: string;
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(q.term);
    if (q.class && q.subject) await this.teaching(s.id, term, q.class, q.subject);
    const all = await this.db.assignment.findMany({
      where: {
        termId: term.id,
        teacherStaffId: s.id,
        ...(q.class && { armId: q.class }),
        ...(q.subject && { subject: { code: q.subject } }),
      },
      include,
    });
    const arms = new Map((await this.scope.catalog.arms()).map((a) => [a.id, a]));
    const rows = await Promise.all(
      all
        .filter((a) => arms.has(a.armId))
        .map(async (a) => ({ a, row: await this.row(a, term, arms.get(a.armId)!) })),
    );
    const counts = {
      Draft: rows.filter((x) => x.a.status === 'DRAFT').length,
      Published: rows.filter((x) => x.a.status === 'PUBLISHED').length,
      Closed: rows.filter((x) => x.a.status === 'CLOSED').length,
      toGrade: rows.reduce((n, x) => n + x.row.toGrade, 0),
    };
    const search = (q.search ?? '').trim().toLowerCase();
    const due = (d: Date | null, none: number) => d?.getTime() ?? none;
    const filtered = rows
      .filter(({ row }) =>
        !q.status ? true : q.status === 'To grade' ? row.toGrade > 0 : row.status === q.status,
      )
      .filter(
        ({ row }) => !search || `${row.title} ${row.classLabel}`.toLowerCase().includes(search),
      )
      .sort(
        (x, y) =>
          STATUS_ORDER[x.a.status] - STATUS_ORDER[y.a.status] ||
          (x.a.status === 'CLOSED'
            ? due(y.a.dueAt, 0) - due(x.a.dueAt, 0)
            : due(x.a.dueAt, Infinity) - due(y.a.dueAt, Infinity)) ||
          x.a.title.localeCompare(y.a.title),
      )
      .map((x) => x.row);
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 10, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
      counts,
    };
  }

  async get(auth: AuthUserContext, id: string) {
    const { a, term, arm } = await this.own(auth, id);
    return this.detail(a, term, arm);
  }

  /**
   * Checks a create / edit body. Publishing needs every field; a draft needs a title, and
   * whatever else it has must still be valid. An unchanged due date isn't re-checked against the
   * clock, and the max score can't drop below a score already given.
   */
  private async clean(
    body: AssignmentBody,
    term: TermRow,
    publish: boolean,
    existing?: { a: AssignmentFull; arm: ArmInfo },
  ) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw fieldError('title', 'Enter a title.');
    if (title.length > ASSIGNMENT_LIMITS.title)
      throw fieldError('title', `Keep the title to ${ASSIGNMENT_LIMITS.title} characters.`);
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    if (publish && !instructions)
      throw fieldError('instructions', 'Enter instructions so students know what to do.');
    if (instructions.length > ASSIGNMENT_LIMITS.instructions)
      throw fieldError(
        'instructions',
        `Keep the instructions to ${ASSIGNMENT_LIMITS.instructions} characters.`,
      );

    const rawDue = body.dueAt === '' || body.dueAt === undefined ? null : body.dueAt;
    let dueAt: Date | null = null;
    if (rawDue === null) {
      if (publish) throw fieldError('dueAt', 'Choose a due date and time.');
    } else {
      if (
        typeof rawDue !== 'string' ||
        !LOCAL_STAMP.test(rawDue) ||
        Number.isNaN(fromLocalStamp(rawDue).getTime())
      )
        throw fieldError('dueAt', 'Enter the due date and time.');
      dueAt = fromLocalStamp(rawDue);
      const unchanged = existing?.a.dueAt?.getTime() === dueAt.getTime();
      if (!unchanged) {
        const day = rawDue.slice(0, 10);
        const start = isoDate(term.startsOn);
        const end = isoDate(term.endsOn);
        if (day < start || day > end)
          throw fieldError(
            'dueAt',
            `The due date must be inside ${term.name} (${fmtDate(start, false)} – ${fmtDate(end, false)}).`,
          );
        if (dueAt.getTime() <= this.core.now().getTime())
          throw fieldError(
            'dueAt',
            'The due date and time has already passed. Choose a later time.',
          );
      }
    }

    const rawMax = body.maxScore === '' || body.maxScore === undefined ? null : body.maxScore;
    let maxScore: number | null = null;
    if (rawMax === null) {
      if (publish) throw fieldError('maxScore', 'Enter the max score.');
    } else {
      const n = Number(rawMax);
      if (!Number.isInteger(n) || n < 1 || n > ASSIGNMENT_LIMITS.maxScore)
        throw fieldError('maxScore', 'The max score is a whole number from 1 to 100.');
      maxScore = n;
      if (existing) {
        const list = await this.listOf(existing.a, term, existing.arm);
        const best = list
          .filter(({ s }) => s?.score != null)
          .sort((x, y) => Number(y.s!.score) - Number(x.s!.score))[0];
        if (best && Number(best.s!.score) > n)
          throw fieldError(
            'maxScore',
            `${fullName(best.e.student)} already has ${Number(best.s!.score)}. The max score can’t go below ${Number(best.s!.score)}.`,
          );
      }
    }
    return { title, instructions, dueAt, maxScore, allowLate: body.allowLate === true };
  }

  /** Uploaded files (by id) and the teacher's own materials for the same class and subject. */
  private async cleanAttachments(
    auth: AuthUserContext,
    staffId: string,
    armId: string,
    subjectId: string,
    raw: AssignmentBody['attachments'],
    keep: string[],
  ) {
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > ASSIGNMENT_LIMITS.files)
      throw fieldError('attachments', `Attach up to ${ASSIGNMENT_LIMITS.files} files.`);
    const materialIds = list.filter((f) => f?.materialId).map((f) => String(f.materialId));
    const fileIds = list.filter((f) => !f?.materialId).map((f) => String(f?.id ?? ''));
    await this.files.claim(auth, fileIds, 'attachments', keep);
    const UUID = /^[0-9a-f-]{36}$/i;
    const materials = await this.db.material.findMany({
      where: { id: { in: materialIds.filter((x) => UUID.test(x)) } },
    });
    for (const id of materialIds) {
      const m = materials.find((x) => x.id === id);
      const name = list.find((f) => f.materialId === id)?.name ?? 'That material';
      if (!m || m.teacherStaffId !== staffId)
        throw fieldError('attachments', `“${name}” isn’t one of your materials.`);
      if (m.armId !== armId || m.subjectId !== subjectId)
        throw fieldError('attachments', `“${name}” is shared with another class. Attach it there.`);
    }
    return list.map((f, i) =>
      f.materialId
        ? { materialId: String(f.materialId), sortOrder: i }
        : { fileId: String(f.id), sortOrder: i },
    );
  }

  private async saveAttachments(
    tx: TenantTx,
    assignmentId: string,
    rows: { fileId?: string; materialId?: string; sortOrder: number }[],
    before: string[],
  ) {
    const schoolId = TeacherScopeService.schoolId();
    await tx.assignmentAttachment.deleteMany({ where: { assignmentId } });
    if (rows.length)
      await tx.assignmentAttachment.createMany({
        data: rows.map((r) => ({ schoolId, assignmentId, ...r })),
      });
    // Uploads taken off the assignment aren't used anywhere: the purge job removes them.
    const dropped = before.filter((id) => !rows.some((r) => r.fileId === id));
    if (dropped.length)
      await tx.storedFile.updateMany({
        where: { id: { in: dropped } },
        data: { deletedAt: this.core.now() },
      });
  }

  /** New homework (or a change to published homework) for the class's families. */
  private async announce(
    tx: TenantTx,
    a: { id: string; title: string; dueAt: Date | null; subjectId: string },
    subject: { name: string },
    roll: RollEntry[],
    arm: ArmInfo,
    auth: AuthUserContext,
    changed: boolean,
  ) {
    return this.core.notify(tx, {
      event: 'assignment.published',
      title: `${changed ? 'Homework changed' : 'New homework'} · ${arm.label} ${subject.name} · ${a.title}`,
      audienceLabel: `${arm.label} ${subject.name} students and guardians`,
      studentIds: roll.map((e) => e.studentId),
      vars: {
        subject: subject.name,
        title: a.title,
        due_date: a.dueAt ? fmtDate(this.core.local(a.dueAt)!.slice(0, 10)) : '',
        class: arm.label,
      },
      assignmentId: a.id,
      createdById: auth.userId,
    });
  }

  async create(auth: AuthUserContext, body: AssignmentBody, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const lock = termLocked(term);
    if (lock) throw lock;
    const armId = typeof body.armId === 'string' ? body.armId : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    if (!armId || !subject) throw fieldError('armId', 'Choose the class and subject.');
    const ta = await this.teaching(s.id, term, armId, subject);
    const publish = body.publish === true;
    const clean = await this.clean(body, term, publish);
    const attachments = await this.cleanAttachments(
      auth,
      s.id,
      armId,
      ta.subjectId,
      body.attachments,
      [],
    );
    const roll = publish ? await this.roll(term.sessionId, ta.arm, ta.subjectId) : [];
    const now = this.core.now();
    let flush: (() => Promise<void>) | null = null;
    const id = await this.db.$transaction(async (tx) => {
      const a = await tx.assignment.create({
        data: {
          schoolId: TeacherScopeService.schoolId(),
          termId: term.id,
          armId,
          subjectId: ta.subjectId,
          teacherStaffId: s.id,
          ...clean,
          status: publish ? 'PUBLISHED' : 'DRAFT',
          publishedAt: publish ? now : null,
        },
      });
      await this.saveAttachments(tx, a.id, attachments, []);
      await this.audit.record(
        {
          action: publish ? 'assignment.create' : 'assignment.create_draft',
          area: 'Academic',
          entity: 'Assignment',
          entityId: a.id,
          summary: publish ? 'Created' : 'Created as a draft',
          detail: `${ta.arm.label} · ${ta.subject.name} · ${a.title}`,
        },
        asTx(tx),
      );
      if (publish) flush = await this.publishNotice(tx, a, ta.subject, roll, ta.arm, auth, false);
      return a.id;
    });
    if (flush) await (flush as () => Promise<void>)();
    return this.get(auth, id);
  }

  private async publishNotice(
    tx: TenantTx,
    a: { id: string; title: string; dueAt: Date | null; subjectId: string },
    subject: { name: string },
    roll: RollEntry[],
    arm: ArmInfo,
    auth: AuthUserContext,
    changed: boolean,
  ) {
    const sent = await this.announce(tx, a, subject, roll, arm, auth, changed);
    await this.audit.record(
      {
        action: changed ? 'assignment.update_published' : 'assignment.publish',
        area: 'Academic',
        entity: 'Assignment',
        entityId: a.id,
        summary: changed ? 'Changed after publishing' : 'Published',
        detail: HomeworkCoreService.reachedText(sent.reached, roll.length),
      },
      asTx(tx),
    );
    return sent.flush;
  }

  async update(auth: AuthUserContext, id: string, body: AssignmentBody) {
    const { staff, a, term, arm: oldArm } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (a.status === 'CLOSED')
      throw unprocessable('Submissions are closed. Reopen the assignment to change it.');
    const armId = typeof body.armId === 'string' && body.armId ? body.armId : a.armId;
    const subject =
      typeof body.subject === 'string' && body.subject ? body.subject : a.subject.code;
    const wasPublished = a.status === 'PUBLISHED';
    if (wasPublished && (armId !== a.armId || subject !== a.subject.code))
      throw fieldError(
        'armId',
        'A published assignment can’t move to another class. Close it and create a new one.',
      );
    if (wasPublished && body.publish === false)
      throw unprocessable(
        'A published assignment can’t go back to draft. Close submissions instead.',
      );
    const ta = await this.teaching(staff.id, term, armId, subject);
    const publish = wasPublished || body.publish === true;
    const clean = await this.clean(body, term, publish, { a, arm: oldArm });
    const before = a.attachments.map((x) => x.fileId).filter((x): x is string => !!x);
    const attachments = await this.cleanAttachments(
      auth,
      staff.id,
      armId,
      ta.subjectId,
      body.attachments,
      before,
    );
    const roll = publish ? await this.roll(term.sessionId, ta.arm, ta.subjectId) : [];
    let flush: (() => Promise<void>) | null = null;
    await this.db.$transaction(async (tx) => {
      const next = await tx.assignment.update({
        where: { id },
        data: {
          armId,
          subjectId: ta.subjectId,
          ...clean,
          ...(!wasPublished && publish && { status: 'PUBLISHED', publishedAt: this.core.now() }),
        },
      });
      await this.saveAttachments(tx, id, attachments, before);
      if (publish)
        flush = await this.publishNotice(tx, next, ta.subject, roll, ta.arm, auth, wasPublished);
      else
        await this.audit.record(
          {
            action: 'assignment.save_draft',
            area: 'Academic',
            entity: 'Assignment',
            entityId: id,
            summary: 'Draft saved',
          },
          asTx(tx),
        );
    });
    if (flush) await (flush as () => Promise<void>)();
    return this.get(auth, id);
  }

  async close(auth: AuthUserContext, id: string) {
    const { a, term, arm } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (a.status !== 'PUBLISHED') throw unprocessable('Only a published assignment can be closed.');
    const missing = this.counts(await this.listOf(a, term, arm))['Not submitted'];
    await this.db.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: this.core.now() },
      });
      await this.audit.record(
        {
          action: 'assignment.close',
          area: 'Academic',
          entity: 'Assignment',
          entityId: id,
          summary: 'Submissions closed early',
          detail: missing
            ? `${plural(missing, 'student')} hadn’t handed in.`
            : 'Everyone had handed in.',
        },
        asTx(tx),
      );
    });
    return this.get(auth, id);
  }

  async reopen(auth: AuthUserContext, id: string) {
    const { a, term } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (a.status !== 'CLOSED') throw unprocessable('Only a closed assignment can be reopened.');
    const end = isoDate(term.endsOn);
    if (this.core.nowLocal().slice(0, 10) > end)
      throw unprocessable(
        `${term.name} ended on ${fmtDate(end)}. Work can’t be reopened after the term ends.`,
      );
    const pastDue = this.core.pastDue(a);
    await this.db.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id },
        data: { status: 'PUBLISHED', closedAt: null, ...(pastDue && { allowLate: true }) },
      });
      await this.audit.record(
        {
          action: 'assignment.reopen',
          area: 'Academic',
          entity: 'Assignment',
          entityId: id,
          summary: 'Reopened',
          detail: pastDue
            ? 'The due date has passed, so new work is marked Late.'
            : 'Students can hand in again.',
        },
        asTx(tx),
      );
    });
    return this.get(auth, id);
  }

  async remove(auth: AuthUserContext, id: string) {
    const { a, term, arm } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (a.status !== 'DRAFT')
      throw unprocessable('Only drafts can be deleted. Close a published assignment instead.');
    const files = a.attachments.map((x) => x.fileId).filter((x): x is string => !!x);
    await this.db.$transaction(async (tx) => {
      await tx.assignment.delete({ where: { id } });
      if (files.length)
        await tx.storedFile.updateMany({
          where: { id: { in: files } },
          data: { deletedAt: this.core.now() },
        });
      await this.audit.record(
        {
          action: 'assignment.delete',
          area: 'Academic',
          entity: 'Assignment',
          entityId: id,
          summary: 'Draft deleted',
          detail: `${arm.label} · ${a.subject.name} · ${a.title}`,
        },
        asTx(tx),
      );
    });
    return { deleted: id };
  }

  /* ---------------- Submissions ---------------- */

  /**
   * Makes sure every student on the list has a submission row (students who joined the class
   * since get "Not submitted"), and returns the list in class order with each row.
   */
  private async ensureRows(a: AssignmentFull, term: TermRow, arm: ArmInfo) {
    if (a.status === 'DRAFT') return [];
    const roll = await this.students(a, term, arm);
    const have = new Set(a.submissions.map((s) => s.studentId));
    const missing = roll.filter((e) => !have.has(e.studentId));
    let rows = a.submissions;
    if (missing.length) {
      await this.db.submission.createMany({
        data: missing.map((e) => ({
          schoolId: TeacherScopeService.schoolId(),
          assignmentId: a.id,
          studentId: e.studentId,
        })),
        skipDuplicates: true,
      });
      rows = await this.db.submission.findMany({ where: { assignmentId: a.id } });
    }
    const by = new Map(rows.map((s) => [s.studentId, s]));
    return roll.map((e) => ({ e, s: by.get(e.studentId)! }));
  }

  private async guardianNames(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map<string, string>();
    const rows = await this.db.guardian.findMany({
      where: { id: { in: wanted } },
      select: { id: true, title: true, fullName: true },
    });
    return new Map(rows.map((g) => [g.id, guardianName(g)]));
  }

  private submissionRow(
    e: RollEntry,
    s: SubmissionRow & { files?: unknown[] },
    guardians: Map<string, string>,
    files: number,
  ) {
    return {
      id: s.id,
      assignmentId: s.assignmentId,
      studentId: s.studentId,
      studentName: fullName(e.student),
      admissionNo: e.student.admissionNo,
      status: SUBMISSION_STATUS[s.status],
      submittedAt: this.core.local(s.submittedAt),
      late: s.isLate,
      score: s.score === null ? null : Number(s.score),
      files,
      gradedAt: this.core.local(s.gradedAt),
      returnedAt: this.core.local(s.returnedAt),
      /** A parent or guardian handed it in for the child (primary pupils), else null. */
      submittedByGuardian: s.submittedByGuardianId
        ? (guardians.get(s.submittedByGuardianId) ?? 'A guardian')
        : null,
    };
  }

  async submissions(
    auth: AuthUserContext,
    id: string,
    q: { status?: string; search?: string; page?: string; pageSize?: string },
  ) {
    const { a, term, arm } = await this.own(auth, id);
    if (q.status && !SUBMISSION_LABELS.includes(q.status as SubmissionLabel))
      throw unprocessable('Unknown status filter.');
    const all = await this.ensureRows(a, term, arm);
    const fileCounts = await this.db.submissionFile.groupBy({
      by: ['submissionId'],
      where: { submissionId: { in: all.map((x) => x.s.id) } },
      _count: { _all: true },
    });
    const nFiles = new Map(fileCounts.map((f) => [f.submissionId, f._count._all]));
    const guardians = await this.guardianNames(all.map((x) => x.s.submittedByGuardianId));
    const search = (q.search ?? '').trim().toLowerCase();
    const rows = all
      .filter(({ s }) => !q.status || SUBMISSION_STATUS[s.status] === q.status)
      .map(({ e, s }) => this.submissionRow(e, s, guardians, nFiles.get(s.id) ?? 0))
      .filter((r) => !search || `${r.studentName} ${r.admissionNo}`.toLowerCase().includes(search));
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const fresh = await this.reload(id);
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      },
      counts: { ...this.counts(all), All: all.length },
      assignment: {
        ...(await this.row(fresh, term, arm)),
        permissions: this.permissions(fresh, term),
      },
    };
  }

  private async submissionDetail(id: string, submissionId: string, term: TermRow, arm: ArmInfo) {
    const a = await this.reload(id);
    const list = await this.ensureRows(a, term, arm);
    const i = list.findIndex((x) => x.s.id === submissionId);
    if (i < 0) throw AppException.notFound('That submission doesn’t exist.', 'NOT_FOUND');
    const { e, s } = list[i]!;
    const files = await this.db.submissionFile.findMany({
      where: { submissionId },
      include: { file: true },
      orderBy: { createdAt: 'asc' },
    });
    const guardians = await this.guardianNames([s.submittedByGuardianId]);
    return {
      ...this.submissionRow(e, s, guardians, files.length),
      fileList: await Promise.all(files.map((f) => this.files.view(f.file))),
      note: s.note,
      feedback: s.feedback,
      excuseReason: s.excuseReason,
      history: await this.core.timeline('Submission', s.id),
      prevId: list[i - 1]?.s.id ?? null,
      nextId: list[i + 1]?.s.id ?? null,
      position: i + 1,
      of: list.length,
      assignment: { ...(await this.row(a, term, arm)), permissions: this.permissions(a, term) },
    };
  }

  async submission(auth: AuthUserContext, id: string, submissionId: string) {
    const { term, arm } = await this.own(auth, id);
    return this.submissionDetail(id, submissionId, term, arm);
  }

  /** The submission on this assignment (for a student on the list), or 404. */
  private async findSubmission(
    a: AssignmentFull,
    term: TermRow,
    arm: ArmInfo,
    submissionId: string,
  ) {
    const list = await this.ensureRows(a, term, arm);
    const found = list.find((x) => x.s.id === submissionId);
    if (!found) throw AppException.notFound('That submission doesn’t exist.', 'NOT_FOUND');
    return found;
  }

  /** Grading needs the term open, the assignment published or closed and work handed in. */
  private gradable(a: AssignmentFull, term: TermRow, e: RollEntry, s: SubmissionRow) {
    const lock = termLocked(term);
    if (lock) throw lock;
    if (a.status === 'DRAFT') throw unprocessable('Publish the assignment before grading.');
    const name = fullName(e.student);
    if (s.status === 'NOT_SUBMITTED')
      throw unprocessable(
        `${name} hasn’t handed anything in, so there’s nothing to grade. Mark it Excused if they had a reason.`,
      );
    if (s.status === 'EXCUSED')
      throw unprocessable(`${name} is excused from this assignment. Undo the excuse to grade it.`);
  }

  private score(value: unknown, max: number) {
    if (value === null || value === undefined || value === '')
      throw fieldError('score', `Enter a score from 0 to ${max} before returning it.`);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > max)
      throw fieldError('score', `The score is a whole number from 0 to ${max}.`);
    return n;
  }

  private feedback(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > 2000) throw fieldError('feedback', 'Keep the feedback to 2000 characters.');
    return text;
  }

  async grade(
    auth: AuthUserContext,
    id: string,
    submissionId: string,
    body: { score?: unknown; feedback?: unknown },
  ) {
    const { a, term, arm } = await this.own(auth, id);
    const { e, s } = await this.findSubmission(a, term, arm, submissionId);
    this.gradable(a, term, e, s);
    const max = a.maxScore ?? 100;
    const score = this.score(body.score, max);
    const feedback = this.feedback(body.feedback);
    const regrade = s.status === 'RETURNED';
    await this.db.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: s.id },
        data: {
          score,
          feedback,
          status: 'GRADED',
          gradedAt: this.core.now(),
          gradedById: auth.userId,
        },
      });
      await this.audit.record(
        {
          action: regrade ? 'submission.regrade' : 'submission.grade',
          area: 'Academic',
          entity: 'Submission',
          entityId: s.id,
          summary: regrade ? 'Regraded' : 'Graded',
          detail: `${score} / ${max}${regrade ? ' · private until you return it again' : ' · private to you'}`,
        },
        asTx(tx),
      );
    });
    return this.submissionDetail(id, s.id, term, arm);
  }

  /** Marks returned and tells the student's family (one message for a bulk return). */
  private async returnMany(
    tx: TenantTx,
    a: AssignmentFull,
    arm: ArmInfo,
    items: { e: RollEntry; s: SubmissionRow; score: number }[],
    auth: AuthUserContext,
  ) {
    const now = this.core.now();
    const max = a.maxScore ?? 100;
    for (const { s, score } of items) {
      await tx.submission.update({
        where: { id: s.id },
        data: { status: 'RETURNED', returnedAt: now },
      });
      await this.audit.record(
        {
          action: 'submission.return',
          area: 'Academic',
          entity: 'Submission',
          entityId: s.id,
          summary: 'Returned',
          detail: `${score} / ${max} · visible to the student and guardian`,
        },
        asTx(tx),
      );
    }
    const sent = await this.core.notify(tx, {
      event: 'assignment.returned',
      title: `Homework returned · ${arm.label} ${a.subject.name} · ${a.title}`,
      audienceLabel:
        items.length === 1
          ? `${fullName(items[0]!.e.student)} and guardians`
          : `${plural(items.length, 'student')} · ${arm.label}`,
      studentIds: items.map((x) => x.e.studentId),
      vars: { subject: a.subject.name, title: a.title, class: arm.label },
      perStudent: new Map(items.map((x) => [x.e.studentId, { score: `${x.score} / ${max}` }])),
      assignmentId: a.id,
      createdById: auth.userId,
    });
    return sent.flush;
  }

  async returnOne(
    auth: AuthUserContext,
    id: string,
    submissionId: string,
    body: { score?: unknown; feedback?: unknown },
  ) {
    const { a, term, arm } = await this.own(auth, id);
    const { e, s } = await this.findSubmission(a, term, arm, submissionId);
    this.gradable(a, term, e, s);
    const max = a.maxScore ?? 100;
    const given = body.score === undefined ? s.score : body.score;
    const score = this.score(given === null ? null : Number(given), max);
    const feedback = body.feedback === undefined ? s.feedback : this.feedback(body.feedback);
    const changed = score !== (s.score === null ? null : Number(s.score)) || s.status !== 'GRADED';
    let flush: (() => Promise<void>) | null = null;
    await this.db.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: s.id },
        data: {
          score,
          feedback,
          ...(changed && { gradedAt: this.core.now(), gradedById: auth.userId }),
        },
      });
      flush = await this.returnMany(tx, a, arm, [{ e, s, score }], auth);
    });
    if (flush) await (flush as () => Promise<void>)();
    return this.submissionDetail(id, s.id, term, arm);
  }

  async returnBulk(auth: AuthUserContext, id: string, ids: string[]) {
    const { a, term, arm } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (!ids.length) throw unprocessable('Choose the submissions to return.');
    const list = await this.ensureRows(a, term, arm);
    const result = {
      returned: 0,
      skipped: [] as { id: string; studentName: string; reason: string }[],
    };
    const ready: { e: RollEntry; s: SubmissionRow; score: number }[] = [];
    for (const sid of ids) {
      const found = list.find((x) => x.s.id === sid);
      if (!found) {
        result.skipped.push({ id: sid, studentName: 'Unknown', reason: 'Not on this class list' });
        continue;
      }
      const { e, s } = found;
      if (s.status === 'GRADED' && s.score !== null) ready.push({ e, s, score: Number(s.score) });
      else
        result.skipped.push({
          id: sid,
          studentName: fullName(e.student),
          reason: SKIP_REASON[s.status],
        });
    }
    let flush: (() => Promise<void>) | null = null;
    if (ready.length)
      await this.db.$transaction(async (tx) => {
        flush = await this.returnMany(tx, a, arm, ready, auth);
      });
    if (flush) await (flush as () => Promise<void>)();
    result.returned = ready.length;
    return result;
  }

  async excuse(auth: AuthUserContext, id: string, submissionId: string, reason: unknown) {
    const { a, term, arm } = await this.own(auth, id);
    const { e, s } = await this.findSubmission(a, term, arm, submissionId);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (s.status !== 'NOT_SUBMITTED')
      throw unprocessable(
        `${fullName(e.student)} has handed in work, so they can’t be excused. Grade it instead.`,
      );
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text.length < 3) throw fieldError('reason', 'Say why the student is excused.');
    await this.db.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: s.id },
        data: { status: 'EXCUSED', excuseReason: text.slice(0, 300) },
      });
      await this.audit.record(
        {
          action: 'submission.excuse',
          area: 'Academic',
          entity: 'Submission',
          entityId: s.id,
          summary: 'Marked excused',
          detail: text.slice(0, 300),
        },
        asTx(tx),
      );
    });
    return this.submissionDetail(id, s.id, term, arm);
  }

  async unexcuse(auth: AuthUserContext, id: string, submissionId: string) {
    const { a, term, arm } = await this.own(auth, id);
    const { s } = await this.findSubmission(a, term, arm, submissionId);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (s.status !== 'EXCUSED') throw unprocessable('This student isn’t excused.');
    await this.db.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: s.id },
        data: { status: 'NOT_SUBMITTED', excuseReason: null },
      });
      await this.audit.record(
        {
          action: 'submission.unexcuse',
          area: 'Academic',
          entity: 'Submission',
          entityId: s.id,
          summary: 'Excuse removed',
          detail: 'Back to Not submitted.',
        },
        asTx(tx),
      );
    });
    return this.submissionDetail(id, s.id, term, arm);
  }

  /* ---------------- The student page ---------------- */

  /** A student's assignments from me this term (published and closed), with their status. */
  async forStudent(auth: AuthUserContext, studentId: string, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const mine = await this.db.assignment.findMany({
      where: { termId: term.id, teacherStaffId: s.id, status: { not: 'DRAFT' } },
      include,
    });
    const tas = await this.scope.assignments(s.id, term.id);
    const teaches = (
      await Promise.all(tas.map((ta) => this.roll(term.sessionId, ta.arm, ta.subjectId)))
    ).some((r) => r.some((e) => e.studentId === studentId));
    const myArm = await this.scope.classArm(s.id, term);
    const inMyClass =
      !!myArm &&
      (await this.scope.roll(term.sessionId, [myArm.id])).some((e) => e.studentId === studentId);
    if (!teaches && !inMyClass) throw forbidden('You don’t teach this student this term.');
    const arms = new Map((await this.scope.catalog.arms()).map((a) => [a.id, a]));
    const out = [];
    for (const a of mine) {
      const arm = arms.get(a.armId);
      if (!arm) continue;
      const roll = await this.students(a, term, arm);
      if (!roll.some((e) => e.studentId === studentId)) continue;
      const sub = a.submissions.find((x) => x.studentId === studentId) ?? null;
      out.push({
        assignmentId: a.id,
        submissionId: sub?.id ?? null,
        title: a.title,
        classLabel: HomeworkCoreService.classLabel(arm, a.subject),
        dueAt: this.core.local(a.dueAt),
        maxScore: a.maxScore,
        assignmentStatus: ASSIGNMENT_STATUS[a.status],
        status: SUBMISSION_STATUS[sub?.status ?? 'NOT_SUBMITTED'],
        score: sub?.score == null ? null : Number(sub.score),
      });
    }
    return out.sort((x, y) => (y.dueAt ?? '').localeCompare(x.dueAt ?? ''));
  }

  /* ---------------- Frame: counts, to-dos, the lesson page ---------------- */

  /** Submissions waiting to be graded across the teacher's term, per assignment. */
  async waiting(staffId: string, term: TermRow) {
    const mine = await this.db.assignment.findMany({
      where: { termId: term.id, teacherStaffId: staffId, status: { not: 'DRAFT' } },
      include,
    });
    const arms = new Map((await this.scope.catalog.arms()).map((a) => [a.id, a]));
    const out: { a: AssignmentFull; arm: ArmInfo; waiting: number }[] = [];
    for (const a of mine) {
      const arm = arms.get(a.armId);
      if (!arm) continue;
      const row = await this.row(a, term, arm);
      if (row.toGrade) out.push({ a, arm, waiting: row.toGrade });
    }
    return out.sort((x, y) => y.waiting - x.waiting || x.a.title.localeCompare(y.a.title));
  }

  /** The next open assignment for a class (published, not past due), for the lesson page. */
  async openFor(term: TermRow, arm: ArmInfo, subjectId: string) {
    const a = await this.db.assignment.findFirst({
      where: {
        termId: term.id,
        armId: arm.id,
        subjectId,
        status: 'PUBLISHED',
        dueAt: { gte: this.core.now() },
      },
      orderBy: { dueAt: 'asc' },
      include,
    });
    if (!a) return null;
    const row = await this.row(a, term, arm);
    return {
      id: a.id,
      title: a.title,
      dueAt: row.dueAt!,
      handedIn: row.submitted,
      students: row.students,
    };
  }

  /** For the family read models: the labels the portals use. */
  static statusOf(s: SubmissionStatus | undefined) {
    return SUBMISSION_STATUS[s ?? 'NOT_SUBMITTED'];
  }

  static byLabel = SUBMISSION_BY_LABEL;
}
