import { HttpStatus, Injectable } from '@nestjs/common';
import { PLAN_MODULES } from '@edutrack/shared';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { daysBetween, lagosToday } from '../../platform/shared/format.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AcademicCatalogService } from '../academics/academic-catalog.service.js';
import { isoDate } from '../academics/academic-format.js';
import {
  admissionNoMatcher,
  admissionScope,
  formatAdmissionNo,
} from '../admissions/admissions-view.js';
import { AssessmentService } from '../assessment/assessment.service.js';
import { ON_ROLL, UNLIMITED_BRANCHES } from '../profile/view.js';
import { SetupService } from '../setup/setup.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { formatNumber as formatStaffNumber, numberOf } from '../staff/staff-view.js';
import type { AcademicPolicyDto, FinanceTogglesDto, NumberingDto } from './dto/settings.dto.js';
import {
  ACADEMIC_LABEL,
  type AcademicKey,
  addressFormatLabel,
  annualNaira,
  countryLabel,
  currencyLabel,
  FINANCE_LABEL,
  type FinanceKey,
  literalPart,
  NUMBERING_LABEL,
  type NumberingKind,
  onOff,
  patternProblem,
  schemeSummary,
  schoolSubscriptionStatus,
  SENDER_ID_STATUS,
  SETTINGS_ACTION,
  SETTINGS_AREAS,
  type SettingsArea,
  timezoneLabel,
} from './settings-view.js';
import { ruleText } from '../promotion/promotion-rules.js';
import { SmsLedgerService } from '../communication/sms-ledger.service.js';

const KINDS: readonly NumberingKind[] = ['admission', 'staff'];
const DEFAULT_PATTERN: Record<NumberingKind, string> = {
  admission: 'STU-[YYYY]-[####]',
  staff: 'STF-[####]',
};

/** One setting that changed, for the change history. */
export interface SettingChange {
  area: SettingsArea;
  setting: string;
  from: string;
  to: string;
}

/**
 * School Admin › Settings: localisation and numbering, the academic and finance switches, the
 * plan (read-only: EduTrack sets it) and the change history. Every change is one `settings.update`
 * audit event per setting, which is what the History drawer reads. Shapes follow the School Admin
 * mock (`/v1/settings/*`).
 */
