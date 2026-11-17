import { NIGERIAN_STATES } from '@edutrack/shared';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { displayPhone, formatDay } from '../../platform/shared/format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asAuditDb, withNotice } from '../staff/staff-audit.js';
import { isUuid } from '../staff/staff-records.service.js';
import { EMAIL, GENDER_OF, toE164, unprocessable } from '../staff/staff-view.js';
import { AdmissionRecordsService, type ArmPlace } from './admission-records.service.js';
import {
  ADMISSION_TYPE_LABEL,
  ADMISSION_TYPE_OF,
  bareName,
  birthProblem,
  ddmmyyyy,
  normalise,
  ON_ROLL,
  parseDay,
  REQUIRED_DOCUMENTS,
  STAGE_LABEL,
  stateOf,
} from './admissions-view.js';
import type { AdmissionMatchesQueryDto, AdmitDto } from './dto/admissions.dto.js';

const PHONE_MESSAGE = 'Enter a Nigerian phone number, e.g. 0803 555 0193.';

/** A guardian as admissions reads it: live (not merged away or deleted). */
const LIVE_GUARDIAN = { deletedAt: null, mergedIntoId: null } as const;

/**
 * School Admin › Students › Admissions: the applications list, what the admission wizard needs,
 * possible duplicates and siblings, and admitting a student (number, guardian, enrollment).
 * Admission never creates portal accounts or invitations: the school invites guardians itself.
 * Contract: `school-admin/src/api/mock/handlers/students.ts`.
 */
@Injectable()
export class AdmissionsService {
  constructor(
    private readonly records: AdmissionRecordsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.records.db;
  }

  /* ---------------- Applications ---------------- */

  async applications() {
    const rows = await this.db.admissionApplication.findMany({
      orderBy: [{ appliedOn: 'desc' }, { createdAt: 'desc' }],
      include: {
        applyingForLevel: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      applicant: [a.firstName, a.surname].filter(Boolean).join(' '),
      note: a.note ?? '',
      applyingFor: [a.applyingForLevel.name, a.branch?.name].filter(Boolean).join(' · '),
      type: ADMISSION_TYPE_LABEL[a.type],
      applied: formatDay(a.appliedOn, { calendar: true }),
      guardian: a.guardianName ?? '',
      stage: STAGE_LABEL[a.stage],
      stageNote: a.stageNote ?? '',
      studentId: a.studentId,
    }));
  }

  /* ---------------- Wizard options ---------------- */

  async options() {
    const { session, term } = await this.records.current();
    const placement = await this.records.placement(session?.id ?? null);
    const byBranch: Record<
      string,
      Record<string, { arm: string; used: number; capacity: number }[]>
    > = {};
    for (const b of placement.branches) byBranch[b.name] = {};
    for (const a of placement.arms)
      (byBranch[a.branchName]![a.levelName] ??= []).push({
        arm: a.name,
        used: a.used,
        capacity: a.capacity,
      });

    const [curriculum, religious, taught] = await Promise.all([
      session
        ? this.db.curriculumEntry.findMany({
            where: { sessionId: session.id, subject: { status: 'ACTIVE' } },
            orderBy: { subject: { name: 'asc' } },
            select: {
              offering: true,
              subject: { select: { id: true, name: true, category: true } },
            },
          })
        : Promise.resolve([]),
      this.db.subject.findMany({
        where: { status: 'ACTIVE', category: 'RELIGIOUS' },
        orderBy: { name: 'asc' },
        select: { code: true, name: true },
      }),
      term
        ? this.db.teachingAssignment.findMany({
            where: { termId: term.id },
            distinct: ['subjectId'],
            select: { subjectId: true },
          })
        : Promise.resolve([]),
    ]);
    const unique = (names: string[]) => [...new Set(names)];
    const electives = curriculum.filter(
      (c) => c.offering === 'ELECTIVE' && c.subject.category !== 'RELIGIOUS',
    );
    const staffed = new Set(taught.map((t) => t.subjectId));

    return {
      session: session?.name ?? '',
      term: term?.name ?? '',
      branches: placement.branches.map((b) => b.name),
      arms: byBranch[placement.branches[0]?.name ?? ''] ?? {},
      armsByBranch: byBranch,
      compulsorySubjects: unique(
        curriculum.filter((c) => c.offering === 'COMPULSORY').map((c) => c.subject.name),
      ),
      religiousSubjects: religious.map((s) => [s.code, s.name] as [string, string]),
      electives: unique(electives.map((c) => c.subject.name)),
      unstaffedElectives: term
        ? unique(electives.filter((c) => !staffed.has(c.subject.id)).map((c) => c.subject.name))
        : [],
      states: [...NIGERIAN_STATES],
      // Fees come from Finance, which isn't on the real API yet: the wizard shows no fee lines.
      feeItems: [] as [string, number][],
      admissionFee: 0,
      siblingDiscount: 0,
      feeLines: {},
      feesReady: false,
      requiredDocuments: REQUIRED_DOCUMENTS.map((d) => ({ ...d })),
    };
  }

