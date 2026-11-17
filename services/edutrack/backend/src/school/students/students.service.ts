import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated } from '../../common/pagination/pagination.js';
import { lagosToday } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import type { EnrollmentOptionsQueryDto, StudentQueryDto } from './dto/students.dto.js';
import { MemberPermissions } from './member-permissions.js';
import {
  ADMISSION_TYPE_LABEL,
  ageOn,
  armLabel,
  classOf,
  currentEnrollment,
  day,
  enrollmentRow,
  EXIT_KIND_LABEL,
  guardianName,
  ON_ROLL,
  phoneOf,
  studentInclude,
  studentName,
  toRow,
  type StudentWithLinks,
} from './student-view.js';

export const STUDENT_NOT_FOUND = 'This student doesn’t exist';

/** The documents School Admin lists on every student (others on file follow them). */
const STANDARD_DOCUMENTS: { key: string; name: string }[] = [
  { key: 'birth_certificate', name: 'Birth certificate' },
  { key: 'passport_photo', name: 'Passport photograph' },
  { key: 'previous_school_report', name: 'Previous school report' },
  { key: 'medical_form', name: 'Medical form' },
  { key: 'transfer_letter', name: 'Transfer letter' },
];
const DOC_STATUS = {
  VERIFIED: 'Verified',
  PENDING: 'Pending',
  MISSING: 'Missing',
  OPTIONAL: 'Optional',
} as const;

