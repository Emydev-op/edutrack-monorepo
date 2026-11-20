import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { AudienceKind as DbAudienceKind } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel, staffName } from '../academics/academic-format.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { ON_ROLL } from '../students/student-view.js';
import type { CommsRecipient } from './comms-dispatch.service.js';

export const AUDIENCE_KINDS = [
  'everyone',
  'parents',
  'students',
  'teachers',
  'staff',
  'classes',
] as const;
export type AudienceKindLabel = (typeof AUDIENCE_KINDS)[number];

export interface Audience {
  kind: AudienceKindLabel;
  /** Class arm labels ("JSS 2B") when kind is "classes". */
  classes: string[];
  /** null = all branches. */
  branchId: string | null;
}

export interface ClassOption {
  armId: string;
  label: string;
  level: string;
  branchId: string;
  sectionId: string;
  students: number;
}

export const kindToDb = (k: AudienceKindLabel) => k.toUpperCase() as DbAudienceKind;
export const kindFromDb = (k: DbAudienceKind) => k.toLowerCase() as AudienceKindLabel;

const invalid = (field: string, message: string) => AppException.validation({ [field]: message });

/** "Mrs. Funke Adeyemi". */
const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

const joined = (xs: string[]) =>
  xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? '');

/**
 * Who an announcement reaches, from live records: students on roll (by branch, or by class arm
 * this session), their guardians (one message per family), and active staff. In-app goes to
 * those with an active portal account; email and SMS use the contact details on record.
 */
