import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PromotionOutcome } from '../../generated/prisma/enums.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { fail, plural } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx } from '../shared/tenant-tx.js';
import {
  closeStudentAccess,
  retainLeaverFiles,
  StudentAccessService,
  type ClosedStudentAccess,
} from '../students/student-access.js';
import type { PromotionDecisionInputDto } from './dto/promotion.dto.js';
import {
  annualOf,
  DECISION_FROM_LABEL,
  DECISION_LABEL,
  eligibilityOf,
  isException,
  listText,
  nextLevelOf,
  ruleText,
  suggestionOf,
  type Eligibility,
  type OrderedLevel,
  type PromotionLabel,
  type PromotionRule,
} from './promotion-rules.js';

const CLASS_NOT_FOUND = 'Class not found';
const ALREADY_APPLIED = 'Decisions for this class are already applied.';

type EnrollmentRow = Prisma.EnrollmentGetPayload<{
  include: {
    student: { select: { id: true; firstName: true; surname: true; status: true } };
    arm: { select: { id: true; name: true } };
    promotionDecisions: true;
  };
}>;

interface SessionRef {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  status: string;
}

interface Level extends OrderedLevel {
  section: string;
}

interface ClassRef {
  key: string;
  levelId: string;
  branchId: string;
  level: Level;
  branch: string;
  name: string;
  enrollments: EnrollmentRow[];
}

/** One student's line, computed from the rule and the session's published results. */
interface StudentLine {
  enrollment: EnrollmentRow;
  name: string;
  average: number | null;
  mustPass: (number | null)[];
  elig: Eligibility;
  suggestion: PromotionOutcome | null;
  decision: PromotionOutcome | null;
  reason: string;
  applied: boolean;
  /** Fees owed (always 0 until Finance is built). */
  balance: number;
}

/** Everything a class's view, save and apply need. */
interface ClassState {
  from: SessionRef;
  to: SessionRef | null;
  classes: ClassRef[];
  cls: ClassRef;
  next: Level | null;
  rule: PromotionRule | null;
  ruleNote: string;
  suggestions: boolean;
  feesBlock: boolean;
  arms: { id: string; branchId: string; levelId: string; name: string; capacity: number }[];
  levels: Level[];
  lines: StudentLine[];
}

const nameOf = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;
const label = (d: PromotionOutcome | null) => (d ? DECISION_LABEL[d] : null);