  /* ---------------- Matches ---------------- */

  /**
   * Who a new applicant may already be: a student with the same first name and surname
   * (`duplicate`), a guardian with the phone or email given (`guardian`), and a sibling: a child
   * of that guardian, or else a student on roll with the same surname who has a guardian.
   */
  async matches(q: AdmissionMatchesQueryDto) {
    const first = q.firstName?.trim() ?? '';
    const surname = q.surname?.trim() ?? '';
    const insensitive = (v: string) => ({ equals: v, mode: 'insensitive' as const });

    const duplicate =
      first && surname
        ? await this.db.student.findFirst({
            where: {
              deletedAt: null,
              firstName: insensitive(first),
              surname: insensitive(surname),
            },
            orderBy: { admittedOn: 'desc' },
            select: { id: true, firstName: true, surname: true, admissionNo: true },
          })
        : null;

    const phone = q.phone ? toE164(q.phone) : null;
    const email = q.email && EMAIL.test(q.email) ? q.email.toLowerCase() : null;
    const guardianInclude = {
      students: {
        where: { student: { deletedAt: null, status: { in: ON_ROLL } } },
        orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
        select: {
          relationship: true,
          student: { select: { id: true, firstName: true, surname: true } },
        },
      },
    };
    let matchedBy: 'phone' | 'email' = 'phone';
    let guardian = phone
      ? await this.db.guardian.findFirst({
          where: { ...LIVE_GUARDIAN, phone },
          orderBy: { createdAt: 'asc' },
          include: guardianInclude,
        })
      : null;
    if (!guardian && email) {
      matchedBy = 'email';
      guardian = await this.db.guardian.findFirst({
        where: { ...LIVE_GUARDIAN, email: insensitive(email) },
        orderBy: { createdAt: 'asc' },
        include: guardianInclude,
      });
    }

    let sibling: {
      studentId: string;
      studentName: string;
      guardianId: string;
      guardianName: string;
      guardianPhone: string;
      relationship: string;
    } | null = null;
    const child = guardian?.students.find((s) => s.student.id !== duplicate?.id);
    if (guardian && child)
      sibling = {
        studentId: child.student.id,
        studentName: `${child.student.firstName} ${child.student.surname}`,
        guardianId: guardian.id,
        guardianName: guardian.fullName,
        guardianPhone: displayPhone(guardian.phone),
        relationship: child.relationship,
      };
    else if (!duplicate && surname.length > 1) {
      const sib = await this.db.student.findFirst({
        where: {
          deletedAt: null,
          status: { in: ON_ROLL },
          surname: insensitive(surname),
          guardians: { some: { guardian: LIVE_GUARDIAN } },
        },
        orderBy: [{ admittedOn: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          firstName: true,
          surname: true,
          guardians: {
            where: { guardian: LIVE_GUARDIAN },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
            select: {
              relationship: true,
              guardian: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      });
      const link = sib?.guardians[0];
      if (sib && link)
        sibling = {
          studentId: sib.id,
          studentName: `${sib.firstName} ${sib.surname}`,
          guardianId: link.guardian.id,
          guardianName: link.guardian.fullName,
          guardianPhone: displayPhone(link.guardian.phone),
          relationship: link.relationship,
        };
    }

    const classes = await this.records.classNames(
      [
        duplicate?.id,
        sibling?.studentId,
        ...(guardian?.students.map((s) => s.student.id) ?? []),
      ].filter((id): id is string => !!id),
    );
    return {
      duplicate: duplicate
        ? {
            id: duplicate.id,
            name: `${duplicate.firstName} ${duplicate.surname}`,
            className: classes.get(duplicate.id) ?? '',
            admissionNo: duplicate.admissionNo,
          }
        : null,
      sibling: sibling ? { ...sibling, className: classes.get(sibling.studentId) ?? '' } : null,
      guardian: guardian
        ? {
            id: guardian.id,
            name: guardian.fullName,
            phone: displayPhone(guardian.phone),
            email: guardian.email ?? '',
            matchedBy,
            children: guardian.students.map((s) => {
              const cls = classes.get(s.student.id);
              return `${s.student.firstName} ${s.student.surname}${cls ? ` (${cls})` : ''}`;
            }),
          }
        : null,
    };
  }

  /* ---------------- Admit ---------------- */

  async admit(dto: AdmitDto) {
    const schoolId = this.records.schoolId();
    const today = this.records.today();

    const birth = parseDay(dto.dateOfBirth);
    if (!birth) throw unprocessable('Enter a real date of birth.', 'VALIDATION', 'dateOfBirth');
    const birthIssue = birthProblem(birth, today);
    if (birthIssue) throw unprocessable(birthIssue, 'VALIDATION', 'dateOfBirth');
    const admittedOn = dto.admissionDate ? parseDay(dto.admissionDate) : today;
    if (!admittedOn)
      throw unprocessable('Enter a real admission date.', 'VALIDATION', 'admissionDate');

    if (!dto.documents.birth)
      throw unprocessable(
        'Birth certificate is required by your school settings.',
        'VALIDATION',
        'documents.birth',
      );
    if (dto.admissionType === 'Transfer in' && !dto.documents.report)
      throw unprocessable(
        'Transfer-in students need their previous school report.',
        'VALIDATION',
        'documents.report',
      );

    const application = dto.applicationId ? await this.findApplication(dto.applicationId) : null;
    const guardian = await this.chooseGuardian(dto);

    const session = await this.records.requireSession();
    const placement = await this.records.placement(session.id);
    const branch = placement.branches.find((b) => normalise(b.name) === normalise(dto.branch));
    if (!branch) throw unprocessable('Choose a branch.', 'VALIDATION', 'branch');
    const arm = placement.arms.find(
      (a) =>
        a.branchId === branch.id &&
        normalise(a.levelName) === normalise(dto.level) &&
        normalise(a.name) === normalise(dto.arm),
    );
    if (!arm) throw unprocessable('Choose a class arm.', 'VALIDATION', 'arm');

    const twin = await this.db.student.findFirst({
      where: {
        deletedAt: null,
        status: { in: ON_ROLL },
        dateOfBirth: birth,
        firstName: { equals: dto.firstName, mode: 'insensitive' },
        surname: { equals: dto.surname, mode: 'insensitive' },
      },
      select: { firstName: true, surname: true, admissionNo: true },
    });
    if (twin)
      throw AppException.conflict(
        `${twin.firstName} ${twin.surname} (born ${ddmmyyyy(birth)}) is already a student here ` +
          `(${twin.admissionNo}). Open their profile instead of admitting them again.`,
        'DUPLICATE_STUDENT',
      );

    const name = `${dto.firstName} ${dto.surname}`;
    const result = await this.db.$transaction(async (tx) => {
      await this.records.lockArms(tx, [arm.id]);
      const used = await this.records.armUsage(tx, session.id, arm.id);
      if (used >= arm.capacity) throw armFull(arm, used);
      const admissionNo = await (await this.records.numberAllocator(tx))(branch.code);

      let guardianRow: { id: string; fullName: string } | null = guardian.existing;
      if (guardian.create) {
        guardianRow = await tx.guardian.create({
          data: {
            schoolId,
            ...guardian.create,
            contactConsentAt: this.clock.now(),
            contactConsentSource: 'admission_form',
          },
          select: { id: true, fullName: true },
        });
        await this.audit.record(
          {
            action: 'guardian.create',
            area: 'Students',
            entity: 'Guardian',
            entityId: guardianRow.id,
            summary: `${guardianRow.fullName} added as a guardian`,
            detail: `At the admission of ${name}`,
          },
          asAuditDb(tx),
        );
      }

      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNo,
          firstName: dto.firstName,
          surname: dto.surname,
          otherNames: dto.otherNames || null,
          gender: GENDER_OF[dto.gender],
          dateOfBirth: birth,
          stateOfOrigin: dto.stateOfOrigin
            ? (stateOf(dto.stateOfOrigin) ?? dto.stateOfOrigin)
            : null,
          previousSchool: dto.previousSchool || null,
          status: guardianRow ? 'ACTIVE' : 'INCOMPLETE_PROFILE',
          admissionType: ADMISSION_TYPE_OF[dto.admissionType],
          admittedOn,
          admittedLevelId: arm.levelId,
          branchId: branch.id,
        },
        select: { id: true },
      });
      if (guardianRow)
        await tx.studentGuardian.create({
          data: {
            schoolId,
            studentId: student.id,
            guardianId: guardianRow.id,
            relationship: dto.relationship || 'Guardian',
            isPrimary: true,
            paysFees: dto.paysFees ?? true,
          },
        });
      await tx.enrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          sessionId: session.id,
          branchId: branch.id,
          levelId: arm.levelId,
          armId: arm.id,
          enrolledOn: admittedOn,
        },
      });

      // Religious studies and the elective, when Academics has those subjects.
      const picks = await tx.subject.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            ...(dto.religious
              ? [
                  {
                    category: 'RELIGIOUS' as const,
                    code: { equals: dto.religious, mode: 'insensitive' as const },
                  },
                ]
              : []),
            ...(dto.elective
              ? [{ name: { equals: dto.elective, mode: 'insensitive' as const } }]
              : []),
          ],
        },
        select: { id: true },
      });
      if (picks.length && (dto.religious || dto.elective))
        await tx.studentSubject.createMany({
          data: picks.map((s) => ({
            schoolId,
            studentId: student.id,
            sessionId: session.id,
            subjectId: s.id,
            startedOn: admittedOn,
          })),
          skipDuplicates: true,
        });

      if (application) {
        const moved = await tx.admissionApplication.updateMany({
          where: { id: application.id, studentId: null, stage: { not: 'ADMITTED' } },
          data: { stage: 'ADMITTED', stageNote: 'Now an active student', studentId: student.id },
        });
        if (!moved.count) throw alreadyAdmitted();
      }

      await this.audit.record(
        {
          action: 'student.admit',
          area: 'Students',
          entity: 'Student',
          entityId: student.id,
          summary: `Admitted to ${arm.label}`,
          detail: [
            `${dto.admissionType} · ${admissionNo} · ${branch.name}`,
            guardianRow ? `Guardian: ${guardianRow.fullName}` : 'No guardian yet',
          ].join(' · '),
          after: {
            admissionNo,
            class: arm.label,
            session: session.name,
            guardianId: guardianRow?.id ?? null,
            applicationId: application?.id ?? null,
          },
        },
        asAuditDb(tx),
      );
      return {
        studentId: student.id,
        name,
        admissionNo,
        className: arm.label,
        branch: branch.name,
        guardianName: guardianRow?.fullName ?? null,
        invited: false,
        invoiceTotal: 0,
      };
    });
    return withNotice(result, `${name} admitted to ${arm.label} as ${result.admissionNo}.`);
  }

  private async findApplication(id: string) {
    const application = isUuid(id)
      ? await this.db.admissionApplication.findUnique({
          where: { id },
          select: { id: true, stage: true, studentId: true },
        })
      : null;
    if (!application)
      throw AppException.notFound('This application doesn’t exist.', 'APPLICATION_NOT_FOUND');
    if (application.stage === 'ADMITTED' || application.studentId) throw alreadyAdmitted();
    if (application.stage === 'REJECTED')
      throw AppException.conflict(
        'This application was rejected, so the applicant can’t be admitted from it.',
        'APPLICATION_REJECTED',
      );
    return application;
  }

  /**
   * The guardian for the admission: an existing one (linked, or a new entry whose phone and name
   * match a guardian already here), one to create, or none.
   */
  private async chooseGuardian(dto: AdmitDto): Promise<{
    existing: { id: string; fullName: string } | null;
    create: { fullName: string; phone: string; email: string | null } | null;
  }> {
    const g = dto.guardian;
    if (g.mode === 'skip') return { existing: null, create: null };
    if (g.mode === 'link') {
      let row = isUuid(g.guardianId ?? '')
        ? await this.db.guardian.findFirst({
            where: { id: g.guardianId, deletedAt: null },
            select: { id: true, fullName: true, mergedIntoId: true },
          })
        : null;
      // A merged record stands for the guardian it was merged into.
      if (row?.mergedIntoId)
        row = await this.db.guardian.findFirst({
          where: { id: row.mergedIntoId, deletedAt: null },
          select: { id: true, fullName: true, mergedIntoId: true },
        });
      if (!row)
        throw unprocessable('Choose the guardian to link.', 'VALIDATION', 'guardian.guardianId');
      return { existing: { id: row.id, fullName: row.fullName }, create: null };
    }
    const phone = toE164(g.phone ?? '');
    if (!phone) throw unprocessable(PHONE_MESSAGE, 'VALIDATION', 'guardian.phone');
    const email = g.email ? g.email.toLowerCase() : null;
    if (email && !EMAIL.test(email))
      throw unprocessable('Enter a valid email.', 'VALIDATION', 'guardian.email');
    const same = await this.db.guardian.findFirst({
      where: { ...LIVE_GUARDIAN, phone },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fullName: true },
    });
    if (same) {
      // The same person typed in again: use their record instead of a duplicate.
      if (bareName(same.fullName) === bareName(g.name)) return { existing: same, create: null };
      throw AppException.conflict(
        `${displayPhone(phone)} belongs to ${same.fullName}, already a guardian here. ` +
          'Link the existing guardian instead.',
        'GUARDIAN_PHONE_TAKEN',
      );
    }
    return { existing: null, create: { fullName: g.name!, phone, email } };
  }
}

const alreadyAdmitted = () =>
  AppException.conflict('This applicant has already been admitted.', 'APPLICATION_ADMITTED');

export const armFull = (arm: ArmPlace, used: number) =>
  AppException.conflict(
    `${arm.label} is at capacity (${used} of ${arm.capacity}). Choose another arm.`,
    'ARM_FULL',
  );
