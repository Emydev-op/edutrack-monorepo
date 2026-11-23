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
  'people',
] as const;
export type AudienceKindLabel = (typeof AUDIENCE_KINDS)[number];

export interface Audience {
  kind: AudienceKindLabel;
  /** Class arm labels ("JSS 2B") when kind is "classes". */
  classes: string[];
  /** null = all branches. */
  branchId: string | null;
  /** Chosen people when kind is "people": "g:<guardianId>", "s:<studentId>", "st:<staffId>". */
  people: string[];
}

/** One person who can be picked for an announcement. */
export interface PersonOption {
  key: string;
  name: string;
  role: 'Parent' | 'Student' | 'Teacher' | 'Staff';
  /** "Parent of Emmanuel Adeyemi", "JSS 2B · STU-2025-0042", "STF-0012". */
  detail: string;
}

const PERSON_KEY = /^(g|s|st):[0-9a-f-]{36}$/i;
const MAX_PEOPLE = 200;

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
    let people: string[] = [];
    if (kind === 'people') {
      people = [...new Set((input.people ?? []).filter((x) => typeof x === 'string'))];
      if (!people.length) throw invalid('audience.people', 'Choose at least one person.');
      if (people.length > MAX_PEOPLE)
        throw invalid('audience.people', `Choose up to ${MAX_PEOPLE} people.`);
      const known = new Set((await this.describe(people)).map((p) => p.key));
      if (people.some((k) => !PERSON_KEY.test(k) || !known.has(k)))
        throw invalid('audience.people', 'Some of the people chosen are no longer at the school.');
      await this.requireSections(kind, []);
    } else if (kind === 'classes') {
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
    return {
      audience: { kind, classes, branchId: kind === 'people' ? null : branchId, people },
      armIds,
    };
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
    if (a.kind === 'people')
      return { recipients: await this.peopleRecipients(a.people), noGuardian: 0 };
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

  /* ---------------- Specific people ---------------- */

  private static split(keys: string[]) {
    const ids = (prefix: string) =>
      keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
    return { guardians: ids('g'), students: ids('s'), staff: ids('st') };
  }

  /** Each on-roll child's name and class this session, by student id. */
  private async childInfo(studentIds: string[]) {
    if (!studentIds.length) return new Map<string, { name: string; class: string | null }>();
    const sessionId = await this.sessionId();
    const students = await this.db.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        firstName: true,
        surname: true,
        enrollments: {
          where: { ...(sessionId && { sessionId }), status: 'ACTIVE' },
          take: 1,
          select: { level: { select: { name: true } }, arm: { select: { name: true } } },
        },
      },
    });
    return new Map(
      students.map((s) => {
        const e = s.enrollments[0];
        return [
          s.id,
          {
            name: `${s.firstName} ${s.surname}`,
            class: e ? (e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name) : null,
          },
        ];
      }),
    );
  }

  private guardianSelect = {
    id: true,
    title: true,
    fullName: true,
    email: true,
    phone: true,
    membership: { select: { userId: true, status: true } },
    students: {
      where: { student: { status: { in: ON_ROLL }, deletedAt: null } },
      select: { studentId: true },
    },
  } as const;

  private staffSelect = {
    id: true,
    title: true,
    firstName: true,
    lastName: true,
    kind: true,
    staffNumber: true,
    email: true,
    phone: true,
    membership: { select: { userId: true, status: true, user: { select: { email: true } } } },
  } as const;

  private studentSelect = {
    id: true,
    firstName: true,
    surname: true,
    admissionNo: true,
    membership: { select: { userId: true, status: true } },
  } as const;

  /** People whose name (or email, phone, admission or staff number) matches, up to 8 of each kind. */
  async search(q: string): Promise<PersonOption[]> {
    const text = q.trim();
    if (text.length < 2) return [];
    const like = { contains: text, mode: 'insensitive' as const };
    const words = text.split(/\s+/).filter(Boolean);
    const [guardians, students, staff] = await Promise.all([
      this.db.guardian.findMany({
        where: {
          deletedAt: null,
          mergedIntoId: null,
          OR: [{ fullName: like }, { email: like }, { phone: like }],
        },
        select: this.guardianSelect,
        orderBy: { fullName: 'asc' },
        take: 8,
      }),
      this.db.student.findMany({
        where: {
          status: { in: ON_ROLL },
          deletedAt: null,
          OR: [
            { admissionNo: like },
            {
              AND: words.map((w) => ({
                OR: [
                  { firstName: { contains: w, mode: 'insensitive' as const } },
                  { surname: { contains: w, mode: 'insensitive' as const } },
                ],
              })),
            },
          ],
        },
        select: this.studentSelect,
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
        take: 8,
      }),
      this.db.staff.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { staffNumber: like },
            { email: like },
            {
              AND: words.map((w) => ({
                OR: [
                  { firstName: { contains: w, mode: 'insensitive' as const } },
                  { lastName: { contains: w, mode: 'insensitive' as const } },
                ],
              })),
            },
          ],
        },
        select: this.staffSelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 8,
      }),
    ]);
    return this.options(guardians, students, staff);
  }

  /** The people behind these keys (people no longer at the school are left out). */
  async describe(keys: string[]): Promise<PersonOption[]> {
    const ids = CommsAudienceService.split(keys);
    const valid = (xs: string[]) => xs.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    const [guardians, students, staff] = await Promise.all([
      ids.guardians.length
        ? this.db.guardian.findMany({
            where: { id: { in: valid(ids.guardians) }, deletedAt: null, mergedIntoId: null },
            select: this.guardianSelect,
          })
        : [],
      ids.students.length
        ? this.db.student.findMany({
            where: { id: { in: valid(ids.students) }, status: { in: ON_ROLL }, deletedAt: null },
            select: this.studentSelect,
          })
        : [],
      ids.staff.length
        ? this.db.staff.findMany({
            where: { id: { in: valid(ids.staff) }, status: 'ACTIVE' },
            select: this.staffSelect,
          })
        : [],
    ]);
    const found = await this.options(guardians, students, staff);
    const order = new Map(keys.map((k, i) => [k, i]));
    return found.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  }

  private async options(
    guardians: {
      id: string;
      title: string | null;
      fullName: string;
      students: { studentId: string }[];
    }[],
    students: { id: string; firstName: string; surname: string; admissionNo: string }[],
    staff: {
      id: string;
      title: string | null;
      firstName: string;
      lastName: string;
      kind: string;
      staffNumber: string;
    }[],
  ): Promise<PersonOption[]> {
    const info = await this.childInfo([
      ...new Set([
        ...guardians.flatMap((g) => g.students.map((x) => x.studentId)),
        ...students.map((s) => s.id),
      ]),
    ]);
    return [
      ...guardians.map((g) => {
        const kids = g.students.map((x) => info.get(x.studentId)?.name).filter(Boolean) as string[];
        return {
          key: `g:${g.id}`,
          name: guardianName(g),
          role: 'Parent' as const,
          detail: kids.length ? `Parent of ${joined(kids)}` : 'Parent · no child on roll',
        };
      }),
      ...students.map((s) => ({
        key: `s:${s.id}`,
        name: `${s.firstName} ${s.surname}`,
        role: 'Student' as const,
        detail: [info.get(s.id)?.class, s.admissionNo].filter(Boolean).join(' · '),
      })),
      ...staff.map((s) => ({
        key: `st:${s.id}`,
        name: staffName(s),
        role: s.kind === 'TEACHING' ? ('Teacher' as const) : ('Staff' as const),
        detail: s.staffNumber,
      })),
    ];
  }

  /** The chosen people as recipients, with the same contact rules as the other audiences. */
  private async peopleRecipients(keys: string[]): Promise<CommsRecipient[]> {
    const ids = CommsAudienceService.split(keys);
    const [guardians, students, staff] = await Promise.all([
      this.db.guardian.findMany({
        where: { id: { in: ids.guardians }, deletedAt: null, mergedIntoId: null },
        select: this.guardianSelect,
      }),
      this.db.student.findMany({
        where: { id: { in: ids.students }, status: { in: ON_ROLL }, deletedAt: null },
        select: this.studentSelect,
      }),
      this.db.staff.findMany({
        where: { id: { in: ids.staff }, status: 'ACTIVE' },
        select: this.staffSelect,
      }),
    ]);
    const info = await this.childInfo(guardians.flatMap((g) => g.students.map((x) => x.studentId)));
    return [
      ...guardians.map((g) => ({
        key: `g:${g.id}`,
        role: 'PARENT' as const,
        name: guardianName(g),
        userId: g.membership?.status === 'ACTIVE' ? g.membership.userId : null,
        guardianId: g.id,
        email: g.email,
        phone: g.phone,
        vars: {
          parent_name: guardianName(g),
          student_name: joined(
            g.students.map((x) => info.get(x.studentId)?.name).filter(Boolean) as string[],
          ),
        },
      })),
      ...students.map((s) => ({
        key: `s:${s.id}`,
        role: 'STUDENT' as const,
        name: `${s.firstName} ${s.surname}`,
        userId: s.membership?.status === 'ACTIVE' ? s.membership.userId : null,
        studentId: s.id,
        email: null,
        phone: null,
        vars: { student_name: `${s.firstName} ${s.surname}` },
      })),
      ...staff.map((s) => ({
        key: `st:${s.id}`,
        role: s.kind === 'TEACHING' ? ('TEACHER' as const) : ('STAFF' as const),
        name: staffName(s),
        userId: s.membership?.status === 'ACTIVE' ? s.membership.userId : null,
        staffId: s.id,
        email: s.email ?? s.membership?.user.email ?? null,
        phone: s.phone,
        vars: { staff_name: staffName(s) },
      })),
    ];
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
    case 'people':
      return a.people.length === 1 ? '1 person' : `${a.people.length} people`;
    default:
      return a.classes.length <= 3
        ? `Parents & students · ${a.classes.join(', ')}`
        : `Parents & students · ${a.classes.length} classes`;
  }
}
