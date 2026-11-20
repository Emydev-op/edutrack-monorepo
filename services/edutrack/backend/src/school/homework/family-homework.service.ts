import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PortalAccessService } from '../../auth/portal-access.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import {
  ASSIGNMENT_STATUS,
  fieldError,
  fullName,
  guardianName,
  HomeworkCoreService,
  MATERIAL_TYPE,
  SUBMISSION_STATUS,
  unprocessable,
} from './homework-core.service.js';
import { HomeworkFilesService } from './homework-files.js';

export const SUBMISSION_LIMITS = { files: 5, note: 1000 };

/**
 * Homework from the family's side, for the Parent Portal (and the Student Portal later): a
 * student's assignments this term with their status (score and feedback once the teacher returns
 * the work), the class's materials for the subjects they take, and handing work in. Primary
 * pupils (sections without Student Portal logins) hand in through a parent or guardian.
 */
@Injectable()
export class FamilyHomeworkService {
  constructor(
    private readonly core: HomeworkCoreService,
    private readonly files: HomeworkFilesService,
    private readonly access: PortalAccessService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }

  /** The signed-in guardian and what they may do for this child (404 if not theirs). */
  async guardianOf(auth: AuthUserContext, studentId: string) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'GUARDIAN', status: 'ACTIVE' },
      include: { guardian: { select: { id: true, title: true, fullName: true } } },
    });
    if (!m?.guardian)
      throw AppException.forbidden(
        'This account doesn’t have access to the Parent Portal at this school.',
        'NO_ACCESS',
      );
    const children = await this.access.parentChildren(auth.schoolId!, m.guardian.id);
    const child = children.find((c) => c.studentId === studentId);
    if (!child)
      throw AppException.notFound('That child isn’t linked to your account.', 'NOT_FOUND');
    return { guardian: m.guardian, access: child.access };
  }

  /** The student's arm in the term's session, with whether their section has student logins. */
  private async placement(studentId: string, term: TermRow) {
    const e = await this.db.enrollment.findFirst({
      where: { studentId, sessionId: term.sessionId, status: 'ACTIVE', armId: { not: null } },
      include: {
        student: true,
        level: { select: { section: { select: { studentLogins: true } } } },
      },
    });
    if (!e?.armId) return null;
    const arm = await this.core.scope.catalog.arm(e.armId);
    return arm ? { arm, student: e.student, studentLogins: e.level.section.studentLogins } : null;
  }

  /**
   * A student's homework for a term (the active one by default): published and closed
   * assignments for the subjects they take in their class, and the class's published materials.
   */
  async homework(
    studentId: string,
    termId?: string,
    viewer?: { guardian: boolean; full: boolean },
  ) {
    const term = await this.core.scope.term(termId);
    const place = await this.placement(studentId, term);
    if (!place) return { termId: term.id, assignments: [], materials: [] };
    const { arm } = place;
    const roll = this.core.rolls();
    const takes = async (subjectId: string) =>
      (await roll(term.sessionId, arm, subjectId)).some((e) => e.studentId === studentId);
    const [assignments, materials] = await Promise.all([
      this.db.assignment.findMany({
        where: { termId: term.id, armId: arm.id, status: { not: 'DRAFT' } },
        include: {
          subject: { select: { id: true, name: true } },
          teacher: { select: { title: true, firstName: true, lastName: true } },
          attachments: {
            orderBy: { sortOrder: 'asc' },
            include: { file: true, material: { include: { file: true } } },
          },
          submissions: {
            where: { studentId },
            include: { files: { include: { file: true }, orderBy: { createdAt: 'asc' } } },
          },
        },
        orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.material.findMany({
        where: { termId: term.id, armId: arm.id, status: 'PUBLISHED' },
        include: { subject: { select: { id: true, name: true } }, file: true },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const open = term.status === 'ACTIVE';
    const guardianIds = assignments
      .map((a) => a.submissions[0]?.submittedByGuardianId)
      .filter((x): x is string => !!x);
    const guardians = new Map(
      (
        await this.db.guardian.findMany({
          where: { id: { in: guardianIds } },
          select: { id: true, title: true, fullName: true },
        })
      ).map((g) => [g.id, guardianName(g)]),
    );
    const out = [];
    for (const a of assignments) {
      if (!(await takes(a.subjectId))) continue;
      const s = a.submissions[0];
      const status = s?.status ?? 'NOT_SUBMITTED';
      const returned = status === 'RETURNED';
      const pastDue = this.core.pastDue(a);
      const canHandIn =
        open &&
        a.status === 'PUBLISHED' &&
        ['NOT_SUBMITTED', 'SUBMITTED', 'LATE'].includes(status) &&
        (!pastDue || a.allowLate);
      out.push({
        id: a.id,
        title: a.title,
        subjectName: a.subject.name,
        classLabel: HomeworkCoreService.classLabel(arm, a.subject),
        teacherName: staffName(a.teacher),
        instructions: a.instructions,
        dueAt: this.core.local(a.dueAt),
        maxScore: a.maxScore,
        allowLate: a.allowLate,
        pastDue,
        assignmentStatus: ASSIGNMENT_STATUS[a.status],
        attachments: await Promise.all(
          a.attachments
            .filter((x) => !x.material || x.material.status === 'PUBLISHED')
            .map(async (x) =>
              x.material
                ? {
                    id: x.material.fileId ?? x.material.id,
                    name: x.material.file?.originalName ?? x.material.title,
                    type: x.material.file?.mimeType ?? 'link',
                    bytes: x.material.file ? Number(x.material.file.sizeBytes) : 1,
                    url: x.material.file
                      ? (await this.files.view(x.material.file)).url
                      : x.material.linkUrl,
                    materialId: x.material.id,
                  }
                : this.files.view(x.file!),
            ),
        ),
        status: SUBMISSION_STATUS[status],
        submittedAt: this.core.local(s?.submittedAt ?? null),
        late: s?.isLate ?? false,
        submittedByGuardian: s?.submittedByGuardianId
          ? (guardians.get(s.submittedByGuardianId) ?? 'A guardian')
          : null,
        note: s?.note ?? null,
        files: s ? await Promise.all(s.files.map((f) => this.files.view(f.file))) : [],
        // Grades are private to the teacher until they return the work.
        score: returned && s?.score != null ? Number(s.score) : null,
        feedback: returned ? (s?.feedback ?? '') : null,
        returnedAt: returned ? this.core.local(s?.returnedAt ?? null) : null,
        excuseReason: status === 'EXCUSED' ? (s?.excuseReason ?? null) : null,
        // Who may hand in: a guardian for a primary pupil (no student logins), else the student.
        canSubmit:
          canHandIn &&
          (viewer
            ? viewer.guardian
              ? viewer.full && !place.studentLogins
              : place.studentLogins
            : false),
      });
    }
    const mats = [];
    for (const m of materials) {
      if (!(await takes(m.subjectId))) continue;
      mats.push({
        id: m.id,
        title: m.title,
        description: m.description,
        type: MATERIAL_TYPE[m.type],
        subjectName: m.subject.name,
        classLabel: HomeworkCoreService.classLabel(arm, m.subject),
        file: m.file ? await this.files.view(m.file) : null,
        link: m.linkUrl,
        publishedAt: this.core.local(m.publishedAt),
      });
    }
    return {
      termId: term.id,
      student: { id: place.student.id, name: fullName(place.student), className: arm.label },
      handsInThrough: place.studentLogins ? ('student' as const) : ('guardian' as const),
      assignments: out,
      materials: mats,
    };
  }

  /** `GET /v1/parent/children/:studentId/homework`. */
  async forGuardian(auth: AuthUserContext, studentId: string, termId?: string) {
    const { access } = await this.guardianOf(auth, studentId);
    return this.homework(studentId, termId, { guardian: true, full: access === 'full' });
  }

  /**
   * A parent or guardian hands in a primary pupil's work (their section has no Student Portal
   * logins). Files come from `POST /v1/uploads`. Allowed while the assignment is open (after the
   * due date only when late work is accepted, marked Late) and until the teacher grades it.
   */
  async submitForChild(
    auth: AuthUserContext,
    studentId: string,
    assignmentId: string,
    body: { note?: string; files?: { id?: string }[] },
  ) {
    const { guardian, access } = await this.guardianOf(auth, studentId);
    if (access !== 'full')
      throw AppException.forbidden(
        'This child has left the school, so their records are read-only.',
        'READ_ONLY',
      );
    const a = await this.db.assignment.findFirst({
      where: { id: assignmentId },
      include: { subject: { select: { name: true } } },
    });
    if (!a) throw AppException.notFound('That assignment doesn’t exist.', 'NOT_FOUND');
    const term = await this.core.scope.term(a.termId);
    const place = await this.placement(studentId, term);
    const onList =
      !!place &&
      place.arm.id === a.armId &&
      (await this.core.rolls()(term.sessionId, place.arm, a.subjectId)).some(
        (e) => e.studentId === studentId,
      );
    if (!place || !onList || a.status === 'DRAFT')
      throw AppException.notFound('That assignment isn’t set for this child.', 'NOT_FOUND');
    const name = fullName(place.student);
    if (place.studentLogins)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        `${name} has a Student Portal login, so they hand in their own work.`,
        'STUDENT_SUBMITS',
      );
    const lock = TeacherScopeService.lockReason(term);
    if (lock) throw new AppException(HttpStatus.CONFLICT, lock, 'TERM_LOCKED');
    if (a.status === 'CLOSED')
      throw unprocessable('The teacher has closed submissions for this assignment.', 'CLOSED');
    const pastDue = this.core.pastDue(a);
    if (pastDue && !a.allowLate)
      throw unprocessable(
        'The due date has passed and this assignment doesn’t accept late work.',
        'PAST_DUE',
      );
    const existing = await this.db.submission.findFirst({
      where: { assignmentId, studentId },
      include: { files: true },
    });
    if (existing && !['NOT_SUBMITTED', 'SUBMITTED', 'LATE'].includes(existing.status))
      throw unprocessable(
        existing.status === 'EXCUSED'
          ? `${name} is excused from this assignment.`
          : 'The teacher has already graded this work, so it can’t be changed.',
        'ALREADY_GRADED',
      );
    const list = Array.isArray(body.files) ? body.files : [];
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!list.length) throw fieldError('files', 'Attach the work: a photo, scan or document.');
    if (list.length > SUBMISSION_LIMITS.files)
      throw fieldError('files', `Attach up to ${SUBMISSION_LIMITS.files} files.`);
    if (note.length > SUBMISSION_LIMITS.note)
      throw fieldError('note', `Keep the note to ${SUBMISSION_LIMITS.note} characters.`);
    const ids = list.map((f) => String(f?.id ?? ''));
    const keep = existing?.files.map((f) => f.fileId) ?? [];
    await this.files.claim(auth, ids, 'files', keep);
    const schoolId = TeacherScopeService.schoolId();
    const now = this.core.now();
    const by = guardianName(guardian);
    await this.db.$transaction(async (tx) => {
      const data = {
        status: pastDue ? ('LATE' as const) : ('SUBMITTED' as const),
        isLate: pastDue,
        submittedAt: now,
        note: note || null,
        submittedByGuardianId: guardian.id,
      };
      const s = existing
        ? await tx.submission.update({ where: { id: existing.id }, data })
        : await tx.submission.create({ data: { schoolId, assignmentId, studentId, ...data } });
      await tx.submissionFile.deleteMany({ where: { submissionId: s.id } });
      await tx.submissionFile.createMany({
        data: ids.map((fileId) => ({ schoolId, submissionId: s.id, fileId })),
      });
      const dropped = keep.filter((id) => !ids.includes(id));
      if (dropped.length)
        await tx.storedFile.updateMany({
          where: { id: { in: dropped } },
          data: { deletedAt: now },
        });
      await this.audit.record(
        {
          action: 'submission.submit',
          area: 'Academic',
          entity: 'Submission',
          entityId: s.id,
          summary: `${existing && existing.status !== 'NOT_SUBMITTED' ? 'Handed in again' : 'Handed in'}${pastDue ? ' late' : ''}`,
          detail: `By ${by} (parent/guardian) for ${name}`,
        },
        asTx(tx),
      );
    });
    const view = await this.homework(studentId, term.id, { guardian: true, full: true });
    return view.assignments.find((x) => x.id === assignmentId)!;
  }
}
