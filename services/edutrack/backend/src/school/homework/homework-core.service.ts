import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  AssignmentStatus,
  MaterialStatus,
  MaterialType,
  SubmissionStatus,
} from '../../generated/prisma/enums.js';
import { addDays, plural } from '../academics/academic-format.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import {
  CommsDispatchService,
  type CommsRecipient,
} from '../communication/comms-dispatch.service.js';
import type { CommsEventKey } from '../communication/comms-catalog.js';
import { localStamp } from '../communication/comms-time.js';
import { stamp } from '../results/results-core.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, 'Draft' | 'Published' | 'Closed'> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
};
export const SUBMISSION_STATUS = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  LATE: 'Late',
  GRADED: 'Graded',
  RETURNED: 'Returned',
  EXCUSED: 'Excused',
} as const satisfies Record<SubmissionStatus, string>;
export type SubmissionLabel = (typeof SUBMISSION_STATUS)[SubmissionStatus];
export const SUBMISSION_LABELS = Object.values(SUBMISSION_STATUS);
export const SUBMISSION_BY_LABEL = Object.fromEntries(
  Object.entries(SUBMISSION_STATUS).map(([k, v]) => [v, k]),
) as Record<SubmissionLabel, SubmissionStatus>;

export const MATERIAL_TYPE: Record<MaterialType, string> = {
  PDF: 'PDF',
  DOCUMENT: 'Document',
  PRESENTATION: 'Presentation',
  IMAGE: 'Image',
  VIDEO_LINK: 'Video link',
};
export const MATERIAL_TYPE_BY_LABEL = Object.fromEntries(
  Object.entries(MATERIAL_TYPE).map(([k, v]) => [v, k]),
) as Record<string, MaterialType>;
export const MATERIAL_STATUS: Record<MaterialStatus, 'Published' | 'Archived'> = {
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/** Handed in: Submitted, Late, Graded or Returned. */
export const HANDED_IN: SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED', 'RETURNED'];
/** Waiting to be graded. */
export const TO_GRADE: SubmissionStatus[] = ['SUBMITTED', 'LATE'];

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
/** Timeline colour per audit action. */
const TONE: Record<string, Tone> = {
  'assignment.publish': 'info',
  'assignment.update_published': 'info',
  'assignment.reopen': 'info',
  'submission.return': 'success',
  'submission.submit': 'info',
  'material.publish': 'info',
  'material.restore': 'info',
};

export type Student = { id: string; firstName: string; surname: string; admissionNo: string };
export type RollEntry = { studentId: string; student: Student };

export const fullName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;
export const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

export const unprocessable = (message: string, code = 'VALIDATION') =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);
export const fieldError = (field: string, message: string) =>
  AppException.validation({ [field]: message }, message);
export const forbidden = (message: string) =>
  new AppException(HttpStatus.FORBIDDEN, message, 'FORBIDDEN');
export const termLocked = (term: TermRow) => {
  const reason = TeacherScopeService.lockReason(term);
  return reason ? new AppException(HttpStatus.CONFLICT, reason, 'TERM_LOCKED') : null;
};

/**
 * What homework's parts share: the clock in Lagos time, who is on a class's list for a subject
 * (the arm's roll, electives respected, so a student who joins or moves arm appears or drops
 * off like on the register), record timelines and the family notifications.
 */
@Injectable()
export class HomeworkCoreService {
  constructor(
    readonly scope: TeacherScopeService,
    private readonly comms: CommsDispatchService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.scope.db;
  }

  now() {
    return this.clock.now();
  }

  /** "2026-11-20T10:05" in Lagos. */
  nowLocal() {
    return localStamp(this.clock.now());
  }

  local(d: Date | null) {
    return d ? localStamp(d) : null;
  }

  /** Due within the next 3 days and still open. */
  dueSoon(a: { status: AssignmentStatus; dueAt: Date | null }) {
    const now = this.nowLocal();
    const due = this.local(a.dueAt);
    return (
      a.status === 'PUBLISHED' &&
      !!due &&
      due >= now &&
      due.slice(0, 10) <= addDays(now.slice(0, 10), 3)
    );
  }

  pastDue(a: { dueAt: Date | null }) {
    return !!a.dueAt && a.dueAt.getTime() < this.now().getTime();
  }

