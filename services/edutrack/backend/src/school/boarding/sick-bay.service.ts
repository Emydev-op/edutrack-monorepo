import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma, SickBayOutcome } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { ON_ROLL } from '../students/student-view.js';
import { boardingActor, requireBoarding } from './boarding-actor.js';
import { BoardingAlertsService } from './boarding-alerts.service.js';
import { boardingSession } from './boarding-use.js';
import { whenLabel } from './exeats.service.js';

export const OUTCOME_LABEL: Record<SickBayOutcome, string> = {
  RETURNED: 'Back to class',
  ADMITTED: 'Admitted',
  SENT_HOME: 'Sent home',
  REFERRED: 'Referred to hospital',
};
const OUTCOME_OF = Object.fromEntries(
  Object.entries(OUTCOME_LABEL).map(([k, v]) => [v, k]),
) as Record<string, SickBayOutcome>;
const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);

const VISIT_INCLUDE = {
  student: {
    select: { id: true, firstName: true, surname: true, admissionNo: true, medicalNotes: true },
  },
  branch: { select: { name: true } },
} satisfies Prisma.SickBayVisitInclude;
type VisitRow = Prisma.SickBayVisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

/**
 * The sick bay: the nurse records each visit (complaint, assessment, treatment, medicines,
 * outcome). A student kept in the sick bay is Admitted until discharged, and shows as "Sick bay"
 * at hostel roll calls. Parents are told about every visit. Needs `boarding.health`.
 */