@Injectable()
export class SchoolSettingsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
    private readonly setup: SetupService,
    private readonly catalog: AcademicCatalogService,
    private readonly assessment: AssessmentService,
    private readonly ledger: SmsLedgerService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  /** The school's settings row, created with the defaults the first time it's needed. */
  settingsRow() {
    const schoolId = this.schoolId();
    return this.db.schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
  }

  /** Records each change that actually changed something. */
  async log(changes: SettingChange[], db?: Prisma.TransactionClient) {
    for (const c of changes) {
      if (c.from === c.to) continue;
      await this.audit.record(
        {
          action: SETTINGS_ACTION,
          area: c.area,
          entity: 'SchoolSettings',
          entityId: this.schoolId(),
          summary: `${c.setting} changed`,
          detail: `${c.from} → ${c.to}`,
          before: { setting: c.setting, value: c.from },
          after: { setting: c.setting, value: c.to },
        },
        db,
      );
    }
  }

  /* ---------------- School ---------------- */

  private year() {
    return lagosToday(this.clock.now()).getUTCFullYear();
  }

  private async existingNumbers(kind: NumberingKind): Promise<string[]> {
    if (kind === 'admission')
      return (await this.db.student.findMany({ select: { admissionNo: true } })).map(
        (s) => s.admissionNo,
      );
    return (await this.db.staff.findMany({ select: { staffNumber: true } })).map(
      (s) => s.staffNumber,
    );
  }

  /**
   * The running number the next record gets with `pattern`, the way the admission and staff
   * number allocators work it out: never below the highest number already used in the format's
   * scope, nor below the school's counter.
   */
  private async nextSeq(kind: NumberingKind, pattern: string, existing: string[]) {
    const year = this.year();
    let floor: number;
    let scope: string;
    if (kind === 'admission') {
      const matcher = admissionNoMatcher(pattern, year, '');
      floor = 1;
      for (const n of existing) {
        const m = matcher.exec(n);
        if (m) floor = Math.max(floor, Number(m[1]) + 1);
      }
      scope = admissionScope(pattern, year, '');
    } else {
      floor = Math.max(0, ...existing.map(numberOf)) + 1;
      scope = /\[YY(YY)?\]/.test(pattern) ? String(year) : '';
    }
    const counter = await this.db.numberSequence.findFirst({
      where: { kind: kind === 'admission' ? 'ADMISSION' : 'STAFF', scope },
      select: { nextValue: true },
    });
    return Math.max(floor, counter?.nextValue ?? 0);
  }

  private format(kind: NumberingKind, pattern: string, seq: number) {
    return kind === 'admission'
      ? formatAdmissionNo(pattern, seq, this.year(), '')
      : formatStaffNumber(pattern, seq, this.year());
  }

  private patterns(row: { admissionNumberPattern: string; staffNumberPattern: string }) {
    return {
      admission: row.admissionNumberPattern || DEFAULT_PATTERN.admission,
      staff: row.staffNumberPattern || DEFAULT_PATTERN.staff,
    };
  }

  async school() {
    const schoolId = this.schoolId();
    const [school, row, finance, setup] = await Promise.all([
      this.db.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { country: true, currency: true, timezone: true },
      }),
      this.settingsRow(),
      this.db.financeSettings.findFirst({
        select: { invoicePrefix: true, receiptPrefix: true },
      }),
      this.setup.view(),
    ]);
    const patterns = this.patterns(row);
    const numbering = [];
    for (const kind of KINDS) {
      const seq = await this.nextSeq(kind, patterns[kind], await this.existingNumbers(kind));
      numbering.push({
        kind,
        label: NUMBERING_LABEL[kind],
        pattern: patterns[kind],
        next: this.format(kind, patterns[kind], seq),
        nextSeq: seq,
      });
    }
    return {
      localisation: {
        country: countryLabel(school.country),
        currency: currencyLabel(school.currency),
        timezone: timezoneLabel(school.timezone),
        dateFormat: row.dateFormat,
        addressFormat: addressFormatLabel(row.addressFormat),
      },
      numbering,
      invoicePrefix: finance?.invoicePrefix ?? 'INV',
      receiptPrefix: finance?.receiptPrefix ?? 'RCT',
      setup: {
        finished: setup.finished,
        done: setup.steps.filter((s) => s.done).length,
        total: setup.steps.length,
      },
    };
  }

  async saveNumbering(dto: NumberingDto) {
    const row = await this.settingsRow();
    const current = this.patterns(row);
    const next = { ...current };
    for (const kind of KINDS) {
      const raw = dto[kind];
      if (raw === undefined) continue;
      const pattern = raw.trim().toUpperCase();
      const problem = patternProblem(pattern);
      if (problem)
        throw AppException.validation({ [kind]: `${NUMBERING_LABEL[kind]}: ${problem}` });
      // The school's running number under the saved format, written in the new one.
      const existing = await this.existingNumbers(kind);
      const upcoming = this.format(
        kind,
        pattern,
        await this.nextSeq(kind, current[kind], existing),
      );
      if (pattern !== current[kind] && existing.includes(upcoming))
        throw new AppException(
          HttpStatus.CONFLICT,
          `${NUMBERING_LABEL[kind]}: ${upcoming} is already in use, so this format would repeat numbers. Add a prefix or a year to make it unique.`,
          'NUMBER_IN_USE',
          { [kind]: `${upcoming} is already in use.` },
        );
      next[kind] = pattern;
    }
    if (literalPart(next.admission) === literalPart(next.staff))
      throw AppException.validation(
        {
          staff:
            'Admission numbers and staff IDs need different prefixes so they can’t be confused.',
        },
        'Admission numbers and staff IDs need different prefixes so they can’t be confused.',
      );
    await this.db.$transaction(async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: this.schoolId() },
        data: { admissionNumberPattern: next.admission, staffNumberPattern: next.staff },
      });
      await this.log(
        KINDS.map((kind) => ({
          area: 'School' as const,
          setting: `${NUMBERING_LABEL[kind]} format`,
          from: current[kind],
          to: next[kind],
        })),
        asTx(tx),
      );
    });
    return this.school();
  }

  /* ---------------- Academic ---------------- */

  async academic() {
    const [row, session, assessment] = await Promise.all([
      this.settingsRow(),
      this.catalog.currentSession(),
      this.assessment.view(),
    ]);
    const schemes = Object.entries(assessment.schemes)
      .filter(([, s]) => s)
      .map(([key, s]) => ({
        section: key === '*' ? 'All sections' : key,
        summary: schemeSummary(s!),
      }));
    return {
      reweightExempt: row.reweightExempt,
      promotionSuggestions: row.promotionSuggestions,
      blockPromotionOnFees: row.blockPromotionOnFees,
      termsPerSession: session ? session.terms.length : null,
      session: session?.name ?? null,
      passMark: assessment.passMark,
      schemes,
      // Each section's rule from Assessment & Grading, e.g. "Primary: Annual average of 40% or
      // more and a pass (40%) in English Language and Mathematics".
      promotionRule:
        Object.entries(assessment.promotion)
          .map(([section, r]) => {
            const names = new Map(
              assessment.promotionSubjects[section]?.map((x) => [x.id, x.name]),
            );
            const text = ruleText({
              minAverage: r.minAverage,
              passMark: assessment.passMark,
              mustPass: r.mustPass.map((id) => ({
                id,
                name: names.get(id) ?? 'a removed subject',
              })),
            });
            return text && `${section}: ${text}`;
          })
          .filter(Boolean)
          .join(' · ') || null,
    };
  }

  async saveAcademic(dto: AcademicPolicyDto) {
    const row = await this.settingsRow();
    const keys = (Object.keys(ACADEMIC_LABEL) as AcademicKey[]).filter((k) => dto[k] !== undefined);
    if (keys.length)
      await this.db.$transaction(async (tx) => {
        await tx.schoolSettings.update({
          where: { schoolId: this.schoolId() },
          data: Object.fromEntries(keys.map((k) => [k, dto[k]])),
        });
        await this.log(
          keys.map((k) => ({
            area: 'Academic' as const,
            setting: ACADEMIC_LABEL[k],
            from: onOff(row[k]),
            to: onOff(dto[k]!),
          })),
          asTx(tx),
        );
      });
    return this.academic();
  }

  /* ---------------- Finance ---------------- */

  async finance() {
    const row = await this.db.financeSettings.findFirst({
      select: { allowPartial: true, autoSibling: true, verifyTransfers: true },
    });
    // Defaults as the column defaults, until Finance saves its first settings.
    return {
      allowPartial: row?.allowPartial ?? true,
      autoSibling: row?.autoSibling ?? true,
      verifyTransfers: row?.verifyTransfers ?? true,
    };
  }

  async saveFinance(dto: FinanceTogglesDto) {
    const before = await this.finance();
    const keys = (Object.keys(FINANCE_LABEL) as FinanceKey[]).filter((k) => dto[k] !== undefined);
    if (keys.length) {
      const schoolId = this.schoolId();
      const data = Object.fromEntries(keys.map((k) => [k, dto[k]]));
      await this.db.$transaction(async (tx) => {
        await tx.financeSettings.upsert({
          where: { schoolId },
          create: { schoolId, ...data },
          update: data,
        });
        await this.log(
          keys.map((k) => ({
            area: 'Finance' as const,
            setting: FINANCE_LABEL[k],
            from: onOff(before[k]),
            to: onOff(dto[k]!),
          })),
          asTx(tx),
        );
      });
    }
    return this.finance();
  }

  /* ---------------- Subscription & modules ---------------- */

  private async subscriptionRow() {
    const sub = await this.db.subscription.findFirst({ include: { plan: true } });
    if (!sub)
      throw AppException.notFound(
        'Your school has no subscription yet. Contact EduTrack.',
        'NO_SUBSCRIPTION',
      );
    return sub;
  }

  /** The plan, renewal and usage. Read-only: renewing and changing plan go through Support. */
  async subscription() {
    const sub = await this.subscriptionRow();
    // The plan's SMS units for the term are credited the first time anyone looks this term.
    await this.ledger.addTermAllowance(RequestContext.schoolId()!);
    const today = lagosToday(this.clock.now());
    const days = daysBetween(today, sub.renewsOn);
    const term = await this.catalog.currentTerm();
    const [students, branches, staffAccounts, comms, used] = await Promise.all([
      this.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
      this.db.branch.count({ where: { status: 'ACTIVE' } }),
      this.db.schoolMembership.count({
        where: { kind: 'STAFF', status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] } },
      }),
      this.db.communicationSettings.findFirst({
        select: { senderId: true, senderIdStatus: true, smsBalanceUnits: true },
      }),
      term
        ? this.db.smsCreditTransaction.aggregate({
            where: { termId: term.id, kind: { in: ['USAGE', 'REFUND'] } },
            _sum: { units: true },
          })
        : null,
    ]);
    const plan = sub.plan;
    return {
      plan: plan.name,
      cycle: 'Annual' as const,
      price: annualNaira(sub.priceKobo, sub.billingPeriod),
      startedOn: isoDate(sub.startedOn),
      renewsOn: isoDate(sub.renewsOn),
      daysToRenewal: days,
      status: schoolSubscriptionStatus(sub.status, days),
      billingContact: sub.billingContactName ?? '',
      usage: {
        students,
        studentLimit: plan.studentLimit ?? 0,
        branches,
        branchLimit: plan.branchLimit ?? UNLIMITED_BRANCHES,
        staffAccounts,
        smsUnits: comms?.smsBalanceUnits ?? 0,
        smsUsedThisTerm: Math.max(0, -(used?._sum.units ?? 0)),
        senderId: comms?.senderId ?? '',
        senderIdStatus: SENDER_ID_STATUS[comms?.senderIdStatus ?? 'NOT_REQUESTED'],
      },
      modules: PLAN_MODULES.filter((m) => !m.comingSoon).map((m) => ({
        name: m.name,
        included: Boolean(m.core) || plan.modules.includes(m.id),
      })),
    };
  }

  /** Every module in the catalog: on the plan, not on it, or coming soon. */
  async modules() {
    const { plan } = await this.subscriptionRow();
    return PLAN_MODULES.map((m) => ({
      name: m.name,
      covers: m.description,
      status: m.comingSoon
        ? ('Coming soon' as const)
        : m.core || plan.modules.includes(m.id)
          ? ('Active' as const)
          : ('Not on plan' as const),
    }));
  }

  /* ---------------- History ---------------- */

  async history(area?: SettingsArea | '') {
    const events = await this.db.auditEvent.findMany({
      where: {
        action: SETTINGS_ACTION,
        area: area ? area : { in: [...SETTINGS_AREAS] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const value = (json: unknown, key: string) =>
      json && typeof json === 'object' && key in json
        ? String((json as Record<string, unknown>)[key])
        : '';
    return events.map((e) => ({
      id: e.id,
      area: e.area as SettingsArea,
      setting: value(e.before, 'setting') || value(e.after, 'setting'),
      from: value(e.before, 'value'),
      to: value(e.after, 'value'),
      by: e.actorName ?? 'EduTrack',
      at: e.createdAt.toISOString(),
    }));
  }
}