const kb = (bytes: bigint) => {
  const n = Number(bytes);
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const fileKind = (mime: string) =>
  mime === 'application/pdf'
    ? 'PDF'
    : mime === 'image/png'
      ? 'PNG'
      : mime === 'image/jpeg'
        ? 'JPG'
        : 'File';

/**
 * Student records: the list (filters, search, paging), the student page, enrollment options and
 * the Setup Center's Students step. Writes are in `StudentMovesService`. Contract:
 * `school-admin/src/api/mock/handlers/students.ts`.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly permissions: MemberPermissions,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.tenant.db;
  }

  schoolId(): string {
    const id = RequestContext.schoolId();
    if (!id) throw AppException.forbidden('This needs a school session.', 'NO_TENANT');
    return id;
  }

  today(): Date {
    return lagosToday(this.clock.now());
  }

  /** The session students are enrolled for: the Active one, else the next Upcoming one. */
  async currentSession() {
    const include = { terms: { orderBy: { sequence: 'asc' as const } } };
    return (
      (await this.db.academicSession.findFirst({ where: { status: 'ACTIVE' }, include })) ??
      (await this.db.academicSession.findFirst({
        where: { status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
        include,
      }))
    );
  }

  async find(id: string): Promise<StudentWithLinks> {
    const s = isUuid(id)
      ? await this.db.student.findFirst({ where: { id, deletedAt: null }, include: studentInclude })
      : null;
    if (!s) throw AppException.notFound(STUDENT_NOT_FOUND, 'STUDENT_NOT_FOUND');
    return s;
  }

  /** Naira owed per student on issued invoices. */
  async balances(studentIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.db.invoice.groupBy({
      by: ['studentId'],
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        ...(studentIds && { studentId: { in: studentIds } }),
      },
      _sum: { totalKobo: true, paidKobo: true },
    });
    return new Map(
      rows.map((r) => [
        r.studentId,
        Number(((r._sum.totalKobo ?? 0n) - (r._sum.paidKobo ?? 0n)) / 100n),
      ]),
    );
  }

  /** A student as a list row (what writes answer with). */
  async row(id: string) {
    const [s, session, balances] = await Promise.all([
      this.find(id),
      this.currentSession(),
      this.balances([id]),
    ]);
    return toRow(s, {
      sessionId: session?.id ?? null,
      today: this.today(),
      balance: balances.get(id) ?? 0,
    });
  }

  /* ---------------- List ---------------- */

  async list(query: StudentQueryDto) {
    const [students, session, balances] = await Promise.all([
      this.db.student.findMany({
        where: { deletedAt: null },
        include: studentInclude,
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }, { admissionNo: 'asc' }],
      }),
      this.currentSession(),
      this.balances(),
    ]);
    const ctx = { sessionId: session?.id ?? null, today: this.today() };
    const search = query.search?.trim().toLowerCase();
    const rows = students
      .map((s) => toRow(s, { ...ctx, balance: balances.get(s.id) ?? 0 }))
      .filter(
        (r) =>
          (!query.status || r.status === query.status) &&
          (!query.className || r.className.startsWith(query.className)) &&
          (!query.gender || r.gender === query.gender) &&
          (!search ||
            `${r.name} ${r.admissionNo} ${r.guardianName ?? ''}`.toLowerCase().includes(search)),
      );
    const start = (query.page - 1) * query.pageSize;
    return paginated(rows.slice(start, start + query.pageSize), rows.length, query);
  }

  /* ---------------- Student page ---------------- */

  async detail(id: string) {
    const s = await this.find(id);
    const today = this.today();
    const [session, balances, granted, extra, history] = await Promise.all([
      this.currentSession(),
      this.balances([s.id]),
      this.permissions.granted(),
      this.db.student.findUniqueOrThrow({
        where: { id: s.id },
        select: {
          admittedLevel: { select: { name: true } },
          documents: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: { file: { select: { mimeType: true, sizeBytes: true, deletedAt: true } } },
          },
          guardians: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            include: {
              guardian: {
                include: {
                  membership: { select: { status: true } },
                  students: {
                    where: { studentId: { not: s.id } },
                    orderBy: { createdAt: 'asc' },
                    include: { student: { include: studentInclude } },
                  },
                },
              },
            },
          },
        },
      }),
      this.audit.history('Student', s.id),
    ]);
    const sessionId = session?.id ?? null;
    const term = session?.terms.find((t) => t.status === 'ACTIVE') ?? session?.terms[0] ?? null;
    const row = toRow(s, { sessionId, today, balance: balances.get(s.id) ?? 0 });
    const current = currentEnrollment(s, sessionId);
    const placed = !!current?.arm && current.sessionId === sessionId && current.status === 'ACTIVE';
    const classTeacher =
      placed && current?.armId
        ? await this.db.classTeacherAssignment.findFirst({
            where: { sessionId: sessionId!, armId: current.armId, endsOn: null },
            orderBy: { startsOn: 'desc' },
            select: { staff: { select: { title: true, firstName: true, lastName: true } } },
          })
        : null;
    const first = [...s.enrollments].sort(
      (a, b) => a.session.startsOn.getTime() - b.session.startsOn.getTime(),
    )[0];
    const ordered = [...s.enrollments].sort(
      (a, b) => b.session.startsOn.getTime() - a.session.startsOn.getTime(),
    );
    const docs = extra.documents;
    const docRow = (
      name: string,
      required: string,
      d: (typeof docs)[number] | undefined,
      none: string,
    ) => ({
      name,
      required,
      uploaded:
        d && d.status !== 'MISSING'
          ? [
              day(d.createdAt),
              ...(d.file && !d.file.deletedAt
                ? [`${fileKind(d.file.mimeType)} · ${kb(d.file.sizeBytes)}`]
                : []),
            ].join(' · ')
          : '—',
      status: d ? DOC_STATUS[d.status] : none,
    });
    const transfer = s.admissionType === 'TRANSFER_IN';
    const required: Record<string, string> = {
      birth_certificate: 'Yes',
      passport_photo: 'Yes',
      previous_school_report: transfer ? 'Yes (transfer)' : 'Yes (new intake)',
      medical_form: 'Yes',
      transfer_letter: 'Only for transfers',
    };
    return {
      ...row,
      firstName: s.firstName,
      surname: s.surname,
      otherNames: s.otherNames ?? '',
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString().slice(0, 10) : '',
      age: ageOn(s.dateOfBirth, today),
      stateOfOrigin: s.stateOfOrigin ?? '',
      address: s.address ?? '',
      // Sensitive: only for members who can edit student records.
      medicalNotes: granted.has('students.edit') ? (s.medicalNotes ?? '') : null,
      admittedOn: day(s.admittedOn),
      admissionType: ADMISSION_TYPE_LABEL[s.admissionType],
      admittedInto: first
        ? `${first.session.name} · ${first.arm ? armLabel(first.level.name, first.arm.name) : first.level.name}`
        : (extra.admittedLevel?.name ?? ''),
      previousSchool: s.previousSchool ?? '',
      section: current?.level.section.name ?? '',
      classTeacher: classTeacher
        ? [classTeacher.staff.title, classTeacher.staff.firstName, classTeacher.staff.lastName]
            .filter(Boolean)
            .join(' ')
        : 'Not assigned',
      enrolledSince: placed ? day(current.enrolledOn) : '',
      termResults: placed ? 'Results pending' : 'Not enrolled yet',
      assignments: '—',
      enrollments: ordered.map((e) =>
        enrollmentRow(e, s, e.sessionId === sessionId ? (term?.name ?? null) : null),
      ),
      results: [] as { session: string; terms: [string, string][] }[],
      subjects: [] as { name: string; type: string; teacher: string; since: string }[],
      invoices: [] as unknown[],
      payments: [] as unknown[],
      financeKey: s.id,
      credit: 0,
      guardians: extra.guardians.map((link) => {
        const g = link.guardian;
        const status = g.membership?.status;
        return {
          guardianId: g.id,
          name: guardianName(g),
          relationship: link.relationship,
          primary: link.isPrimary,
          phone: phoneOf(g.phone),
          email: g.email ?? '',
          paysFees: link.paysFees,
          portal:
            status === 'ACTIVE'
              ? 'Active'
              : status === 'INVITED'
                ? 'Invited'
                : status === 'SUSPENDED'
                  ? 'Suspended'
                  : 'No account · receives SMS only',
          otherChildren: g.students
            .filter((x) => !x.student.deletedAt)
            .map((x) => {
              const cls = classOf(currentEnrollment(x.student, sessionId));
              return `${studentName(x.student)}${cls ? ` · ${cls}` : ''}`;
            }),
        };
      }),
      documents: [
        ...STANDARD_DOCUMENTS.map(({ key, name }) =>
          docRow(
            name,
            required[key]!,
            docs.find((d) => d.key === key),
            key === 'transfer_letter' ? 'Optional' : 'Missing',
          ),
        ),
        ...docs
          .filter((d) => !STANDARD_DOCUMENTS.some((x) => x.key === d.key))
          .map((d) => docRow(d.label, 'Optional', d, 'Optional')),
      ],
      activity: history.map((h) => ({
        id: h.id,
        title: h.title,
        detail: h.detail,
        when: day(new Date(h.at)),
      })),
      exit: s.exitKind
        ? {
            kind: EXIT_KIND_LABEL[s.exitKind],
            date: s.exitOn ? day(s.exitOn) : '',
            reason: s.exitReason ?? '',
            destination: s.exitDestination ?? '',
          }
        : null,
    };
  }

  /* ---------------- Enrollment options ---------------- */

  /** Branches students can be placed at, oldest first (lists are ordered explicitly). */
  activeBranches() {
    return this.db.branch.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  /** Places used per arm this session (students on the roll placed in it). */
  async armUsage(sessionId: string, armIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.db.enrollment.groupBy({
      by: ['armId'],
      where: {
        sessionId,
        status: 'ACTIVE',
        armId: armIds ? { in: armIds } : { not: null },
        student: { status: { in: ON_ROLL }, deletedAt: null },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.armId!, r._count._all]));
  }

  async enrollmentOptions(query: EnrollmentOptionsQueryDto) {
    const [session, branches] = await Promise.all([this.currentSession(), this.activeBranches()]);
    const branch = query.branch
      ? branches.find((b) => b.id === query.branch)
      : (branches[0] ?? null);
    if (query.branch && !branch)
      throw AppException.notFound('This branch doesn’t exist', 'BRANCH_NOT_FOUND');
    if (!session || !branch)
      return {
        session: session?.name ?? '',
        branch: branch ?? null,
        branches,
        sections: [],
        awaiting: [],
      };
    const [levels, usage, awaiting] = await Promise.all([
      this.db.classLevel.findMany({
        where: { branchLevels: { some: { branchId: branch.id } } },
        orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          section: { select: { name: true } },
          arms: {
            where: { branchId: branch.id, archivedAt: null },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, capacity: true },
          },
        },
      }),
      this.armUsage(session.id),
      this.db.enrollment.findMany({
        where: {
          sessionId: session.id,
          branchId: branch.id,
          status: 'ACTIVE',
          armId: null,
          student: { status: 'ACTIVE', deletedAt: null },
        },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
        include: {
          student: { select: { id: true, firstName: true, surname: true, admissionNo: true } },
          level: { select: { name: true } },
        },
      }),
    ]);
    const sections = new Map<
      string,
      { level: string; arms: { arm: string; used: number; capacity: number }[] }[]
    >();
    for (const l of levels) {
      if (!l.arms.length) continue;
      const list = sections.get(l.section.name) ?? [];
      list.push({
        level: l.name,
        arms: l.arms.map((a) => ({
          arm: a.name,
          used: usage.get(a.id) ?? 0,
          capacity: a.capacity,
        })),
      });
      sections.set(l.section.name, list);
    }
    return {
      session: session.name,
      branch,
      branches,
      sections: [...sections].map(([name, list]) => ({ name, levels: list })),
      awaiting: awaiting.map((e) => ({
        id: e.student.id,
        name: studentName(e.student),
        admissionNo: e.student.admissionNo,
        level: e.level.name,
      })),
    };
  }

  /* ---------------- Setup Center ---------------- */

  /** Students placed in an arm this session, for the Setup Center's Students step. */
  async enrolledThisSession(): Promise<{
    session: string | null;
    enrolled: number;
    onRoll: number;
  }> {
    const session = await this.currentSession();
    const [enrolled, onRoll] = await Promise.all([
      session
        ? this.db.enrollment.count({
            where: {
              sessionId: session.id,
              status: 'ACTIVE',
              armId: { not: null },
              student: { status: { in: ON_ROLL }, deletedAt: null },
            },
          })
        : 0,
      this.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
    ]);
    return { session: session?.name ?? null, enrolled, onRoll };
  }
}