  /** Builds a roll lookup that remembers each arm × subject for the request. */
  rolls() {
    const cache = new Map<string, Promise<RollEntry[]>>();
    const offerings = new Map<string, Promise<string>>();
    return (sessionId: string, arm: { id: string; levelId: string }, subjectId: string) => {
      const key = `${sessionId}|${arm.id}|${subjectId}`;
      if (!cache.has(key)) {
        const offKey = `${sessionId}|${arm.levelId}|${subjectId}`;
        if (!offerings.has(offKey))
          offerings.set(
            offKey,
            this.db.curriculumEntry
              .findFirst({ where: { sessionId, levelId: arm.levelId, subjectId } })
              .then((e) => e?.offering ?? 'COMPULSORY'),
          );
        cache.set(
          key,
          offerings.get(offKey)!.then((offering) =>
            this.scope.studentsFor(sessionId, {
              armId: arm.id,
              subjectId,
              curriculumEntry: { offering },
            }),
          ),
        );
      }
      return cache.get(key)!;
    };
  }

  /** A record's timeline from the audit trail, newest first. */
  async timeline(entity: string, entityId: string) {
    const events = await this.db.auditEvent.findMany({
      where: { entityType: entity, entityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return events.map((e) => ({
      id: e.id,
      title: e.summary,
      detail: [e.actorName, e.detail].filter(Boolean).join(' · ') || undefined,
      tone: TONE[e.action] ?? ('neutral' as Tone),
      when: stamp(e.createdAt),
    }));
  }

  /** Guardians (and students with a Student Portal account) of these students. */
  async families(studentIds: string[]) {
    if (!studentIds.length) return [];
    const [links, students] = await Promise.all([
      this.db.studentGuardian.findMany({
        where: { studentId: { in: studentIds } },
        include: {
          guardian: {
            select: {
              id: true,
              title: true,
              fullName: true,
              email: true,
              phone: true,
              membership: { select: { userId: true, status: true } },
            },
          },
        },
      }),
      this.db.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          firstName: true,
          surname: true,
          membership: { select: { userId: true, status: true } },
        },
      }),
    ]);
    const out: (CommsRecipient & { studentId: string })[] = [];
    for (const s of students) {
      const vars = { student_name: fullName(s), first_name: s.firstName };
      for (const l of links.filter((x) => x.studentId === s.id))
        out.push({
          key: `${l.guardianId}#${s.id}`,
          role: 'PARENT',
          name: guardianName(l.guardian),
          userId: l.guardian.membership?.status === 'ACTIVE' ? l.guardian.membership.userId : null,
          guardianId: l.guardianId,
          studentId: s.id,
          email: l.guardian.email,
          phone: l.guardian.phone,
          vars: { ...vars, parent_name: guardianName(l.guardian) },
          entity: { type: 'Student', id: s.id },
        });
      if (s.membership?.status === 'ACTIVE')
        out.push({
          key: `student#${s.id}`,
          role: 'STUDENT',
          name: fullName(s),
          userId: s.membership.userId,
          studentId: s.id,
          email: null,
          phone: null,
          vars,
          entity: { type: 'Student', id: s.id },
        });
    }
    return out;
  }

  /**
   * Tells students and their guardians through the school's Communication settings (the event's
   * switch, channels and wording; in-app by default). Returns how many families were reached
   * and the flush to call once the transaction commits.
   */
  async notify(
    tx: TenantTx,
    input: {
      event: Extract<CommsEventKey, 'assignment.published' | 'assignment.returned'>;
      title: string;
      audienceLabel: string;
      studentIds: string[];
      vars: Record<string, string>;
      perStudent?: Map<string, Record<string, string>>;
      assignmentId: string;
      createdById: string;
    },
  ) {
    const recipients = (await this.families(input.studentIds)).map((r) => ({
      ...r,
      vars: { ...r.vars, ...input.perStudent?.get(r.studentId) },
    }));
    const sent = await this.comms.dispatch(asTx(tx), TeacherScopeService.schoolId(), {
      event: input.event,
      title: input.title,
      audienceLabel: input.audienceLabel,
      recipients,
      vars: input.vars,
      createdById: input.createdById,
      source: { type: 'Assignment', id: input.assignmentId },
      inApp: { category: 'assignments', link: `/assignments/${input.assignmentId}` },
    });
    const families = new Set(
      recipients.filter((r) => sent.reached.has(r.key)).map((r) => r.studentId),
    );
    return { flush: sent.flush, reached: families.size };
  }

  static reachedText(n: number, of: number) {
    return n
      ? `${plural(n, 'student')} and their guardians were notified${n < of ? ` (${of - n} have no portal account yet)` : ''}.`
      : 'Nobody was notified: no student or guardian has a portal account yet, or the school switched this notice off.';
  }

  static classLabel(arm: ArmInfo, subject: { name: string }) {
    return `${arm.label} · ${subject.name}`;
  }
}