@Injectable()
export class CommsAudienceService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly sections: SectionAccessService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** The Active session, else the earliest Upcoming one. */
  private async sessionId() {
    const s =
      (await this.db.academicSession.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true },
      })) ??
      (await this.db.academicSession.findFirst({
        where: { status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
        select: { id: true },
      }));
    return s?.id ?? null;
  }

  branches() {
    return this.db.branch.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ isOriginal: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
  }

  /** Class arms with students on roll this session. */
  async classOptions(): Promise<ClassOption[]> {
    const sessionId = await this.sessionId();
    if (!sessionId) return [];
    const enrolled = await this.db.enrollment.findMany({
      where: {
        sessionId,
        status: 'ACTIVE',
        armId: { not: null },
        student: { status: { in: ON_ROLL }, deletedAt: null },
      },
      select: { armId: true },
    });
    const counts = new Map<string, number>();
    for (const e of enrolled) counts.set(e.armId!, (counts.get(e.armId!) ?? 0) + 1);
    if (!counts.size) return [];
    const arms = await this.db.classArm.findMany({
      where: { id: { in: [...counts.keys()] } },
      include: { level: { select: { name: true, sectionId: true, sortOrder: true } } },
    });
    return arms
      .sort((a, b) => a.level.sortOrder - b.level.sortOrder || a.name.localeCompare(b.name))
      .map((a) => ({
        armId: a.id,
        label: armLabel(a.level.name, a.name),
        level: a.level.name,
        branchId: a.branchId,
        sectionId: a.level.sectionId,
        students: counts.get(a.id)!,
      }));
  }

  /** "Parents · All branches", "Parents & students · JSS 2B, JSS 2C · Lekki Campus". */
  async label(a: Audience) {
    const branch = a.branchId
      ? ((await this.db.branch.findFirst({ where: { id: a.branchId }, select: { name: true } }))
          ?.name ?? 'Removed branch')
      : 'All branches';
    return `${labelOf(a)} · ${branch}`;
  }

  /**
   * Checks an audience from the screen and finds its class arms. Section admins may only send
   * to classes in their own sections.
   */
  async check(
    input: Partial<Audience> | undefined,
  ): Promise<{ audience: Audience; armIds: string[] }> {
    if (!input || !AUDIENCE_KINDS.includes(input.kind as AudienceKindLabel))
      throw invalid('audience', 'Choose who the announcement is for.');
    const kind = input.kind!;
    const branchId = input.branchId || null;
    if (branchId) {
      const ok = await this.db.branch.findFirst({
        where: { id: branchId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!ok) throw invalid('audience.branchId', 'Choose an active branch, or All branches.');
    }
    let classes: string[] = [];
    let armIds: string[] = [];
    if (kind === 'classes') {
      classes = [...new Set((input.classes ?? []).filter((x) => typeof x === 'string'))];
      if (!classes.length) throw invalid('audience.classes', 'Choose at least one class.');
      const options = (await this.classOptions()).filter(
        (o) => !branchId || o.branchId === branchId,
      );
      const missing = classes.filter((c) => !options.some((o) => o.label === c));
      if (missing.length)
        throw invalid(
          'audience.classes',
          `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no active students in this branch.`,
        );
      const chosen = options.filter((o) => classes.includes(o.label));
      armIds = chosen.map((o) => o.armId);
      await this.requireSections(
        kind,
        chosen.map((o) => o.sectionId),
      );
    } else await this.requireSections(kind, []);
    return { audience: { kind, classes, branchId }, armIds };
  }

  /** 403 for a section admin sending beyond their sections. */
  async requireSections(kind: AudienceKindLabel, sectionIds: string[]) {
    const mine = await this.sections.mine();
    if (!mine) return;
    if (kind !== 'classes')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You manage some sections only, so you can send announcements to classes in your sections. Ask a whole-school admin to message the whole school.',
        'SECTION_FORBIDDEN',
      );
    const outside = sectionIds.filter((id) => !mine.has(id));
    if (outside.length) {
      const names = await this.db.section.findMany({
        where: { id: { in: outside } },
        select: { name: true },
      });
      throw new AppException(
        HttpStatus.FORBIDDEN,
        `You manage other sections, so you can’t send to classes in ${joined(names.map((n) => n.name))}.`,
        'SECTION_FORBIDDEN',
      );
    }
  }

  /** Everyone an audience reaches, and how many students have no guardian linked. */
  async recipients(a: Audience, armIds: string[]) {
    const out: CommsRecipient[] = [];
    const withParents = a.kind === 'everyone' || a.kind === 'parents' || a.kind === 'classes';
    const withStudents = a.kind === 'everyone' || a.kind === 'students' || a.kind === 'classes';
    let noGuardian = 0;
    if (withParents || withStudents) {
      const sessionId = a.kind === 'classes' ? await this.sessionId() : null;
      const students = await this.db.student.findMany({
        where: {
          status: { in: ON_ROLL },
          deletedAt: null,
          ...(a.kind === 'classes'
            ? {
                enrollments: {
                  some: {
                    ...(sessionId && { sessionId }),
                    status: 'ACTIVE',
                    armId: { in: armIds },
                  },
                },
              }
            : a.branchId && { branchId: a.branchId }),
        },
        select: {
          id: true,
          firstName: true,
          surname: true,
          membership: { select: { userId: true, status: true } },
        },
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
      });
      if (withParents) {
        const links = await this.db.studentGuardian.findMany({
          where: {
            studentId: { in: students.map((s) => s.id) },
            guardian: { deletedAt: null, mergedIntoId: null },
          },
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
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        });
        const linked = new Set(links.map((l) => l.studentId));
        noGuardian = students.filter((s) => !linked.has(s.id)).length;
        const byGuardian = new Map<
          string,
          { g: (typeof links)[number]['guardian']; children: string[] }
        >();
        const name = new Map(students.map((s) => [s.id, `${s.firstName} ${s.surname}`]));
        for (const l of links) {
          const cur = byGuardian.get(l.guardianId) ?? { g: l.guardian, children: [] };
          cur.children.push(name.get(l.studentId)!);
          byGuardian.set(l.guardianId, cur);
        }
        for (const { g, children } of byGuardian.values())
          out.push({
            key: `g:${g.id}`,
            role: 'PARENT',
            name: guardianName(g),
            userId: g.membership?.status === 'ACTIVE' ? g.membership.userId : null,
            guardianId: g.id,
            email: g.email,
            phone: g.phone,
            vars: { parent_name: guardianName(g), student_name: joined(children) },
          });
      }
      if (withStudents)
        for (const s of students)
          out.push({
            key: `s:${s.id}`,
            role: 'STUDENT',
            name: `${s.firstName} ${s.surname}`,
            userId: s.membership?.status === 'ACTIVE' ? s.membership.userId : null,
            studentId: s.id,
            email: null,
            phone: null,
            vars: { student_name: `${s.firstName} ${s.surname}` },
          });
    }
    if (a.kind === 'everyone' || a.kind === 'staff' || a.kind === 'teachers') {
      const staff = await this.db.staff.findMany({
        where: {
          status: 'ACTIVE',
          ...(a.kind === 'teachers' && { kind: 'TEACHING' }),
          ...(a.branchId && {
            OR: [{ allBranches: true }, { branches: { some: { branchId: a.branchId } } }],
          }),
        },
        select: {
          id: true,
          title: true,
          firstName: true,
          lastName: true,
          kind: true,
          email: true,
          phone: true,
          membership: { select: { userId: true, status: true, user: { select: { email: true } } } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      for (const s of staff)
        out.push({
          key: `st:${s.id}`,
          role: s.kind === 'TEACHING' ? 'TEACHER' : 'STAFF',
          name: staffName(s),
          userId: s.membership?.status === 'ACTIVE' ? s.membership.userId : null,
          staffId: s.id,
          email: s.email ?? s.membership?.user.email ?? null,
          phone: s.phone,
          vars: { staff_name: staffName(s) },
        });
    }
    return { recipients: out, noGuardian };
  }
}

export function labelOf(a: Audience) {
  switch (a.kind) {
    case 'everyone':
      return 'Entire school';
    case 'parents':
      return 'Parents';
    case 'students':
      return 'Students';
    case 'teachers':
      return 'Teachers';
    case 'staff':
      return 'All staff';
    default:
      return a.classes.length <= 3
        ? `Parents & students · ${a.classes.join(', ')}`
        : `Parents & students · ${a.classes.length} classes`;
  }
}
