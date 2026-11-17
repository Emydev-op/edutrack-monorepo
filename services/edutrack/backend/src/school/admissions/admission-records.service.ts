import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import { lagosToday } from '../../platform/shared/format.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type { Db, Tx } from '../staff/staff-records.service.js';
import { armLabel } from '../staff/staff-view.js';
import { admissionNoMatcher, admissionScope, formatAdmissionNo } from './admissions-view.js';

/** An arm a student can be placed in this session, with its places. */
export interface ArmPlace {
  id: string;
  name: string;
  label: string;
  levelId: string;
  levelName: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  capacity: number;
  used: number;
}

export interface Placement {
  branches: { id: string; name: string; code: string }[];
  levels: { id: string; name: string }[];
  arms: ArmPlace[];
}

export const NO_SESSION =
  'Start the current session in Academics › Sessions before admitting students.';

/**
 * What admissions and the student import share: the current session, where students can be
 * placed (arms and their places), admission numbers, and locking arms while places are taken.
 */
@Injectable()
export class AdmissionRecordsService {
  constructor(
    private readonly tenant: TenantPrismaService,
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

  /** The active session and its active term (nulls before Academics is set up). */
  async current(db: Db = this.db) {
    const session = await db.academicSession.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startsOn: 'desc' },
      select: { id: true, name: true },
    });
    const term = session
      ? await db.term.findFirst({
          where: { sessionId: session.id, status: 'ACTIVE' },
          orderBy: { sequence: 'asc' },
          select: { id: true, name: true },
        })
      : null;
    return { session, term };
  }

  async requireSession(db: Db = this.db) {
    const { session } = await this.current(db);
    if (!session) throw AppException.conflict(NO_SESSION, 'NO_SESSION');
    return session;
  }

  /**
   * Active branches, class levels (in section order) and the open arms at each branch with the
   * places this session's active enrollments use.
   */
  async placement(sessionId: string | null, db: Db = this.db): Promise<Placement> {
    const [branches, arms, usage] = await Promise.all([
      db.branch.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      db.classArm.findMany({
        where: { archivedAt: null, branch: { status: 'ACTIVE' } },
        orderBy: [
          { level: { section: { sortOrder: 'asc' } } },
          { level: { sortOrder: 'asc' } },
          { name: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          capacity: true,
          branchId: true,
          level: { select: { id: true, name: true } },
        },
      }),
      sessionId
        ? db.enrollment.groupBy({
            by: ['armId'],
            where: { sessionId, status: 'ACTIVE', armId: { not: null } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const used = new Map(usage.map((u) => [u.armId, u._count._all]));
    const levels = new Map<string, { id: string; name: string }>();
    const places: ArmPlace[] = [];
    for (const a of arms) {
      const branch = branches.find((b) => b.id === a.branchId);
      if (!branch) continue;
      levels.set(a.level.id, a.level);
      places.push({
        id: a.id,
        name: a.name,
        label: armLabel(a.level.name, a.name),
        levelId: a.level.id,
        levelName: a.level.name,
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        capacity: a.capacity,
        used: used.get(a.id) ?? 0,
      });
    }
    return { branches, levels: [...levels.values()], arms: places };
  }

  /**
   * Locks arms until the transaction ends, so two admissions can't both take the last place.
   * Raw SQL is never tenant-scoped: school_id is filtered here.
   */
  async lockArms(tx: Tx, armIds: string[]): Promise<void> {
    const ids = [...new Set(armIds)].sort();
    if (!ids.length) return;
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM class_arms
       WHERE school_id = ${this.schoolId()}::uuid
         AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
       ORDER BY id
         FOR UPDATE`);
  }

  /** Places an arm's active enrollments use this session (read inside the locking transaction). */
  armUsage(tx: Tx, sessionId: string, armId: string) {
    return tx.enrollment.count({ where: { sessionId, armId, status: 'ACTIVE' } });
  }

  /**
   * Hands out admission numbers in the school's format (Settings › Numbering), e.g.
   * `STU-[YYYY]-[####]` → `STU-2026-1249`. The counter (`NumberSequence`, kind ADMISSION) is
   * yearly when the format shows the year and per branch when it shows `[BR]`; it never goes
   * below the highest number already used in that scope, and skips numbers typed in by hand.
   */
  async numberAllocator(tx: Tx): Promise<(branchCode: string) => Promise<string>> {
    const schoolId = this.schoolId();
    const settings = await tx.schoolSettings.findUnique({
      where: { schoolId },
      select: { admissionNumberPattern: true },
    });
    const pattern = settings?.admissionNumberPattern || 'STU-[YYYY]-[####]';
    const year = this.today().getUTCFullYear();
    const used = new Set(
      (await tx.student.findMany({ select: { admissionNo: true } })).map((s) => s.admissionNo),
    );
    const floors = new Map<string, number>();
    return async (branchCode: string) => {
      const scope = admissionScope(pattern, year, branchCode);
      let floor = floors.get(scope);
      if (floor === undefined) {
        const matcher = admissionNoMatcher(pattern, year, branchCode);
        let max = 0;
        for (const n of used) {
          const m = matcher.exec(n);
          if (m) max = Math.max(max, Number(m[1]));
        }
        floor = max + 1;
        floors.set(scope, floor);
        await tx.numberSequence.upsert({
          where: { schoolId_kind_scope: { schoolId, kind: 'ADMISSION', scope } },
          create: { schoolId, kind: 'ADMISSION', scope, nextValue: floor },
          update: {},
        });
      }
      for (let attempt = 0; attempt < 1000; attempt++) {
        // Raw SQL is never tenant-scoped: school_id is filtered here.
        const [row] = await tx.$queryRaw<{ value: number }[]>(Prisma.sql`
          UPDATE number_sequences
             SET next_value = GREATEST(next_value, ${floor}) + 1, updated_at = now()
           WHERE school_id = ${schoolId}::uuid AND kind = 'ADMISSION' AND scope = ${scope}
       RETURNING next_value - 1 AS value`);
        const value = formatAdmissionNo(pattern, Number(row!.value), year, branchCode);
        if (!used.has(value)) {
          used.add(value);
          return value;
        }
      }
      throw AppException.conflict(
        'Admission numbers ran out for this format. Change it in Settings › Numbering.',
        'NUMBERS_EXHAUSTED',
      );
    };
  }

  /** Current class per student ("JSS 1A", or the level while awaiting an arm). */
  async classNames(studentIds: string[], db: Db = this.db): Promise<Map<string, string>> {
    if (!studentIds.length) return new Map();
    const rows = await db.enrollment.findMany({
      where: { studentId: { in: studentIds }, status: 'ACTIVE' },
      orderBy: { enrolledOn: 'desc' },
      select: {
        studentId: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
      },
    });
    const out = new Map<string, string>();
    for (const r of rows)
      if (!out.has(r.studentId))
        out.set(r.studentId, r.arm ? armLabel(r.level.name, r.arm.name) : r.level.name);
    return out;
  }
}
