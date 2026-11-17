import { HttpStatus, Injectable } from '@nestjs/common';
import type { TeachingAssignmentType } from '../../generated/prisma/enums.js';
import { AcademicCatalogService, type ArmInfo } from '../academics/academic-catalog.service.js';
import { fail, plural, staffName } from '../academics/academic-format.js';
import { SCORED } from '../curriculum/curriculum.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { DAY_LABEL } from '../timetable/timetable-format.js';

export const ASSIGNMENTS_STEP = 'teacher-assignments';

export const TYPE_LABEL: Record<TeachingAssignmentType, string> = {
  SUBJECT_TEACHER: 'Subject teacher',
  TEMPORARY: 'Temporary',
  PART_TIME: 'Part-time',
};
const TYPE_BY_LABEL = Object.fromEntries(
  Object.entries(TYPE_LABEL).map(([k, v]) => [v, k]),
) as Record<string, TeachingAssignmentType>;

export interface AssignmentInput {
  teacherId: string;
  subject: string;
  armId: string;
  type?: string;
}

export interface AssignmentWarning {
  tone: 'warning' | 'error';
  kind: 'workload' | 'qualification' | 'conflict' | 'branch' | 'duplicate';
  text: string;
}

/**
 * Academics › Teacher Assignments: who teaches which subject in which arm this term, each
 * teacher's load against their weekly maximum, gaps, and arms without a class teacher. Shapes
 * follow the School Admin mock (`/v1/academics/assignments`).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly audit: SchoolAuditService,
    private readonly setup: SetupStateService,
  ) {}

  private get db() {
    return this.catalog.db;
  }

  private async requireTerm(termId?: string | null) {
    const found = await this.catalog.termFrom(termId);
    if (!found?.term)
      throw fail('Create a session and its terms first.', 'NO_TERM', HttpStatus.CONFLICT);
    return { session: found.session, term: found.term };
  }

  /** Active teaching staff, with the branches they work at and the subjects they're qualified for. */
  async teachers() {
    const [staff, branches] = await Promise.all([
      this.db.staff.findMany({
        where: { kind: 'TEACHING', status: 'ACTIVE' },
        include: {
          branches: { select: { branchId: true } },
          qualifications: { select: { subject: { select: { code: true } } } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.catalog.structure.activeBranches(),
    ]);
    return staff.map((s) => ({
      id: s.id,
      name: staffName(s),
      branches: s.allBranches ? branches.map((b) => b.id) : s.branches.map((b) => b.branchId),
      qualified: s.qualifications.map((q) => q.subject.code),
      employment: s.employment === 'PART_TIME' ? ('Part-time' as const) : ('Full-time' as const),
      maxPeriods: s.maxPeriodsPerWeek,
    }));
  }

  private loads(rows: { staffId: string; periodsPerWeek: number }[]) {
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.staffId, (out.get(r.staffId) ?? 0) + r.periodsPerWeek);
    return out;
  }

  async view(termId?: string | null, branch?: string | null) {
    const { session, term } = await this.requireTerm(termId);
    const branchId = await this.catalog.branchIdByName(branch);
    const [allArms, offered, teachers, rows, classTeachers, subjects, confirmed, previous] =
      await Promise.all([
        this.catalog.arms(),
        this.catalog.offeredByLevel(session.id),
        this.teachers(),
        this.db.teachingAssignment.findMany({
          where: { termId: term.id },
          include: {
            subject: { select: { code: true, name: true } },
            staff: { select: { title: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.db.classTeacherAssignment.findMany({
          where: { sessionId: session.id, endsOn: null },
          select: { armId: true, staffId: true },
        }),
        this.db.subject.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
        this.setup.isConfirmed(ASSIGNMENTS_STEP),
        this.catalog.previousTerm(term.id),
      ]);
    const arms = allArms.filter((a) => !branchId || a.branchId === branchId);
    const armById = new Map(allArms.map((a) => [a.id, a]));
    const ids = new Set(arms.map((a) => a.id));
    const load = this.loads(rows);
    const gaps = new Map<
      string,
      { code: string; name: string; arms: { id: string; name: string }[] }
    >();
    for (const arm of arms)
      for (const s of offered.get(arm.levelId) ?? [])
        if (!rows.some((r) => r.armId === arm.id && r.subjectId === s.subjectId)) {
          const g = gaps.get(s.code) ?? { code: s.code, name: s.name, arms: [] };
          g.arms.push({ id: arm.id, name: arm.label });
          gaps.set(s.code, g);
        }
    const withCT = new Set(classTeachers.map((c) => c.armId));
    return {
      term: term.name,
      assignments: rows
        .filter((r) => ids.has(r.armId) && armById.has(r.armId))
        .map((r) => {
          const arm = armById.get(r.armId)!;
          return {
            id: r.id,
            teacherId: r.staffId,
            teacher: staffName(r.staff),
            subject: r.subject.code,
            subjectName: r.subject.name,
            armId: r.armId,
            arm: arm.label,
            branch: arm.branch,
            type: TYPE_LABEL[r.type],
            periods: r.periodsPerWeek,
          };
        }),
      teachers: teachers.map((t) => ({
        ...t,
        periods: load.get(t.id) ?? 0,
        classTeacherOf: classTeachers
          .filter((c) => c.staffId === t.id && armById.has(c.armId))
          .map((c) => armById.get(c.armId)!.label),
      })),
      gaps: [...gaps.values()].map((g) => ({ subject: g.code, subjectName: g.name, arms: g.arms })),
      armsWithoutClassTeacher: arms
        .filter((a) => !withCT.has(a.id))
        .map((a) => ({ id: a.id, name: a.label })),
      arms: arms.map((a) => ({
        id: a.id,
        name: a.label,
        branch: a.branch,
        branchId: a.branchId,
        subjects: (offered.get(a.levelId) ?? []).map((s) => s.code),
      })),
      subjects: subjects.map((s) => ({ code: s.code, name: s.name })),
      confirmed,
      canCopyPrevious: previous
        ? (await this.db.teachingAssignment.count({ where: { termId: previous.id } })) > 0
        : false,
    };
  }

  /** The warnings shown while choosing; `error` ones (except timetable conflicts) block saving. */
  async check(p: AssignmentInput, termId?: string | null): Promise<AssignmentWarning[]> {
    const out: AssignmentWarning[] = [];
    if (!p.teacherId || !p.armId || !p.subject) return out;
    const { session, term } = await this.requireTerm(termId);
    const [teachers, arm, subject] = await Promise.all([
      this.teachers(),
      this.catalog.arm(p.armId),
      this.db.subject.findFirst({ where: { code: p.subject } }),
    ]);
    const t = teachers.find((x) => x.id === p.teacherId);
    if (!t || !arm || !subject) return out;
    const subjectLabel = subject.name;
    if (!t.branches.includes(arm.branchId))
      out.push({ tone: 'error', kind: 'branch', text: `${t.name} doesn’t work at ${arm.branch}.` });
    const offered = await this.db.curriculumEntry.findFirst({
      where: {
        sessionId: session.id,
        levelId: arm.levelId,
        subjectId: subject.id,
        subject: { status: 'ACTIVE' },
      },
    });
    if (!offered)
      out.push({
        tone: 'error',
        kind: 'duplicate',
        text: `${arm.level} doesn’t offer ${subjectLabel}. Add it to the curriculum first.`,
      });
    const [existing, mine] = await Promise.all([
      this.db.teachingAssignment.findFirst({
        where: { termId: term.id, armId: arm.id, subjectId: subject.id },
        include: { staff: { select: { title: true, firstName: true, lastName: true } } },
      }),
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, staffId: t.id },
        select: { staffId: true, periodsPerWeek: true },
      }),
    ]);
    if (existing && existing.staffId !== t.id)
      out.push({
        tone: 'warning',
        kind: 'duplicate',
        text: `Replaces ${staffName(existing.staff)} for ${arm.label} ${subjectLabel}.`,
      });
    if (existing?.staffId === t.id)
      out.push({
        tone: 'warning',
        kind: 'duplicate',
        text: `${t.name} already teaches ${arm.label} ${subjectLabel}.`,
      });
    const add = existing?.staffId === t.id ? 0 : subject.periodsPerWeek;
    const load = mine.reduce((n, r) => n + r.periodsPerWeek, 0);
    if (load + add > t.maxPeriods)
      out.push({
        tone: 'error',
        kind: 'workload',
        text: `Workload: ${load} + ${add} = ${load + add} of ${t.maxPeriods} periods. This exceeds the maximum set for ${t.employment.toLowerCase()} teachers.`,
      });
    else if (load + add >= t.maxPeriods - 2)
      out.push({
        tone: 'warning',
        kind: 'workload',
        text: `Workload: ${load} + ${add} = ${load + add} of ${t.maxPeriods} periods. Allowed, but close to the limit.`,
      });
    if (!t.qualified.includes(subject.code)) {
      const names = await this.db.subject.findMany({ where: { code: { in: t.qualified } } });
      out.push({
        tone: 'warning',
        kind: 'qualification',
        text: `${t.name} is not qualified for ${subjectLabel} on their staff record (${names.map((s) => s.name).join(', ') || 'none listed'}). Confirm this is a temporary cover.`,
      });
    }
    const conflict = await this.timetableConflict(term.id, arm, subject.id, t.id);
    if (conflict)
      out.push({
        tone: 'error',
        kind: 'conflict',
        text: `Timetable conflict: ${arm.label} ${subjectLabel} is on ${conflict.when}. ${t.name} teaches ${conflict.busy} then. Resolve it in the timetable before publishing.`,
      });
    return out;
  }

  /** A lesson of this subject in the arm's draft timetable when the teacher is busy elsewhere. */
  private async timetableConflict(
    termId: string,
    arm: ArmInfo,
    subjectId: string,
    staffId: string,
  ) {
    const lessons = await this.db.timetableSlot.findMany({
      where: { termId, layer: 'DRAFT', subjectId, timetable: { armId: arm.id } },
      include: { period: true },
    });
    if (!lessons.length) return null;
    const busy = await this.db.timetableSlot.findMany({
      where: {
        termId,
        layer: 'DRAFT',
        staffId,
        timetable: { armId: { not: arm.id } },
        OR: lessons.map((l) => ({
          day: l.day,
          period: { startsAt: { lt: l.period.endsAt }, endsAt: { gt: l.period.startsAt } },
        })),
      },
      include: {
        period: true,
        subject: { select: { name: true } },
        timetable: { select: { armId: true } },
      },
    });
    const hit = busy[0];
    if (!hit) return null;
    const other = await this.catalog.arm(hit.timetable.armId);
    const lesson = lessons.find((l) => l.day === hit.day)!;
    return {
      when: `${DAY_LABEL[lesson.day]} period ${lesson.period.label}`,
      busy: `${other?.label ?? 'another class'} · ${hit.subject.name}`,
    };
  }

  async assign(schoolId: string, p: AssignmentInput, termId?: string | null) {
    const { session, term } = await this.requireTerm(termId);
    const teacher = p.teacherId
      ? await this.db.staff.findFirst({
          where: { id: p.teacherId, kind: 'TEACHING', status: 'ACTIVE' },
        })
      : null;
    if (!teacher) throw fail('Choose a teacher.', 'VALIDATION');
    if (!p.subject) throw fail('Choose a subject.', 'VALIDATION');
    if (!p.armId) throw fail('Choose a class.', 'VALIDATION');
    const [arm, subject] = await Promise.all([
      this.catalog.arm(p.armId),
      this.db.subject.findFirst({ where: { code: p.subject } }),
    ]);
    if (!arm) throw fail('Choose a class.', 'VALIDATION');
    if (!subject) throw fail('Choose a subject.', 'VALIDATION');
    const type = TYPE_BY_LABEL[p.type ?? 'Subject teacher'];
    if (!type) throw fail('Choose the assignment type.', 'VALIDATION');
    const blocking = (await this.check(p, term.id)).filter(
      (w) => w.tone === 'error' && w.kind !== 'conflict',
    );
    if (blocking.length) throw fail(blocking[0]!.text, 'ASSIGNMENT_INVALID');
    const name = staffName(teacher);
    await this.db.$transaction(async (tx) => {
      const existing = await tx.teachingAssignment.findFirst({
        where: { termId: term.id, armId: arm.id, subjectId: subject.id },
      });
      if (existing)
        await tx.teachingAssignment.update({
          where: { id: existing.id },
          data: { staffId: teacher.id, type },
        });
      else
        await tx.teachingAssignment.create({
          data: {
            schoolId,
            sessionId: session.id,
            termId: term.id,
            levelId: arm.levelId,
            armId: arm.id,
            subjectId: subject.id,
            staffId: teacher.id,
            type,
            periodsPerWeek: subject.periodsPerWeek,
          },
        });
      // Lessons already placed follow the new teacher.
      await tx.timetableSlot.updateMany({
        where: { termId: term.id, subjectId: subject.id, timetable: { armId: arm.id } },
        data: { staffId: teacher.id },
      });
      await this.audit.record(
        {
          action: 'assignment.save',
          area: 'Academic',
          entity: 'TeachingAssignment',
          summary: `${name} assigned`,
          detail: `${subject.name} · ${arm.label} · ${TYPE_LABEL[type]}`,
        },
        asTx(tx),
      );
    });
    return this.view(term.id);
  }

  /** Unlinks sheets and planned assessments (they keep their teacher), then deletes. */
  static async detach(tx: TenantTx, ids: string[]) {
    if (!ids.length) return;
    await tx.resultSheet.updateMany({
      where: { teachingAssignmentId: { in: ids } },
      data: { teachingAssignmentId: null },
    });
    await tx.assessmentSchedule.updateMany({
      where: { teachingAssignmentId: { in: ids } },
      data: { teachingAssignmentId: null },
    });
  }

  async remove(id: string) {
    const a = await this.db.teachingAssignment.findFirst({
      where: { id },
      include: {
        subject: { select: { name: true } },
        staff: { select: { title: true, firstName: true, lastName: true } },
      },
    });
    if (!a) throw fail('Assignment not found', 'ASSIGNMENT_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (
      await this.db.resultSheet.count({
        where: { teachingAssignmentId: id, status: { in: SCORED as never } },
      })
    )
      throw fail(
        `${staffName(a.staff)} has handed in ${a.subject.name} scores for this class. Assign another teacher instead of removing it.`,
        'ASSIGNMENT_HAS_SCORES',
        HttpStatus.CONFLICT,
      );
    await this.db.$transaction(async (tx) => {
      await AssignmentsService.detach(tx, [id]);
      await tx.timetableSlot.updateMany({
        where: { termId: a.termId, subjectId: a.subjectId, timetable: { armId: a.armId } },
        data: { staffId: null },
      });
      await tx.teachingAssignment.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'assignment.delete',
          area: 'Academic',
          entity: 'TeachingAssignment',
          entityId: id,
          summary: `Assignment removed: ${staffName(a.staff)}`,
          detail: a.subject.name,
        },
        asTx(tx),
      );
    });
    return this.view(a.termId);
  }

  /**
   * Copies the previous term's assignments into this one, skipping filled slots, staff who left
   * or stopped teaching, archived arms and subjects this session doesn't offer there.
   */
  async copyPrevious(schoolId: string, termId?: string | null) {
    const { session, term } = await this.requireTerm(termId);
    const previous = await this.catalog.previousTerm(term.id);
    const source = previous
      ? await this.db.teachingAssignment.findMany({
          where: {
            termId: previous.id,
            staff: { status: 'ACTIVE', kind: 'TEACHING' },
            arm: { archivedAt: null },
          },
        })
      : [];
    const [current, offered] = await Promise.all([
      this.db.teachingAssignment.findMany({ where: { termId: term.id } }),
      this.db.curriculumEntry.findMany({
        where: { sessionId: session.id, subject: { status: 'ACTIVE' } },
        select: { levelId: true, subjectId: true },
      }),
    ]);
    const filled = new Set(current.map((a) => `${a.armId}|${a.subjectId}`));
    const ok = new Set(offered.map((o) => `${o.levelId}|${o.subjectId}`));
    const copy = source.filter(
      (a) => !filled.has(`${a.armId}|${a.subjectId}`) && ok.has(`${a.levelId}|${a.subjectId}`),
    );
    await this.db.$transaction(async (tx) => {
      await tx.teachingAssignment.createMany({
        data: copy.map((a) => ({
          schoolId,
          sessionId: session.id,
          termId: term.id,
          levelId: a.levelId,
          armId: a.armId,
          subjectId: a.subjectId,
          staffId: a.staffId,
          type: a.type,
          periodsPerWeek: a.periodsPerWeek,
        })),
      });
      await this.audit.record(
        {
          action: 'assignments.copy',
          area: 'Academic',
          entity: 'TeachingAssignment',
          summary: 'Assignments copied from the previous term',
          detail: plural(copy.length, 'assignment'),
        },
        asTx(tx),
      );
    });
    return { ...(await this.view(term.id)), copied: copy.length };
  }

  /** Setup Center facts: subject slots filled and arms without a class teacher. */
  async slots() {
    const found = await this.catalog.termFrom();
    if (!found?.term) return { total: 0, filled: 0, noClassTeacher: 0, assignments: 0 };
    const v = await this.view(found.term.id);
    const total = v.arms.reduce((n, a) => n + a.subjects.length, 0);
    const missing = v.gaps.reduce((n, g) => n + g.arms.length, 0);
    return {
      total,
      filled: total - missing,
      noClassTeacher: v.armsWithoutClassTeacher.length,
      assignments: v.assignments.length,
    };
  }
}
