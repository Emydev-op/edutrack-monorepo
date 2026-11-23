import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { lagosToday } from '../../platform/shared/format.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel, isoDate, staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import {
  choiceOptions,
  choicesComplete,
  pickRule,
  requireChoices,
  saveChoices,
} from '../shared/subject-choices.js';
import { asTx } from '../shared/tenant-tx.js';
import { MemberPermissions } from './member-permissions.js';
import { ON_ROLL } from './student-view.js';

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);

/**
 * Students › a student › Subjects: what the student takes this session (compulsory subjects for
 * their class level, one religious subject and their electives by group, with each subject's
 * teacher), and changing their religious subject and electives later, e.g. moving an SS1 student
 * from Arts to Science, optionally into another arm of the same class. Scores already entered for
 * a dropped subject stay on that subject's result sheet.
 */
@Injectable()
export class StudentSubjectsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
    private readonly permissions: MemberPermissions,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async context(id: string) {
    const student = await this.db.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, firstName: true, surname: true, status: true, branchId: true },
    });
    if (!student) throw AppException.notFound('That student doesn’t exist.', 'NOT_FOUND');
    const session =
      (await this.db.academicSession.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
      })) ??
      (await this.db.academicSession.findFirst({
        where: { status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
        select: { id: true, name: true },
      }));
    const enrollment = session
      ? await this.db.enrollment.findFirst({
          where: { studentId: id, sessionId: session.id, status: 'ACTIVE' },
          select: {
            id: true,
            levelId: true,
            armId: true,
            branchId: true,
            level: { select: { name: true } },
            arm: { select: { name: true } },
          },
        })
      : null;
    return { student, session, enrollment };
  }

  async view(id: string) {
    const { student, session, enrollment } = await this.context(id);
    const name = `${student.firstName} ${student.surname}`;
    if (!session || !enrollment)
      return {
        name,
        session: session?.name ?? null,
        enrolled: false,
        editable: false,
        canEdit: false,
        className: null,
        compulsory: [],
        religious: [],
        groups: [],
        chosen: { religious: null, electives: [] },
        complete: false,
        arms: [],
      };
    const [options, picks, term, arms] = await Promise.all([
      choiceOptions(this.db, session.id, enrollment.levelId),
      this.db.studentSubject.findMany({
        where: { studentId: id, sessionId: session.id },
        select: { subjectId: true, startedOn: true },
      }),
      this.db.term.findFirst({
        where: { sessionId: session.id, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.db.classArm.findMany({
        where: {
          levelId: enrollment.levelId,
          branchId: enrollment.branchId,
          archivedAt: null,
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, capacity: true },
      }),
    ]);
    const teachers =
      term && enrollment.armId
        ? await this.db.teachingAssignment.findMany({
            where: { termId: term.id, armId: enrollment.armId },
            select: {
              subjectId: true,
              staff: { select: { title: true, firstName: true, lastName: true } },
            },
          })
        : [];
    const used = await this.db.enrollment.groupBy({
      by: ['armId'],
      where: { sessionId: session.id, status: 'ACTIVE', armId: { in: arms.map((a) => a.id) } },
      _count: { _all: true },
    });
    const teacherOf = (subjectId: string) => {
      const t = teachers.find((x) => x.subjectId === subjectId);
      return t ? staffName(t.staff) : null;
    };
    const since = new Map(picks.map((p) => [p.subjectId, p.startedOn]));
    const withTeacher = (s: { subjectId: string; code: string; name: string }) => ({
      ...s,
      teacher: teacherOf(s.subjectId),
      since: since.get(s.subjectId) ? fmt(since.get(s.subjectId)!) : null,
    });
    const chosenIds = picks.map((p) => p.subjectId);
    const religious = options.religious.find((r) => chosenIds.includes(r.subjectId));
    return {
      name,
      session: session.name,
      enrolled: true,
      editable: ON_ROLL.includes(student.status),
      /** The signed-in member may change subjects (students.edit). */
      canEdit: await this.permissions.has('students.edit'),
      className: enrollment.arm
        ? armLabel(enrollment.level.name, enrollment.arm.name)
        : enrollment.level.name,
      armId: enrollment.armId,
      compulsory: options.compulsory.map(withTeacher),
      religious: options.religious.map(withTeacher),
      groups: options.groups.map((g) => ({
        ...g,
        rule: pickRule(g),
        subjects: g.subjects.map(withTeacher),
      })),
      chosen: {
        religious: religious?.subjectId ?? null,
        electives: chosenIds.filter((sid) => sid !== religious?.subjectId),
      },
      complete: choicesComplete(options, chosenIds),
      arms: arms.map((a) => ({
        id: a.id,
        label: armLabel(enrollment.level.name, a.name),
        capacity: a.capacity,
        used: used.find((u) => u.armId === a.id)?._count._all ?? 0,
      })),
    };
  }

  /** Changes the student's religious subject and electives (and, optionally, their arm). */
  async change(
    id: string,
    dto: {
      religious?: string | null;
      electives?: string[];
      effectiveOn?: string | null;
      armId?: string | null;
      reason?: string | null;
    },
  ) {
    const { student, session, enrollment } = await this.context(id);
    const name = `${student.firstName} ${student.surname}`;
    if (!ON_ROLL.includes(student.status))
      throw AppException.conflict(`${name} has left the school.`, 'STUDENT_LEFT');
    if (!session || !enrollment)
      throw AppException.conflict(
        `${name} isn’t in a class this session yet. Place them in a class first.`,
        'NOT_ENROLLED',
      );
    const today = lagosToday(this.clock.now());
    const effective = dto.effectiveOn ? new Date(`${dto.effectiveOn}T00:00:00.000Z`) : today;
    if (
      Number.isNaN(effective.getTime()) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.effectiveOn ?? isoDate(today))
    )
      throw AppException.validation({ effectiveOn: 'Enter a real date.' }, 'Enter a real date.');
    const options = await choiceOptions(this.db, session.id, enrollment.levelId);
    const rows = requireChoices(options, {
      religious: dto.religious ?? null,
      electives: Array.isArray(dto.electives) ? dto.electives : [],
    });

    // Moving to another arm of the same class (and branch), when asked.
    let newArm: { id: string; name: string } | null = null;
    if (dto.armId && dto.armId !== enrollment.armId) {
      const arm = await this.db.classArm.findFirst({
        where: {
          id: dto.armId,
          levelId: enrollment.levelId,
          branchId: enrollment.branchId,
          archivedAt: null,
        },
        select: { id: true, name: true, capacity: true },
      });
      if (!arm)
        throw AppException.validation(
          { armId: 'Choose an arm of the same class at this branch.' },
          'Choose an arm of the same class at this branch.',
        );
      const used = await this.db.enrollment.count({
        where: { sessionId: session.id, status: 'ACTIVE', armId: arm.id },
      });
      if (used >= arm.capacity)
        throw AppException.conflict(
          `${armLabel(enrollment.level.name, arm.name)} is full (${arm.capacity} places).`,
          'ARM_FULL',
        );
      newArm = arm;
    }

    const subjectNames = new Map(
      [...options.religious, ...options.groups.flatMap((g) => g.subjects)].map((s) => [
        s.subjectId,
        s.name,
      ]),
    );
    await this.db.$transaction(async (tx) => {
      const { added, dropped } = await saveChoices(
        tx,
        RequestContext.schoolId()!,
        id,
        session.id,
        rows,
        effective,
      );
      if (newArm)
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { armId: newArm.id } });
      if (!added.length && !dropped.length && !newArm) return;
      for (const s of await tx.subject.findMany({
        where: { id: { in: [...added, ...dropped] } },
        select: { id: true, name: true },
      }))
        subjectNames.set(s.id, s.name);
      const label = (ids: string[]) =>
        ids.map((x) => subjectNames.get(x) ?? 'a subject').join(', ');
      await this.audit.record(
        {
          action: 'student.subjects',
          area: 'Students',
          entity: 'Student',
          entityId: id,
          summary: `Subjects changed for ${name}`,
          detail: [
            added.length && `Added ${label(added)}`,
            dropped.length && `Dropped ${label(dropped)}`,
            newArm && `Moved to ${armLabel(enrollment.level.name, newArm.name)}`,
            `from ${fmt(effective)}`,
            dto.reason?.trim(),
          ]
            .filter(Boolean)
            .join(' · '),
          after: { added, dropped, armId: newArm?.id ?? enrollment.armId },
        },
        asTx(tx),
      );
    });
    return this.view(id);
  }

  /* ---------------- A whole class ---------------- */

  /** The session the class screen works on: the one asked for, else Active, else Upcoming. */
  private async sessionFor(sessionId?: string | null) {
    if (sessionId) {
      const s = await this.db.academicSession.findFirst({
        where: { id: sessionId },
        select: { id: true, name: true, status: true },
      });
      if (!s) throw AppException.notFound('That session doesn’t exist.', 'NOT_FOUND');
      return s;
    }
    const s =
      (await this.db.academicSession.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, status: true },
      })) ??
      (await this.db.academicSession.findFirst({
        where: { status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
        select: { id: true, name: true, status: true },
      }));
    if (!s) throw AppException.conflict('There’s no session set up yet.', 'NO_SESSION');
    return s;
  }

  private async armOf(armId: string) {
    const arm = /^[0-9a-f-]{36}$/i.test(armId)
      ? await this.db.classArm.findFirst({
          where: { id: armId },
          select: { id: true, name: true, levelId: true, level: { select: { name: true } } },
        })
      : null;
    if (!arm) throw AppException.notFound('That class doesn’t exist.', 'NOT_FOUND');
    return arm;
  }

  /**
   * Everyone in a class arm with their religious subject and electives for the session, and
   * whether each meets the rules: the screen for confirming a class's choices after promotion.
   */
  async classView(armId: string, sessionId?: string | null) {
    const [arm, session] = await Promise.all([this.armOf(armId), this.sessionFor(sessionId)]);
    const [options, roll] = await Promise.all([
      choiceOptions(this.db, session.id, arm.levelId),
      this.db.enrollment.findMany({
        where: {
          sessionId: session.id,
          armId: arm.id,
          status: 'ACTIVE',
          student: { status: { in: ON_ROLL }, deletedAt: null },
        },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
        select: {
          student: { select: { id: true, firstName: true, surname: true, admissionNo: true } },
        },
      }),
    ]);
    const picks = await this.db.studentSubject.findMany({
      where: { sessionId: session.id, studentId: { in: roll.map((r) => r.student.id) } },
      select: { studentId: true, subjectId: true },
    });
    const students = roll.map(({ student }) => {
      const ids = picks.filter((p) => p.studentId === student.id).map((p) => p.subjectId);
      const religious = options.religious.find((r) => ids.includes(r.subjectId));
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.surname}`,
        admissionNo: student.admissionNo,
        religious: religious?.subjectId ?? null,
        electives: ids.filter((x) => x !== religious?.subjectId),
        complete: choicesComplete(options, ids),
      };
    });
    return {
      session: session.name,
      sessionId: session.id,
      className: armLabel(arm.level.name, arm.name),
      compulsory: options.compulsory,
      religious: options.religious,
      groups: options.groups.map((g) => ({ ...g, rule: pickRule(g) })),
      students,
      needChoosing: students.filter((x) => !x.complete).length,
    };
  }

  /** Saves the choices of several students in a class at once (each checked against the rules). */
  async saveClass(
    armId: string,
    sessionId: string | null | undefined,
    rows: { studentId: string; religious?: string | null; electives?: string[] }[],
  ) {
    const [arm, session] = await Promise.all([this.armOf(armId), this.sessionFor(sessionId)]);
    const options = await choiceOptions(this.db, session.id, arm.levelId);
    const roll = new Map(
      (
        await this.db.enrollment.findMany({
          where: {
            sessionId: session.id,
            armId: arm.id,
            status: 'ACTIVE',
            student: { status: { in: ON_ROLL }, deletedAt: null },
          },
          select: { student: { select: { id: true, firstName: true, surname: true } } },
        })
      ).map((e) => [e.student.id, `${e.student.firstName} ${e.student.surname}`]),
    );
    const fields: Record<string, string> = {};
    const toSave: { studentId: string; rows: ReturnType<typeof requireChoices> }[] = [];
    rows.forEach((r, i) => {
      const name = roll.get(r.studentId);
      if (!name) {
        fields[`students.${i}`] = 'That student isn’t in this class.';
        return;
      }
      try {
        toSave.push({
          studentId: r.studentId,
          rows: requireChoices(options, {
            religious: r.religious ?? null,
            electives: Array.isArray(r.electives) ? r.electives : [],
          }),
        });
      } catch (e) {
        const msg = e instanceof AppException ? e.message : null;
        fields[`students.${i}`] = `${name}: ${msg ?? 'check their subjects.'}`;
      }
    });
    if (Object.keys(fields).length) throw AppException.validation(fields, Object.values(fields)[0]);
    const startedOn = lagosToday(this.clock.now());
    let changed = 0;
    await this.db.$transaction(async (tx) => {
      for (const s of toSave) {
        const r = await saveChoices(
          tx,
          RequestContext.schoolId()!,
          s.studentId,
          session.id,
          s.rows,
          startedOn,
        );
        if (r.added.length || r.dropped.length) changed++;
      }
      if (changed)
        await this.audit.record(
          {
            action: 'class.subjects',
            area: 'Students',
            entity: 'ClassArm',
            entityId: arm.id,
            summary: `Subject choices saved for ${armLabel(arm.level.name, arm.name)}`,
            detail: `${session.name} · ${changed} student${changed === 1 ? '' : 's'} changed`,
          },
          asTx(tx),
        );
    });
    return { ...(await this.classView(armId, session.id)), changed };
  }
}
