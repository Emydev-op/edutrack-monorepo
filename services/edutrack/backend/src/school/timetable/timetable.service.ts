import { HttpStatus, Injectable } from '@nestjs/common';
import type { TimetableStatus } from '../../generated/prisma/enums.js';
import { AcademicCatalogService, type ArmInfo } from '../academics/academic-catalog.service.js';
import { fail, plural, requireOpenTerm, staffName } from '../academics/academic-format.js';
import { DEFAULT_PERIODS, MAX_CONSECUTIVE } from '../curriculum/curriculum-defaults.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { RequestContext } from '../../common/context/request-context.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import {
  DAY_LABEL,
  fromHhmm,
  hhmm,
  parseSlot,
  periodKey,
  slotKey,
  STATUS_LABEL,
} from './timetable-format.js';

type Grid = Record<string, string>;
type PeriodRow = {
  id: string;
  sortOrder: number;
  startsAt: Date;
  endsAt: Date;
  isBreak: boolean;
  label: string;
};

/** The signed-in school (every route here is tenant-scoped). */
const tenantId = () => RequestContext.get()!.schoolId!;

const LOCKED = 'Published timetables are locked. Start a revision to change it.';

/**
 * Academics › Timetable: one manual grid per arm per term, checked as it's saved (no teacher in
 * two classes at once, lessons only in teaching periods, no more lessons than a subject needs,
 * no long runs of one subject), then reviewed, published (the copy the portals read) and revised.
 * Shapes follow the School Admin mock (`/v1/academics/timetable`).
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly audit: SchoolAuditService,
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

  private async requireArm(armId?: string | null) {
    const arm = armId ? await this.catalog.arm(armId) : null;
    if (!arm) throw fail('Class not found', 'ARM_NOT_FOUND', HttpStatus.NOT_FOUND);
    return arm;
  }

  /** A section's bell schedule, created from the default the first time it's needed. */
  async periods(schoolId: string, sectionId: string, db: TenantTx = this.db): Promise<PeriodRow[]> {
    const rows = await db.timetablePeriod.findMany({
      where: { sectionId },
      orderBy: { sortOrder: 'asc' },
    });
    if (rows.length) return rows;
    await db.timetablePeriod.createMany({
      data: DEFAULT_PERIODS.map(([label, start, end, isBreak], i) => ({
        schoolId,
        sectionId,
        label,
        startsAt: fromHhmm(start),
        endsAt: fromHhmm(end),
        isBreak,
        sortOrder: i + 1,
      })),
      skipDuplicates: true,
    });
    return db.timetablePeriod.findMany({ where: { sectionId }, orderBy: { sortOrder: 'asc' } });
  }

  async arms(termId?: string | null, branch?: string | null) {
    const { term } = await this.requireTerm(termId);
    const branchId = await this.catalog.branchIdByName(branch);
    const [arms, timetables] = await Promise.all([
      this.catalog.arms(branchId),
      this.db.timetable.findMany({ where: { termId: term.id } }),
    ]);
    return arms.map((a) => {
      const tt = timetables.find((t) => t.armId === a.id);
      return {
        id: a.id,
        name: a.label,
        branch: a.branch,
        status: tt ? STATUS_LABEL[tt.status] : ('Not started' as const),
      };
    });
  }

  /** What each teacher is doing elsewhere this term, mapped onto this arm's periods by time. */
  private async busy(termId: string, arm: ArmInfo, periods: PeriodRow[]) {
    const slots = await this.db.timetableSlot.findMany({
      where: {
        termId,
        layer: 'DRAFT',
        staffId: { not: null },
        timetable: { armId: { not: arm.id } },
      },
      include: {
        period: true,
        subject: { select: { name: true } },
        timetable: { select: { armId: true } },
      },
    });
    const arms = new Map((await this.catalog.arms()).map((a) => [a.id, a]));
    const out: Record<string, Record<string, string>> = {};
    for (const s of slots) {
      const where = `${arms.get(s.timetable.armId)?.label ?? 'Another class'} · ${s.subject.name}`;
      for (const p of periods)
        if (!p.isBreak && p.startsAt < s.period.endsAt && p.endsAt > s.period.startsAt)
          (out[s.staffId!] ??= {})[slotKey(s.day, p.sortOrder)] = where;
    }
    return out;
  }

  async view(armId: string, termId?: string | null) {
    const arm = await this.requireArm(armId);
    const { session, term } = await this.requireTerm(termId);
    const periods = await this.periods(tenantId(), arm.sectionId);
    const [tt, offered, assignments, busy] = await Promise.all([
      this.db.timetable.findFirst({
        where: { termId: term.id, armId: arm.id },
        include: {
          slots: { where: { layer: 'DRAFT' }, include: { subject: { select: { code: true } } } },
        },
      }),
      this.catalog.offeredByLevel(session.id),
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, armId: arm.id },
        include: { staff: { select: { title: true, firstName: true, lastName: true } } },
      }),
      this.busy(term.id, arm, periods),
    ]);
    const byId = new Map(periods.map((p) => [p.id, p]));
    const grid: Grid = {};
    for (const s of tt?.slots ?? [])
      grid[slotKey(s.day, byId.get(s.periodId)!.sortOrder)] = s.subject.code;
    return {
      armId: arm.id,
      arm: arm.label,
      term: term.name,
      termId: term.id,
      status: tt ? STATUS_LABEL[tt.status] : ('Draft' as const),
      version: tt?.version ?? 1,
      publishedVersion: tt?.publishedVersion ?? null,
      periods: periods.map((p) => ({
        id: periodKey(p.sortOrder),
        label: p.label,
        start: hhmm(p.startsAt),
        end: hhmm(p.endsAt),
        isBreak: p.isBreak,
      })),
      grid,
      palette: (offered.get(arm.levelId) ?? []).map((s) => {
        const a = assignments.find((x) => x.subjectId === s.subjectId);
        return {
          code: s.code,
          name: s.name,
          teacherId: a?.staffId ?? null,
          teacher: a ? staffName(a.staff) : null,
          need: a?.periodsPerWeek ?? s.periods,
        };
      }),
      busy,
      maxConsecutive: tt?.maxConsecutive ?? MAX_CONSECUTIVE,
      history: tt ? await this.audit.history('Timetable', tt.id) : [],
    };
  }

  /** Checks a grid against the curriculum, the teachers' other lessons and the weekly rules. */
  private async validate(armId: string, termId: string | null | undefined, grid: Grid) {
    const v = await this.view(armId, termId);
    const arm = await this.requireArm(armId);
    const lessonIds = new Set(v.periods.filter((p) => !p.isBreak).map((p) => p.id));
    const label = new Map(v.periods.map((p) => [p.id, p.label]));
    /** "Monday-P5" → "Monday period 4". */
    const when = (slot: string) => {
      const [day, id] = slot.split('-') as [string, string];
      return `${day} period ${label.get(id) ?? id}`;
    };
    const palette = new Map(v.palette.map((x) => [x.code, x]));
    const counts = new Map<string, number>();
    for (const [slot, code] of Object.entries(grid)) {
      const parsed = parseSlot(slot);
      if (!parsed || !lessonIds.has(periodKey(parsed.sortOrder)))
        throw fail(`${slot.replace('-', ' ')} is not a lesson period.`, 'TIMETABLE_SLOT');
      // (a break, or a period the section's bell schedule doesn't have)
      const subject = palette.get(code);
      if (!subject) {
        const s = await this.db.subject.findFirst({ where: { code } });
        throw fail(`${arm.level} doesn’t offer ${s?.name ?? code}.`, 'TIMETABLE_SUBJECT');
      }
      counts.set(code, (counts.get(code) ?? 0) + 1);
      const busy = subject.teacherId ? v.busy[subject.teacherId]?.[slot] : undefined;
      if (busy)
        throw fail(
          `${subject.teacher} is already teaching ${busy} on ${when(slot)}.`,
          'TIMETABLE_CLASH',
          HttpStatus.CONFLICT,
        );
    }
    for (const [code, n] of counts) {
      const s = palette.get(code)!;
      if (n > s.need)
        throw fail(`${s.name} has ${n} lessons; it needs ${s.need}.`, 'TIMETABLE_COUNT');
    }
    const lessons = v.periods.filter((p) => !p.isBreak).map((p) => p.id);
    for (const day of Object.values(DAY_LABEL)) {
      let run = 1;
      lessons.forEach((p, i) => {
        const c = grid[`${day}-${p}`];
        const prev = i ? grid[`${day}-${lessons[i - 1]}`] : undefined;
        run = c && c === prev ? run + 1 : 1;
        if (run > v.maxConsecutive)
          throw fail(
            `More than ${v.maxConsecutive} consecutive ${palette.get(c!)!.name} lessons on ${day}.`,
            'TIMETABLE_CONSECUTIVE',
          );
      });
    }
    return v;
  }

  private async record(armId: string, termId: string, db: TenantTx = this.db) {
    const arm = await this.requireArm(armId);
    const schoolId = tenantId();
    const tt =
      (await db.timetable.findFirst({ where: { termId, armId } })) ??
      (await db.timetable.create({ data: { schoolId, termId, armId } }));
    return { arm, tt, schoolId };
  }

  /** Replaces the draft's lessons with the grid (teachers from this term's assignments). */
  private async writeDraft(
    tx: TenantTx,
    schoolId: string,
    ttId: string,
    termId: string,
    arm: ArmInfo,
    grid: Grid,
  ) {
    const [periods, subjects, assignments] = await Promise.all([
      this.periods(schoolId, arm.sectionId, tx),
      tx.subject.findMany({ where: { code: { in: [...new Set(Object.values(grid))] } } }),
      tx.teachingAssignment.findMany({ where: { termId, armId: arm.id } }),
    ]);
    await tx.timetableSlot.deleteMany({ where: { timetableId: ttId, layer: 'DRAFT' } });
    await tx.timetableSlot.createMany({
      data: Object.entries(grid).map(([slot, code]) => {
        const { day, sortOrder } = parseSlot(slot)!;
        const subject = subjects.find((s) => s.code === code)!;
        return {
          schoolId,
          timetableId: ttId,
          termId,
          layer: 'DRAFT' as const,
          day,
          periodId: periods.find((p) => p.sortOrder === sortOrder)!.id,
          subjectId: subject.id,
          staffId: assignments.find((a) => a.subjectId === subject.id)?.staffId ?? null,
        };
      }),
    });
  }

  async save(p: { armId: string; termId?: string; grid?: Grid }) {
    const { term } = await this.requireTerm(p.termId);
    requireOpenTerm(term);
    const grid = p.grid ?? {};
    const existing = await this.db.timetable.findFirst({
      where: { termId: term.id, armId: p.armId },
    });
    if (existing?.status === 'PUBLISHED')
      throw fail(LOCKED, 'TIMETABLE_LOCKED', HttpStatus.CONFLICT);
    await this.validate(p.armId, term.id, grid);
    await this.db.$transaction(async (tx) => {
      const { arm, tt, schoolId } = await this.record(p.armId, term.id, tx);
      await this.writeDraft(tx, schoolId, tt.id, term.id, arm, grid);
      await tx.timetable.update({ where: { id: tt.id }, data: { status: 'DRAFT' } });
    });
    return this.view(p.armId, term.id);
  }

  /**
   * Fills the empty periods of the draft (keeping what's placed) without clashing teachers: one
   * lesson of a subject per day first, then doubles if it still needs more.
   */
  async suggest(p: { armId: string; termId?: string; grid?: Grid }) {
    const { term } = await this.requireTerm(p.termId);
    requireOpenTerm(term);
    const v = await this.view(p.armId, term.id);
    if (v.status === 'Published') throw fail(LOCKED, 'TIMETABLE_LOCKED', HttpStatus.CONFLICT);
    const grid: Grid = { ...(p.grid ?? v.grid) };
    const lessons = v.periods.filter((x) => !x.isBreak);
    const days = Object.values(DAY_LABEL);
    for (const s of v.palette) {
      let left = s.need - Object.values(grid).filter((c) => c === s.code).length;
      for (let pass = 0; pass < 2 && left > 0; pass++)
        for (const [di, day] of days.entries()) {
          if (left <= 0) break;
          const today = lessons.map((x) => grid[`${day}-${x.id}`]);
          if (pass === 0 && today.includes(s.code)) continue;
          const offset = (di * 3 + s.code.charCodeAt(0)) % lessons.length;
          for (let k = 0; k < lessons.length && left > 0; k++) {
            const i = (k + offset) % lessons.length;
            const slot = `${day}-${lessons[i]!.id}`;
            if (grid[slot] || (s.teacherId && v.busy[s.teacherId]?.[slot])) continue;
            // Placing it here must not make a run longer than the limit.
            const at = (j: number) => grid[`${day}-${lessons[j]?.id}`];
            let run = 1;
            for (let j = i - 1; j >= 0 && at(j) === s.code; j--) run++;
            for (let j = i + 1; j < lessons.length && at(j) === s.code; j++) run++;
            if (run > v.maxConsecutive) continue;
            grid[slot] = s.code;
            left--;
            if (pass === 0) break;
          }
        }
    }
    return this.save({ armId: p.armId, termId: term.id, grid });
  }

  /** Starts this term's draft from another term's timetable for the same arm. */
  async copy(p: { armId: string; termId?: string; fromTermId: string }) {
    const { term } = await this.requireTerm(p.termId);
    requireOpenTerm(term);
    const source = await this.db.timetable.findFirst({
      where: { termId: p.fromTermId, armId: p.armId },
      include: { slots: { include: { period: true, subject: { select: { code: true } } } } },
    });
    const layer = source?.publishedVersion ? 'PUBLISHED' : 'DRAFT';
    const slots = source?.slots.filter((s) => s.layer === layer) ?? [];
    if (!slots.length)
      throw fail('Nothing to copy from that term.', 'TIMETABLE_NOTHING', HttpStatus.NOT_FOUND);
    const grid: Grid = {};
    for (const s of slots) grid[slotKey(s.day, s.period.sortOrder)] = s.subject.code;
    // Subjects the class no longer takes are left out rather than refused.
    const v = await this.view(p.armId, term.id);
    for (const [k, c] of Object.entries(grid))
      if (!v.palette.some((x) => x.code === c)) delete grid[k];
    const saved = await this.save({ armId: p.armId, termId: term.id, grid });
    const tt = await this.db.timetable.findFirst({ where: { termId: term.id, armId: p.armId } });
    await this.audit.record({
      action: 'timetable.copy',
      area: 'Academic',
      entity: 'Timetable',
      entityId: tt!.id,
      summary: 'Draft copied from another term',
    });
    return { ...saved, history: await this.audit.history('Timetable', tt!.id) };
  }

  async act(action: string, p: { armId: string; termId?: string }) {
    const { term } = await this.requireTerm(p.termId);
    requireOpenTerm(term);
    const v = await this.view(p.armId, term.id);
    const tt = await this.db.timetable.findFirst({ where: { termId: term.id, armId: p.armId } });
    const status: TimetableStatus = tt?.status ?? 'DRAFT';
    const entry = (summary: string, detail?: string) => ({
      action: `timetable.${action}`,
      area: 'Academic' as const,
      entity: 'Timetable',
      entityId: tt?.id,
      summary,
      detail,
    });
    switch (action) {
      case 'review': {
        if (!tt || status !== 'DRAFT')
          throw fail(
            'Only a draft can be marked as reviewed.',
            'TIMETABLE_STATUS',
            HttpStatus.CONFLICT,
          );
        const left = v.palette.reduce(
          (n, x) =>
            n + Math.max(0, x.need - Object.values(v.grid).filter((c) => c === x.code).length),
          0,
        );
        if (left)
          throw fail(
            `${plural(left, 'lesson')} still ${left === 1 ? 'needs' : 'need'} a period.`,
            'TIMETABLE_INCOMPLETE',
          );
        const noTeacher = v.palette.filter((x) => !x.teacherId);
        if (noTeacher.length)
          throw fail(
            `${noTeacher.map((x) => x.name).join(', ')} ${noTeacher.length > 1 ? 'have' : 'has'} no teacher. Assign one in Teacher Assignments first.`,
            'TIMETABLE_NO_TEACHER',
          );
        await this.db.$transaction(async (tx) => {
          await tx.timetable.update({ where: { id: tt.id }, data: { status: 'REVIEWED' } });
          await this.audit.record(entry('Marked as reviewed'), asTx(tx));
        });
        break;
      }
      case 'publish': {
        if (!tt || status !== 'REVIEWED')
          throw fail(
            'Review the timetable before publishing it.',
            'TIMETABLE_STATUS',
            HttpStatus.CONFLICT,
          );
        // A teacher may have been given another class at the same time since the review.
        await this.validate(p.armId, term.id, v.grid);
        await this.db.$transaction(async (tx) => {
          const draft = await tx.timetableSlot.findMany({
            where: { timetableId: tt.id, layer: 'DRAFT' },
          });
          await tx.timetableSlot.deleteMany({ where: { timetableId: tt.id, layer: 'PUBLISHED' } });
          await tx.timetableSlot.createMany({
            data: draft.map(({ id: _id, createdAt: _c, updatedAt: _u, ...s }) => ({
              ...s,
              layer: 'PUBLISHED' as const,
            })),
          });
          await tx.timetable.update({
            where: { id: tt.id },
            data: { status: 'PUBLISHED', publishedVersion: tt.version, publishedAt: new Date() },
          });
          await this.audit.record(
            {
              ...entry(`Timetable published: ${v.arm}`, `${v.term} · v${tt.version}`),
              summary: `Version ${tt.version} published`,
            },
            asTx(tx),
          );
        });
        break;
      }
      case 'revise': {
        if (!tt || status !== 'PUBLISHED')
          throw fail(
            'Only a published timetable can be revised.',
            'TIMETABLE_STATUS',
            HttpStatus.CONFLICT,
          );
        await this.db.$transaction(async (tx) => {
          await tx.timetable.update({
            where: { id: tt.id },
            data: { status: 'DRAFT', version: tt.version + 1 },
          });
          await this.audit.record(
            entry(
              `Revision v${tt.version + 1} started`,
              `v${tt.publishedVersion} stays in effect until the revision is published`,
            ),
            asTx(tx),
          );
        });
        break;
      }
      default:
        throw fail('Unknown action', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.view(p.armId, term.id);
  }

  /** An arm's published week for the portals: day → lessons in period order. */
  async publishedWeek(armId: string, termId: string) {
    const slots = await this.db.timetableSlot.findMany({
      where: { termId, layer: 'PUBLISHED', timetable: { armId } },
      include: { period: true, subject: true, staff: true },
      orderBy: [{ day: 'asc' }, { period: { sortOrder: 'asc' } }],
    });
    return slots;
  }

  /** Setup Center facts for the current term. */
  async counts() {
    const term = await this.catalog.currentTerm();
    const all = await this.db.timetable.findMany({ select: { status: true, termId: true } });
    return {
      total: all.length,
      published: all.filter((t) => t.termId === term?.id && t.status === 'PUBLISHED').length,
      anyPublished: all.some((t) => t.status === 'PUBLISHED'),
      drafts: all.filter((t) => t.status !== 'PUBLISHED').length,
    };
  }
}