@Injectable()
export class SickBayService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly alerts: BoardingAlertsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async classes(studentIds: string[]) {
    const session = await boardingSession(this.db);
    if (!session || !studentIds.length)
      return new Map<string, { className: string; boarding: boolean }>();
    const rows = await this.db.enrollment.findMany({
      where: { sessionId: session.id, studentId: { in: studentIds }, status: 'ACTIVE' },
      select: {
        studentId: true,
        boarding: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
      },
    });
    return new Map(
      rows.map((r) => [
        r.studentId,
        {
          className: r.arm ? armLabel(r.level.name, r.arm.name) : r.level.name,
          boarding: r.boarding,
        },
      ]),
    );
  }

  private async views(rows: VisitRow[]) {
    const [cls, users] = await Promise.all([
      this.classes(rows.map((r) => r.studentId)),
      this.db.user.findMany({
        where: {
          id: {
            in: [...new Set(rows.map((r) => r.recordedByUserId).filter((x): x is string => !!x))],
          },
        },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return rows.map((v) => ({
      id: v.id,
      student: {
        id: v.student.id,
        name: `${v.student.firstName} ${v.student.surname}`,
        admissionNo: v.student.admissionNo,
        className: cls.get(v.studentId)?.className ?? '',
        boarder: cls.get(v.studentId)?.boarding ?? false,
        medicalNotes: v.student.medicalNotes ?? '',
      },
      campus: v.branch.name,
      seenAt: v.seenAt.toISOString(),
      seen: whenLabel(v.seenAt),
      complaint: v.complaint,
      assessment: v.assessment,
      treatment: v.treatment,
      medication: v.medication,
      outcome: OUTCOME_LABEL[v.outcome],
      inSickBay: v.outcome === 'ADMITTED' && !v.dischargedAt,
      dischargedAt: v.dischargedAt?.toISOString() ?? null,
      notes: v.notes,
      recordedBy: names.get(v.recordedByUserId ?? '') ?? null,
    }));
  }

  /** Who is in the sick bay now, and recent visits (optionally one student's). */
  async list(auth: AuthUserContext, q: { studentId?: string; branchId?: string; days?: string }) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(
      actor,
      'health',
      'Only the nurse and the Head of boarding can see sick bay records.',
    );
    const days = Math.min(Math.max(Number(q.days) || 14, 1), 365);
    const since = new Date(this.clock.now().getTime() - days * 86_400_000);
    const where = {
      ...(q.studentId && isUuid(q.studentId) && { studentId: q.studentId }),
      ...(q.branchId && { branchId: q.branchId }),
    };
    const [admitted, recent] = await Promise.all([
      this.db.sickBayVisit.findMany({
        where: { ...where, outcome: 'ADMITTED', dischargedAt: null },
        include: VISIT_INCLUDE,
        orderBy: { seenAt: 'asc' },
      }),
      this.db.sickBayVisit.findMany({
        where: { ...where, ...(!q.studentId && { seenAt: { gte: since } }) },
        include: VISIT_INCLUDE,
        orderBy: { seenAt: 'desc' },
        take: 300,
      }),
    ]);
    return { inSickBay: await this.views(admitted), visits: await this.views(recent) };
  }

  /** Records a visit. Admitted students stay in the sick bay until discharged. */
  async record(
    auth: AuthUserContext,
    dto: {
      studentId: string;
      complaint: string;
      assessment?: string;
      treatment?: string;
      medication?: string;
      outcome: string;
      notes?: string;
      seenAt?: string | null;
    },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(
      actor,
      'health',
      'Only the nurse and the Head of boarding can record sick bay visits.',
    );
    const errors: Record<string, string> = {};
    const student = isUuid(dto.studentId)
      ? await this.db.student.findFirst({
          where: { id: dto.studentId, deletedAt: null, status: { in: ON_ROLL } },
          select: { id: true, firstName: true, surname: true, branchId: true },
        })
      : null;
    if (!student) errors.studentId = 'Choose a student at the school.';
    const complaint = (dto.complaint ?? '').trim();
    if (!complaint) errors.complaint = 'Say what brought them in.';
    const outcome = OUTCOME_OF[dto.outcome];
    if (!outcome) errors.outcome = 'Choose what happened next.';
    const seenAt = dto.seenAt
      ? new Date(
          /[zZ]|[+-]\d\d:?\d\d$/.test(dto.seenAt)
            ? dto.seenAt
            : `${dto.seenAt}${dto.seenAt.length === 16 ? ':00' : ''}+01:00`,
        )
      : this.clock.now();
    if (Number.isNaN(seenAt.getTime()) || seenAt > this.clock.now())
      errors.seenAt = 'Choose when they were seen (not in the future).';
    if (Object.keys(errors).length) throw invalid(errors);
    if (outcome === 'ADMITTED') {
      const already = await this.db.sickBayVisit.count({
        where: { studentId: student!.id, outcome: 'ADMITTED', dischargedAt: null },
      });
      if (already)
        throw new AppException(
          HttpStatus.CONFLICT,
          'They’re already in the sick bay.',
          'ALREADY_ADMITTED',
        );
    }
    const clip = (v: string | undefined, n: number) => (v ?? '').trim().slice(0, n);
    const visit = await this.db.$transaction(async (tx) => {
      const v = await tx.sickBayVisit.create({
        data: {
          schoolId: RequestContext.schoolId()!,
          studentId: student!.id,
          branchId: student!.branchId,
          seenAt,
          complaint: clip(complaint, 300),
          assessment: clip(dto.assessment, 1000),
          treatment: clip(dto.treatment, 1000),
          medication: clip(dto.medication, 500),
          outcome: outcome!,
          notes: clip(dto.notes, 1000),
          recordedByUserId: auth.userId,
        },
      });
      await this.audit.record(
        {
          action: 'sickbay.visit',
          area: 'Boarding',
          entity: 'Student',
          entityId: student!.id,
          summary: `Sick bay visit: ${OUTCOME_LABEL[outcome!].toLowerCase()}`,
          detail: `Recorded by ${actor.name}`,
        },
        asTx(tx),
      );
      return v;
    });
    const name = `${student!.firstName} ${student!.surname}`;
    const next: Record<SickBayOutcome, string> = {
      RETURNED: 'They were treated and went back to class.',
      ADMITTED: 'They are being kept in the sick bay and looked after by the nurse.',
      SENT_HOME: 'They need to go home. The school will contact you to arrange collection.',
      REFERRED: 'They have been referred to hospital. The school will contact you.',
    };
    await this.alerts.parents(student!.id, {
      title: `${name} visited the sick bay`,
      body: `${name} was seen by the school nurse at ${whenLabel(seenAt)} for: ${complaint}. ${next[outcome!]}`,
      link: '/boarding',
      entityType: 'SickBayVisit',
      entityId: visit.id,
    });
    return (
      await this.views([
        await this.db.sickBayVisit.findFirstOrThrow({
          where: { id: visit.id },
          include: VISIT_INCLUDE,
        }),
      ])
    )[0]!;
  }

  /** Discharges a student kept in the sick bay. */
  async discharge(auth: AuthUserContext, id: string, note?: string) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(
      actor,
      'health',
      'Only the nurse and the Head of boarding can discharge students.',
    );
    const v = isUuid(id)
      ? await this.db.sickBayVisit.findFirst({ where: { id }, include: VISIT_INCLUDE })
      : null;
    if (!v) throw AppException.notFound('That visit doesn’t exist.', 'NOT_FOUND');
    if (v.outcome !== 'ADMITTED' || v.dischargedAt)
      throw new AppException(HttpStatus.CONFLICT, 'They’re not in the sick bay.', 'NOT_ADMITTED');
    const now = this.clock.now();
    await this.db.sickBayVisit.update({
      where: { id },
      data: {
        dischargedAt: now,
        ...(note?.trim() && {
          notes: [v.notes, `Discharged: ${note.trim()}`].filter(Boolean).join('\n').slice(0, 1000),
        }),
      },
    });
    const name = `${v.student.firstName} ${v.student.surname}`;
    await this.alerts.parents(v.studentId, {
      title: `${name} has left the sick bay`,
      body: `${name} was discharged from the sick bay at ${whenLabel(now)}.${note?.trim() ? ` ${note.trim()}` : ''}`,
      link: '/boarding',
      entityType: 'SickBayVisit',
      entityId: v.id,
    });
    return (
      await this.views([
        await this.db.sickBayVisit.findFirstOrThrow({ where: { id }, include: VISIT_INCLUDE }),
      ])
    )[0]!;
  }

  /** Parent Portal: their child's sick bay visits (the last year). */
  async forParent(studentId: string) {
    const rows = await this.db.sickBayVisit.findMany({
      where: {
        studentId,
        seenAt: { gte: new Date(this.clock.now().getTime() - 365 * 86_400_000) },
      },
      include: VISIT_INCLUDE,
      orderBy: { seenAt: 'desc' },
      take: 50,
    });
    return (await this.views(rows)).map((v) => ({
      id: v.id,
      seen: v.seen,
      seenAt: v.seenAt,
      complaint: v.complaint,
      treatment: v.treatment,
      medication: v.medication,
      outcome: v.outcome,
      inSickBay: v.inSickBay,
    }));
  }
}