/**
 * Academics › Promotion: at the end of a session each class (a class level at a branch, keyed
 * `<levelId>~<branchId>`) gets a decision per student — Promote, Repeat, Graduate (the school's
 * final class), Transfer or Withdraw. With Settings › Academic's suggestions on, each section's
 * rule (Assessment & Grading: a minimum annual average and must-pass subjects) works out who is
 * eligible from the session's published results and suggests a decision; a decision against it
 * needs a reason. Applying a class writes the decisions, sets the outcome on this session's
 * enrollments, enrolls promoted and repeating students into the next session and records the
 * leavers. Shapes follow the School Admin mock (`/v1/academics/promotion`).
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly sections: SectionAccessService,
    private readonly access: StudentAccessService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /* ---------------- Sessions and classes ---------------- */

  /**
   * The session being promoted from and the one students move into. A Closing session whose
   * students are still on its roll (the next session started before promotion was done) comes
   * first; otherwise the Active session. The next session is the one after it (Upcoming, or
   * Active once started).
   */
  private async sessions(): Promise<{ from: SessionRef | null; to: SessionRef | null }> {
    const all = await this.db.academicSession.findMany({ orderBy: { startsOn: 'asc' } });
    let from: SessionRef | null = null;
    for (const s of all.filter((x) => x.status === 'CLOSING').reverse())
      if (await this.db.enrollment.count({ where: { sessionId: s.id, status: 'ACTIVE' } })) {
        from = s;
        break;
      }
    from ??= all.find((s) => s.status === 'ACTIVE') ?? null;
    const to = from
      ? (all.find(
          (s) => s.startsOn > from.startsOn && (s.status === 'UPCOMING' || s.status === 'ACTIVE'),
        ) ?? null)
      : null;
    return { from, to };
  }

  private async levels(): Promise<Level[]> {
    const rows = await this.db.classLevel.findMany({
      include: { section: { select: { name: true, sortOrder: true } } },
    });
    return rows
      .map((l) => ({
        id: l.id,
        name: l.name,
        sectionId: l.sectionId,
        section: l.section.name,
        sectionOrder: l.section.sortOrder,
        sortOrder: l.sortOrder,
        nextLevelId: l.nextLevelId,
      }))
      .sort(
        (a, b) =>
          a.sectionOrder - b.sectionOrder ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name),
      );
  }

  /** The session's classes: students who finished the year in them (not those who left). */
  private async classes(sessionId: string, levels: Level[]): Promise<ClassRef[]> {
    const [rows, branches] = await Promise.all([
      this.db.enrollment.findMany({
        where: { sessionId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        include: {
          student: { select: { id: true, firstName: true, surname: true, status: true } },
          arm: { select: { id: true, name: true } },
          promotionDecisions: true,
        },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      }),
      this.db.branch.findMany({
        orderBy: [{ isOriginal: 'desc' }, { createdAt: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);
    const map = new Map<string, ClassRef>();
    for (const e of rows) {
      const key = `${e.levelId}~${e.branchId}`;
      const level = levels.find((l) => l.id === e.levelId);
      if (!level) continue;
      const cls = map.get(key) ?? {
        key,
        levelId: e.levelId,
        branchId: e.branchId,
        level,
        branch: branches.find((b) => b.id === e.branchId)?.name ?? '',
        name: level.name,
        enrollments: [],
      };
      cls.enrollments.push(e);
      map.set(key, cls);
    }
    const list = [...map.values()];
    const manyBranches = new Set(list.map((c) => c.branchId)).size > 1;
    for (const c of list) if (manyBranches) c.name = `${c.level.name} · ${c.branch}`;
    const bIndex = (id: string) => branches.findIndex((b) => b.id === id);
    return list.sort(
      (a, b) =>
        levels.indexOf(a.level) - levels.indexOf(b.level) ||
        bIndex(a.branchId) - bIndex(b.branchId),
    );
  }

  /** The section's rule for the session, from its assessment scheme (null: none, or descriptive). */
  private async rule(sessionId: string, level: Level) {
    const scheme = await this.db.assessmentScheme.findFirst({
      where: { sessionId, sectionId: level.sectionId },
    });
    if (!scheme)
      return {
        rule: null,
        note: `${level.section} has no assessment scheme for this session, so staff decide for each student.`,
      };
    if (scheme.mode === 'DESCRIPTIVE')
      return {
        rule: null,
        note: `${level.section} uses descriptive ratings, so staff decide for each student.`,
      };
    const subjects = scheme.promotionSubjectIds.length
      ? await this.db.subject.findMany({
          where: { id: { in: scheme.promotionSubjectIds } },
          select: { id: true, name: true },
        })
      : [];
    const rule: PromotionRule = {
      minAverage: scheme.promotionMinAverage === null ? null : Number(scheme.promotionMinAverage),
      passMark: Number(scheme.passMark),
      mustPass: scheme.promotionSubjectIds.flatMap((id) => subjects.filter((s) => s.id === id)),
    };
    const text = ruleText(rule);
    return text
      ? { rule, note: text }
      : {
          rule: null,
          note: `No promotion rule for ${level.section} yet. Set one in Assessment & Grading.`,
        };
  }

  /** Fees owed by each student. */
  private feeBalances(studentIds: string[]): Map<string, number> {
    // Finance isn't built yet, so nobody owes anything: every balance is 0 and the school's
    // "block promotion when fees are outstanding" setting never stops a promotion. Replace this
    // with the students' outstanding invoice balances once Finance lands.
    return new Map(studentIds.map((id) => [id, 0]));
  }

  /** Parses a class id (`<levelId>~<branchId>`) and finds it in the session. */
  private async state(classKey?: string | null): Promise<ClassState | null> {
    const { from, to } = await this.sessions();
    if (!from) return null;
    const levels = await this.levels();
    const classes = await this.classes(from.id, levels);
    if (!classes.length) return null;
    const cls = classKey
      ? classes.find((c) => c.key === classKey.toLowerCase())
      : (classes.find((c) => c.enrollments.some((e) => !e.outcome)) ?? classes[0]);
    if (!cls) throw AppException.notFound(CLASS_NOT_FOUND, 'CLASS_NOT_FOUND');
    return this.load(from, to, classes, cls, levels);
  }

  private async load(
    from: SessionRef,
    to: SessionRef | null,
    classes: ClassRef[],
    cls: ClassRef,
    levels: Level[],
  ): Promise<ClassState> {
    const next = nextLevelOf(levels, cls.levelId);
    const studentIds = cls.enrollments.map((e) => e.studentId);
    const [{ rule, note }, settings, entries, arms] = await Promise.all([
      this.rule(from.id, cls.level),
      this.db.schoolSettings.findFirst({
        select: { promotionSuggestions: true, blockPromotionOnFees: true },
      }),
      this.db.resultEntry.findMany({
        where: {
          studentId: { in: studentIds },
          sheet: { sessionId: from.id, status: 'PUBLISHED' },
        },
        select: {
          studentId: true,
          total: true,
          sheet: { select: { termId: true, subjectId: true } },
        },
      }),
      this.db.classArm.findMany({
        where: {
          branchId: cls.branchId,
          levelId: { in: [cls.levelId, ...(next ? [next.id] : [])] },
          archivedAt: null,
        },
        select: { id: true, branchId: true, levelId: true, name: true, capacity: true },
      }),
    ]);
    const suggestions = settings?.promotionSuggestions ?? true;
    const feesBlock = settings?.blockPromotionOnFees ?? false;
    const balances = this.feeBalances(studentIds);
    const lines = cls.enrollments.map((e): StudentLine => {
      const annual = annualOf(
        entries
          .filter((x) => x.studentId === e.studentId)
          .map((x) => ({
            subjectId: x.sheet.subjectId,
            termId: x.sheet.termId,
            total: x.total === null ? null : Number(x.total),
          })),
      );
      const computed = eligibilityOf(rule, annual);
      // With suggestions off there's no eligibility and nothing to go against; a missing-results
      // note still helps.
      const elig: Eligibility = suggestions
        ? computed
        : { eligible: null, note: annual.average === null ? computed.note : '' };
      const row = e.promotionDecisions[0];
      return {
        enrollment: e,
        name: nameOf(e.student),
        average: annual.average,
        mustPass: (rule?.mustPass ?? []).map((s) => annual.subjects.get(s.id) ?? null),
        elig,
        suggestion: suggestions ? suggestionOf(elig.eligible, !next) : null,
        decision: e.outcome ?? row?.decision ?? null,
        reason: row?.reason ?? '',
        applied: e.outcome !== null,
        balance: balances.get(e.studentId) ?? 0,
      };
    });
    return {
      from,
      to,
      classes,
      cls,
      next,
      rule,
      ruleNote: note,
      suggestions,
      feesBlock,
      arms,
      levels,
      lines,
    };
  }

  /* ---------------- View ---------------- */

  /** The arm a student keeps at a level: the same letter if that arm exists there. */
  private armAt(st: ClassState, levelId: string, armName: string | null | undefined) {
    if (!armName) return null;
    return st.arms.find((a) => a.levelId === levelId && a.name === armName) ?? null;
  }

  /** Where a decision puts the student next session. */
  private nextText(st: ClassState, line: StudentLine): string {
    const d = line.decision;
    const row = line.enrollment.promotionDecisions[0];
    const levelName = (id: string | null | undefined) =>
      st.levels.find((l) => l.id === id)?.name ?? '';
    const place = (level: string, arm: string | null) =>
      arm ? `${level} · arm ${arm}` : `${level} · awaiting an arm`;
    if (d === 'PROMOTE' || d === 'REPEAT') {
      const repeat = d === 'REPEAT' ? ' (repeat)' : '';
      if (line.applied && row?.nextLevelId) {
        const arm = st.arms.find((a) => a.id === row.nextArmId)?.name ?? null;
        return place(levelName(row.nextLevelId), arm) + repeat;
      }
      const target = d === 'PROMOTE' ? st.next : st.cls.level;
      if (!target) return 'Graduates';
      const arm = this.armAt(st, target.id, line.enrollment.arm?.name);
      return place(target.name, arm?.name ?? null) + repeat;
    }
    if (d === 'GRADUATE') return 'Graduates';
    if (d === 'TRANSFER' || d === 'WITHDRAW') return 'Leaves school';
    return '—';
  }

  private toView(st: ClassState) {
    const status = (c: ClassRef) =>
      c.enrollments.some((e) => !e.outcome)
        ? ('Pending' as const)
        : c.enrollments.some((e) => e.outcome === 'PROMOTE' || e.outcome === 'REPEAT') ||
            nextLevelOf(st.levels, c.levelId)
          ? ('Complete' as const)
          : ('Graduated' as const);
    const applied = st.lines.every((l) => l.applied);
    return {
      from: st.from.name,
      to: st.to?.name ?? '',
      rule: st.ruleNote,
      mustPass: (st.rule?.mustPass ?? []).map((s) => s.name),
      passMark: st.rule?.passMark ?? null,
      classes: st.classes.map((c) => ({
        id: c.key,
        name: c.name,
        pending: c.enrollments.filter((e) => !e.outcome && !e.promotionDecisions[0]?.decision)
          .length,
        total: c.enrollments.length,
        status: status(c),
      })),
      classId: st.cls.key,
      className: st.cls.name,
      level: st.cls.level.name,
      branch: st.cls.branch,
      nextLevel: st.next?.name ?? null,
      students: st.lines.map((l) => ({
        id: l.enrollment.studentId,
        name: l.name,
        arm: l.enrollment.arm?.name ?? null,
        average: l.average,
        mustPass: l.mustPass,
        eligible: l.elig.eligible,
        note: l.elig.note,
        suggestion: label(l.suggestion),
        decision: label(l.decision),
        reason: l.reason,
        balance: l.balance,
        next: this.nextText(st, l),
      })),
      applied,
      empty: false,
      suggestions: st.suggestions,
      feesBlock: st.feesBlock,
    };
  }

  private async emptyView() {
    const settings = await this.db.schoolSettings.findFirst({
      select: { promotionSuggestions: true, blockPromotionOnFees: true },
    });
    return {
      from: '',
      to: '',
      rule: '',
      mustPass: [] as string[],
      passMark: null,
      classes: [],
      classId: '',
      className: '',
      level: '',
      branch: '',
      nextLevel: null,
      students: [],
      applied: false,
      empty: true,
      suggestions: settings?.promotionSuggestions ?? true,
      feesBlock: settings?.blockPromotionOnFees ?? false,
    };
  }

  /** GET: a class's decisions (an unknown class falls back to the first one still pending). */
  async view(classKey?: string) {
    const valid = classKey && this.validKey(classKey) ? classKey : null;
    let st: ClassState | null;
    try {
      st = await this.state(valid);
    } catch (e) {
      if (!(e instanceof AppException) || !valid) throw e;
      st = await this.state(null);
    }
    return st ? this.toView(st) : this.emptyView();
  }

  private validKey(key: string) {
    const [levelId, branchId, extra] = key.split('~');
    return extra === undefined && !!levelId && !!branchId && isUuid(levelId) && isUuid(branchId);
  }

  /** A class for a write: 404 when it isn't one, 403 outside a section admin's sections. */
  private async writable(classKey: string): Promise<ClassState> {
    if (!this.validKey(classKey)) throw AppException.notFound(CLASS_NOT_FOUND, 'CLASS_NOT_FOUND');
    const st = await this.state(classKey);
    if (!st) throw AppException.notFound(CLASS_NOT_FOUND, 'CLASS_NOT_FOUND');
    await this.sections.require(st.cls.level.sectionId, 'promotion decisions');
    if (st.lines.every((l) => l.applied))
      throw AppException.conflict(ALREADY_APPLIED, 'ALREADY_APPLIED');
    return st;
  }

  /** 422 when a decision doesn't fit the class: only the final class graduates, and it can't promote. */
  private checkDecision(st: ClassState, name: string, d: PromotionOutcome | null) {
    if (d === 'PROMOTE' && !st.next)
      throw fail(
        `${st.cls.level.name} is the final class, so ${name} can’t be promoted. Choose Graduate, Repeat, Transfer or Withdraw.`,
        'DECISION_INVALID',
      );
    if (d === 'GRADUATE' && st.next)
      throw fail(
        `Only the final class graduates. Choose Promote, Repeat, Transfer or Withdraw for ${name}.`,
        'DECISION_INVALID',
      );
  }

  /* ---------------- Save decisions ---------------- */

  async save(schoolId: string, classKey: string, decisions: PromotionDecisionInputDto[]) {
    const st = await this.writable(classKey);
    const userId = RequestContext.get()?.userId ?? null;
    const now = this.clock.now();
    const writes: { line: StudentLine; decision: PromotionOutcome | null; reason: string }[] = [];
    for (const d of decisions) {
      const line = st.lines.find((l) => l.enrollment.studentId === d.studentId);
      // Students not in the class, and ones already applied, are left alone.
      if (!line || line.applied) continue;
      const decision = d.decision ? DECISION_FROM_LABEL[d.decision as PromotionLabel] : null;
      this.checkDecision(st, line.name, decision);
      writes.push({ line, decision, reason: (d.reason ?? '').trim() });
    }
    await this.db.$transaction(async (tx) => {
      for (const { line, decision, reason } of writes) {
        const data = {
          decision,
          reason: reason || null,
          suggestion: line.suggestion,
          average: line.average,
          eligible: line.elig.eligible,
          decidedById: decision ? userId : null,
          decidedAt: decision ? now : null,
        };
        await tx.promotionDecision.upsert({
          where: { enrollmentId: line.enrollment.id },
          create: { schoolId, enrollmentId: line.enrollment.id, ...data },
          update: data,
        });
      }
      const decided = st.lines.filter((l) => {
        const w = writes.find((x) => x.line === l);
        return w ? !!w.decision : !!l.decision;
      }).length;
      await this.audit.record(
        {
          action: 'promotion.save',
          area: 'Academic',
          entity: 'Promotion',
          entityId: null,
          summary: `Promotion decisions saved for ${st.cls.name}`,
          detail: `${st.from.name} · ${decided} of ${plural(st.lines.length, 'student')} decided`,
        },
        asTx(tx),
      );
    });
    return this.view(st.cls.key);
  }

  /* ---------------- Apply ---------------- */

  async apply(schoolId: string, classKey: string) {
    const st = await this.writable(classKey);
    const to = st.to;
    if (!to)
      throw fail(
        `Create the session after ${st.from.name} in Sessions & Terms first: promoted and repeating students are enrolled into it.`,
        'NO_NEXT_SESSION',
        HttpStatus.CONFLICT,
      );
    const pending = st.lines.filter((l) => !l.applied);
    const undecided = pending.filter((l) => !l.decision);
    if (undecided.length)
      throw fail(`Decide for ${listText(undecided.map((l) => l.name))} first.`, 'UNDECIDED');
    for (const l of pending) this.checkDecision(st, l.name, l.decision);
    if (st.feesBlock) {
      const owing = pending.filter((l) => l.decision === 'PROMOTE' && l.balance > 0);
      if (owing.length)
        throw fail(
          `Your school blocks promotion while fees are outstanding: ${owing.map((l) => l.name).join(', ')}. Clear the balance or choose another decision.`,
          'FEES_OUTSTANDING',
        );
    }
    // With suggestions off there is no rule to go against, so no exception reasons are needed.
    const noReason = pending.filter(
      (l) => st.suggestions && isException(l.elig.eligible, l.decision) && !l.reason.trim(),
    );
    if (noReason.length)
      throw fail(
        `Give a reason for each exception: ${noReason.map((l) => l.name).join(', ')}.`,
        'REASON_REQUIRED',
      );
    if (st.next && pending.some((l) => l.decision === 'PROMOTE')) {
      const runs = await this.db.branchLevel.count({
        where: { branchId: st.cls.branchId, levelId: st.next.id },
      });
      if (!runs)
        throw fail(
          `${st.cls.branch} doesn’t run ${st.next.name}, so promoted students have no class to go to. Add ${st.next.name} there in Classes & Arms, or record a transfer.`,
          'NEXT_LEVEL_NOT_RUN',
        );
    }

    const userId = RequestContext.get()?.userId ?? null;
    const now = this.clock.now();
    const leftOn = st.from.endsOn;
    const closed: ClosedStudentAccess[] = [];
    let created = 0;
    await this.db.$transaction(async (tx) => {
      const already = await tx.enrollment.findMany({
        where: { sessionId: to.id, studentId: { in: pending.map((l) => l.enrollment.studentId) } },
      });
      // Places taken in each target arm next session, so arms aren't overfilled.
      const taken = new Map<string, number>();
      for (const g of await tx.enrollment.groupBy({
        by: ['armId'],
        where: { sessionId: to.id, status: 'ACTIVE', armId: { in: st.arms.map((a) => a.id) } },
        _count: { _all: true },
      }))
        if (g.armId) taken.set(g.armId, g._count._all);

      for (const l of pending) {
        const d = l.decision!;
        const e = l.enrollment;
        let nextLevelId: string | null = null;
        let nextArmId: string | null = null;
        let summary: string;
        if (d === 'PROMOTE' || d === 'REPEAT') {
          const target = d === 'PROMOTE' ? st.next! : st.cls.level;
          nextLevelId = target.id;
          const existing = already.find((x) => x.studentId === e.studentId);
          if (existing) {
            // Already enrolled for next session (e.g. admitted into it): left as it is.
            nextLevelId = existing.levelId;
            nextArmId = existing.armId;
          } else {
            const arm = this.armAt(st, target.id, e.arm?.name);
            if (arm && (taken.get(arm.id) ?? 0) < arm.capacity) {
              nextArmId = arm.id;
              taken.set(arm.id, (taken.get(arm.id) ?? 0) + 1);
            }
            await tx.enrollment.create({
              data: {
                schoolId,
                studentId: e.studentId,
                sessionId: to.id,
                branchId: e.branchId,
                levelId: target.id,
                armId: nextArmId,
                status: 'ACTIVE',
                enrolledOn: to.startsOn,
              },
            });
            created++;
          }
          const armName = st.arms.find((a) => a.id === nextArmId)?.name;
          const place = `${target.name}${armName ? ` · arm ${armName}` : ' · awaiting an arm'}`;
          summary = d === 'PROMOTE' ? `Promoted to ${place}` : `Repeating ${place}`;
        } else if (d === 'GRADUATE') {
          await tx.student.update({
            where: { id: e.studentId },
            data: { status: 'GRADUATED', graduatedOn: leftOn, leftOn },
          });
          summary = `Graduated at the end of ${st.from.name}`;
        } else {
          const transfer = d === 'TRANSFER';
          await tx.student.update({
            where: { id: e.studentId },
            data: {
              status: transfer ? 'TRANSFERRED' : 'WITHDRAWN',
              exitKind: transfer ? 'TRANSFER' : 'WITHDRAWAL',
              exitOn: leftOn,
              exitReason: l.reason || null,
              leftOn,
            },
          });
          summary = `${transfer ? 'Transferring out' : 'Withdrawn'} at the end of ${st.from.name}`;
        }
        if (d === 'GRADUATE' || d === 'TRANSFER' || d === 'WITHDRAW') {
          await retainLeaverFiles(tx, e.studentId, leftOn);
          const c = await closeStudentAccess(
            e.studentId,
            tx,
            now,
            d === 'GRADUATE' ? 'Graduated' : d === 'TRANSFER' ? 'Transferred out' : 'Withdrawn',
          );
          if (c) closed.push(c);
        }
        await tx.enrollment.update({ where: { id: e.id }, data: { outcome: d } });
        const data = {
          decision: d,
          suggestion: l.suggestion,
          average: l.average,
          eligible: l.elig.eligible,
          toSessionId: to.id,
          nextLevelId,
          nextArmId,
          appliedAt: now,
        };
        await tx.promotionDecision.upsert({
          where: { enrollmentId: e.id },
          create: {
            schoolId,
            enrollmentId: e.id,
            reason: l.reason || null,
            decidedById: userId,
            decidedAt: now,
            ...data,
          },
          update: data,
        });
        await this.audit.record(
          {
            action: 'student.promotion',
            area: 'Students',
            entity: 'Student',
            entityId: e.studentId,
            summary,
            detail: [
              `${st.from.name} → ${to.name}`,
              isException(l.elig.eligible, d) && `exception: ${l.reason}`,
              !isException(l.elig.eligible, d) && l.reason,
            ]
              .filter(Boolean)
              .join(' · '),
            after: { decision: DECISION_LABEL[d], nextLevelId, nextArmId },
          },
          asTx(tx),
        );
      }

      const counts = (Object.keys(DECISION_LABEL) as PromotionOutcome[])
        .map((k) => [DECISION_LABEL[k], pending.filter((l) => l.decision === k).length] as const)
        .filter(([, n]) => n)
        .map(([k, n]) => `${k} ${n}`);
      const exceptions = pending.filter((l) => isException(l.elig.eligible, l.decision)).length;
      await this.audit.record(
        {
          action: 'promotion.apply',
          area: 'Academic',
          entity: 'Promotion',
          entityId: null,
          summary: `Promotion decisions applied for ${st.cls.name}`,
          detail: [
            `${st.from.name} → ${to.name}`,
            ...counts,
            exceptions && plural(exceptions, 'exception'),
            `${plural(created, 'enrollment')} created`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
        asTx(tx),
      );
    });
    for (const c of closed) await this.access.forget(c);
    return { ...(await this.view(st.cls.key)), created };
  }
}
