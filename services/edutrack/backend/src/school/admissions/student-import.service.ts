import { Injectable } from '@nestjs/common';
import { Clock, HOUR } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Gender } from '../../generated/prisma/enums.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asAuditDb, plural, withNotice } from '../staff/staff-audit.js';
import { isUuid } from '../staff/staff-records.service.js';
import { EMAIL, parseCsv, toE164, unprocessable } from '../staff/staff-view.js';
import {
  AdmissionRecordsService,
  type ArmPlace,
  type Placement,
} from './admission-records.service.js';
import {
  birthProblem,
  isoDay,
  normalise,
  ON_ROLL,
  parseDay,
  squash,
  stateOf,
} from './admissions-view.js';
import type { StudentImportCommitDto, StudentImportDto } from './dto/admissions.dto.js';

/** A validated import waits this long for "Import" before it has to be uploaded again. */
const BATCH_TTL_MS = 24 * HOUR;
const EXPIRED = 'This import has expired. Upload the file again.';
const MAX_ROWS = 5000;

/** The template's columns (School Admin's Import students screen). */
const COLUMNS = {
  surname: 'surname',
  firstName: 'first_name',
  otherNames: 'other_names',
  gender: 'gender',
  dob: 'date_of_birth',
  level: 'class_level',
  arm: 'arm',
  guardianName: 'guardian_name',
  guardianPhone: 'guardian_phone',
  guardianEmail: 'guardian_email',
  relationship: 'relationship',
  state: 'state_of_origin',
  previousSchool: 'previous_school',
  branch: 'branch',
} as const;
const REQUIRED = ['surname', 'first_name', 'gender', 'date_of_birth', 'class_level', 'arm'];

/** One row of the file as uploaded (kept on the batch; the commit checks it again). */
export type ImportRow = { line: number } & Record<keyof typeof COLUMNS, string>;

type IssueCode = 'class' | 'dob' | 'duplicate' | 'no-guardian' | 'guardian-match' | 'invalid';
export interface ImportIssue {
  row: number;
  student: string;
  kind: 'error' | 'warning';
  code: IssueCode;
  message: string;
  suggestion?: string;
  value?: string;
}

type GuardianPlan =
  | { kind: 'none' }
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new'; key: string; fullName: string; phone: string | null; email: string | null };

/** What a row turns into, once checked. */
interface RowPlan {
  row: ImportRow;
  name: string;
  errors: {
    code: 'class' | 'dob' | 'invalid';
    message: string;
    suggestion?: string;
    value?: string;
  }[];
  warning: { code: IssueCode; message: string } | null;
  arm: ArmPlace | null;
  birth: Date | null;
  gender: Gender | null;
  guardian: GuardianPlan;
  /** The existing guardian an email matched ("link" by default, "new" on request). */
  emailMatch: { id: string; name: string } | null;
}

/** Fixes chosen on the review screen, by row. */
interface Fixes {
  classFix: Map<number, string>;
  forceNewGuardian: Set<number>;
}

/** Everything a check needs to know about the school. */
interface CheckContext {
  placement: Placement;
  defaultBranchId: string | null;
  today: Date;
  /** "first|surname|YYYY-MM-DD" → the student on roll with that name and birthday. */
  students: Map<string, { admissionNo: string; className: string }>;
  byPhone: Map<string, { id: string; name: string }>;
  byEmail: Map<string, { id: string; name: string }>;
}

const studentKey = (first: string, surname: string, birth: Date) =>
  `${normalise(first)}|${normalise(surname)}|${isoDay(birth)}`;

/**
 * CSV import of students with their guardians: the preview checks every row against the classes,
 * existing students and guardians and keeps the file as an `ImportBatch`; the commit applies the
 * fixes chosen on the review screen, checks every row again and creates the students (admission
 * numbers, guardians, links, enrollments) in one transaction. No accounts or invitations.
 */
@Injectable()
export class StudentImportService {
  constructor(
    private readonly records: AdmissionRecordsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.records.db;
  }

  async preview(dto: StudentImportDto) {
    if (/\.xlsx$/i.test(dto.fileName))
      throw unprocessable(
        'Save the sheet as CSV (File › Save as › CSV) and upload that file.',
        'IMPORT_FORMAT',
      );
    if (!/\.csv$/i.test(dto.fileName))
      throw unprocessable('Upload the .xlsx or .csv template.', 'IMPORT_FORMAT');
    const rows = this.parse(dto.text);
    const session = await this.records.requireSession();
    const ctx = await this.context(session.id, dto.branch);
    if (!ctx.defaultBranchId && rows.some((r) => !r.branch))
      throw unprocessable('Choose the branch to import into.', 'IMPORT_BRANCH', 'branch');
    // Rows without a branch go to the header's branch; the batch keeps it for the commit.
    const fallback = ctx.placement.branches.find((b) => b.id === ctx.defaultBranchId);
    for (const r of rows) if (!r.branch && fallback) r.branch = fallback.name;

    const plans = this.check(rows, ctx, { classFix: new Map(), forceNewGuardian: new Set() });
    const issues = plans.flatMap((p) => issueOf(p) ?? []);
    const ok = plans.filter((p) => !p.errors.length);
    const target = targetOf(session.name, ok.length ? ok : plans, ctx);
    const batch = await this.db.importBatch.create({
      data: {
        schoolId: this.records.schoolId(),
        kind: 'STUDENTS',
        fileName: dto.fileName,
        target,
        rowCount: rows.length,
        validCount: ok.length,
        rows: rows as unknown as Prisma.InputJsonValue,
        issues: issues as unknown as Prisma.InputJsonValue,
        createdById: RequestContext.get()?.userId ?? null,
      },
    });
    const counts = guardianCounts(ok);
    return {
      id: batch.id,
      fileName: batch.fileName,
      rows: rows.length,
      valid: ok.length,
      issues,
      guardiansNew: counts.created,
      guardiansLinked: counts.linked,
      target,
    };
  }

  async commit(id: string, dto: StudentImportCommitDto) {
    const batch = isUuid(id)
      ? await this.db.importBatch.findFirst({ where: { id, kind: 'STUDENTS' } })
      : null;
    if (
      !batch ||
      batch.status !== 'VALIDATED' ||
      this.clock.nowMs() - batch.createdAt.getTime() > BATCH_TTL_MS
    )
      throw AppException.notFound(EXPIRED, 'IMPORT_EXPIRED');
    const schoolId = this.records.schoolId();
    const session = await this.records.requireSession();

    // The fixes chosen on the review screen, read against the issue each row had.
    const resolutions = dto.resolutions ?? {};
    const previewIssues = new Map(
      (batch.issues as unknown as ImportIssue[]).map((i) => [i.row, i]),
    );
    const fixes: Fixes = { classFix: new Map(), forceNewGuardian: new Set() };
    const skipped = new Set<number>();
    const rows = (batch.rows as unknown as ImportRow[]).map((r) => {
      const choice = resolutions[String(r.line)]?.trim();
      const issue = previewIssues.get(r.line);
      if (!choice || !issue) return r;
      if (issue.code === 'class') fixes.classFix.set(r.line, choice);
      if (issue.code === 'dob') return { ...r, dob: choice };
      if (issue.code === 'duplicate' && choice === 'skip') skipped.add(r.line);
      if (issue.code === 'guardian-match' && choice === 'new') fixes.forceNewGuardian.add(r.line);
      return r;
    });

    const ctx = await this.context(session.id, null);
    const plans = this.check(
      rows.filter((r) => !skipped.has(r.line)),
      ctx,
      fixes,
    );
    const failing = plans.filter((p) => p.errors.length);
    if (failing.length && !dto.excludeErrors)
      throw unprocessable(
        `${failing.length} row${failing.length > 1 ? 's have' : ' has'} errors. Fix them or exclude them to continue.`,
        'IMPORT_HAS_ERRORS',
      );
    const ok = plans.filter((p) => !p.errors.length);
    if (!ok.length)
      throw unprocessable(
        'No rows are ready to import. Fix the file and upload it again.',
        'IMPORT_NOTHING_VALID',
      );

    const result = await this.db.$transaction(
      async (tx) => {
        // Places are checked again under lock: someone may have admitted students since.
        const wanted = new Map<string, { arm: ArmPlace; count: number }>();
        for (const p of ok) {
          const w = wanted.get(p.arm!.id) ?? { arm: p.arm!, count: 0 };
          w.count++;
          wanted.set(p.arm!.id, w);
        }
        await this.records.lockArms(tx, [...wanted.keys()]);
        for (const { arm, count } of wanted.values()) {
          const used = await this.records.armUsage(tx, session.id, arm.id);
          if (used + count > arm.capacity)
            throw AppException.conflict(
              `${arm.label} has ${Math.max(0, arm.capacity - used)} of ${arm.capacity} places left, ` +
                `not enough for ${plural(count, 'student')}. Upload the file again.`,
              'ARM_FULL',
            );
        }

        const nextNumber = await this.records.numberAllocator(tx);
        const createdGuardians = new Map<string, string>();
        let guardiansLinked = 0;
        const now = this.clock.now();
        for (const p of ok) {
          const arm = p.arm!;
          let guardianId: string | null = null;
          if (p.guardian.kind === 'existing') {
            guardianId = p.guardian.id;
            guardiansLinked++;
          } else if (p.guardian.kind === 'new') {
            guardianId = createdGuardians.get(p.guardian.key) ?? null;
            if (!guardianId) {
              const g = await tx.guardian.create({
                data: {
                  schoolId,
                  fullName: p.guardian.fullName,
                  phone: p.guardian.phone,
                  email: p.guardian.email,
                  contactConsentAt: now,
                  contactConsentSource: 'import',
                },
                select: { id: true },
              });
              guardianId = g.id;
              createdGuardians.set(p.guardian.key, g.id);
            }
          }
          const admissionNo = await nextNumber(arm.branchCode);
          const student = await tx.student.create({
            data: {
              schoolId,
              admissionNo,
              firstName: p.row.firstName,
              surname: p.row.surname,
              otherNames: p.row.otherNames || null,
              gender: p.gender!,
              dateOfBirth: p.birth,
              stateOfOrigin: p.row.state ? (stateOf(p.row.state) ?? p.row.state) : null,
              previousSchool: p.row.previousSchool || null,
              status: guardianId ? 'ACTIVE' : 'INCOMPLETE_PROFILE',
              admissionType: 'NEW_INTAKE',
              admittedOn: this.records.today(),
              admittedLevelId: arm.levelId,
              branchId: arm.branchId,
            },
            select: { id: true },
          });
          if (guardianId)
            await tx.studentGuardian.create({
              data: {
                schoolId,
                studentId: student.id,
                guardianId,
                relationship: p.row.relationship || 'Guardian',
                isPrimary: true,
                paysFees: true,
              },
            });
          await tx.enrollment.create({
            data: {
              schoolId,
              studentId: student.id,
              sessionId: session.id,
              branchId: arm.branchId,
              levelId: arm.levelId,
              armId: arm.id,
              enrolledOn: this.records.today(),
            },
          });
          await this.audit.record(
            {
              action: 'student.admit',
              area: 'Students',
              entity: 'Student',
              entityId: student.id,
              summary: `Admitted to ${arm.label}`,
              detail: `Imported from ${batch.fileName} · ${admissionNo}`,
            },
            asAuditDb(tx),
          );
        }
        const result = {
          batchId: batch.id,
          imported: ok.length,
          guardiansNew: createdGuardians.size,
          guardiansLinked,
        };
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'COMMITTED',
            committedAt: now,
            result: { ...result, skipped: batch.rowCount - ok.length },
          },
        });
        await this.audit.record(
          {
            action: 'student.import',
            area: 'Students',
            entity: 'ImportBatch',
            entityId: batch.id,
            summary: `Imported ${plural(ok.length, 'student')} from ${batch.fileName}`,
            detail: `${plural(createdGuardians.size, 'guardian')} added · ${guardiansLinked} linked to existing guardians`,
          },
          asAuditDb(tx),
        );
        return result;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return withNotice(
      result,
      `${plural(result.imported, 'student')} imported into ${batch.target ?? session.name}.`,
    );
  }

  /* ---------------- Reading the file ---------------- */

  private parse(text: string): ImportRow[] {
    const table = parseCsv((text ?? '').replace(/^﻿/, ''));
    if (table.length < 2)
      throw unprocessable(
        'The file has no student rows. Use the template’s columns.',
        'IMPORT_EMPTY',
      );
    if (table.length > MAX_ROWS + 1)
      throw unprocessable(
        'Import up to 5,000 students at a time. Split the file and try again.',
        'IMPORT_TOO_LONG',
      );
    // "date_of_birth* (DD/MM/YYYY)" and "Date of birth" both read as date_of_birth.
    const head = table[0]!.map((h) =>
      h
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/\*/g, '')
        .trim()
        .replace(/[\s-]+/g, '_'),
    );
    const missing = REQUIRED.filter((k) => !head.includes(k));
    if (missing.length)
      throw unprocessable(
        `Missing columns: ${missing.join(', ')}. Download the template.`,
        'IMPORT_COLUMNS',
      );
    return table.slice(1).map((cells, i) => {
      const row = { line: i + 2 } as ImportRow;
      for (const [field, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
        const at = head.indexOf(column);
        row[field] = at >= 0 ? (cells[at] ?? '').trim().replace(/\s+/g, ' ') : '';
      }
      return row;
    });
  }

  /** The school's facts the checks read: places, students on roll and guardians. */
  private async context(
    sessionId: string,
    branchName: string | null | undefined,
  ): Promise<CheckContext> {
    const [placement, students, guardians] = await Promise.all([
      this.records.placement(sessionId),
      this.db.student.findMany({
        where: { deletedAt: null, status: { in: ON_ROLL }, dateOfBirth: { not: null } },
        orderBy: { admittedOn: 'asc' },
        select: { id: true, firstName: true, surname: true, dateOfBirth: true, admissionNo: true },
      }),
      this.db.guardian.findMany({
        where: { deletedAt: null, mergedIntoId: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, fullName: true, phone: true, email: true },
      }),
    ]);
    const classes = await this.records.classNames(students.map((s) => s.id));
    const byKey = new Map<string, { admissionNo: string; className: string }>();
    for (const s of students) {
      const key = studentKey(s.firstName, s.surname, s.dateOfBirth!);
      if (!byKey.has(key))
        byKey.set(key, { admissionNo: s.admissionNo, className: classes.get(s.id) ?? '' });
    }
    const byPhone = new Map<string, { id: string; name: string }>();
    const byEmail = new Map<string, { id: string; name: string }>();
    for (const g of guardians) {
      if (g.phone && !byPhone.has(g.phone)) byPhone.set(g.phone, { id: g.id, name: g.fullName });
      const email = g.email?.toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, { id: g.id, name: g.fullName });
    }
    const named = branchName
      ? placement.branches.find((b) => normalise(b.name) === normalise(branchName))
      : undefined;
    const defaultBranchId =
      named?.id ?? (placement.branches.length === 1 ? placement.branches[0]!.id : null);
    return {
      placement,
      defaultBranchId: defaultBranchId ?? null,
      today: this.records.today(),
      students: byKey,
      byPhone,
      byEmail,
    };
  }

  /* ---------------- Checking rows ---------------- */

  private check(rows: ImportRow[], ctx: CheckContext, fixes: Fixes): RowPlan[] {
    const taken = new Map<string, number>();
    const seenStudents = new Map<string, number>();
    const fileGuardians = new Map<string, { fullName: string }>();
    return rows.map((row) => {
      const plan: RowPlan = {
        row,
        name: [row.firstName, row.surname].filter(Boolean).join(' ') || `Row ${row.line}`,
        errors: [],
        warning: null,
        arm: null,
        birth: null,
        gender: null,
        guardian: { kind: 'none' },
        emailMatch: null,
      };
      const invalid = (message: string) => plan.errors.push({ code: 'invalid', message });

      if (!row.surname || !row.firstName) invalid('surname and first name are required');
      plan.gender = /^(f|female|girl)$/i.test(row.gender)
        ? 'FEMALE'
        : /^(m|male|boy)$/i.test(row.gender)
          ? 'MALE'
          : null;
      if (!plan.gender) invalid('gender must be Female or Male');

      if (!row.dob)
        plan.errors.push({ code: 'dob', message: 'Date of birth is missing', value: '' });
      else {
        plan.birth = parseDay(row.dob);
        const problem = plan.birth ? birthProblem(plan.birth, ctx.today) : null;
        if (!plan.birth)
          plan.errors.push({
            code: 'dob',
            message: `Date "${row.dob}" does not exist`,
            value: row.dob,
          });
        else if (problem) {
          plan.errors.push({ code: 'dob', message: problem.replace(/\.$/, ''), value: row.dob });
          plan.birth = null;
        }
      }

      // Class: the level and arm at the row's branch (or the header's branch).
      const branch = row.branch
        ? ctx.placement.branches.find((b) => normalise(b.name) === normalise(row.branch))
        : ctx.placement.branches.find((b) => b.id === ctx.defaultBranchId);
      const typed = [row.level, row.arm].filter(Boolean).join(' ');
      if (!branch) invalid(row.branch ? `unknown branch “${row.branch}”` : 'branch is required');
      else if (!row.level) invalid('class level is required');
      else {
        const here = ctx.placement.arms.filter((a) => a.branchId === branch.id);
        const fix = fixes.classFix.get(row.line);
        const exact = fix
          ? here.find((a) => squash(a.label) === squash(fix))
          : here.find(
              (a) =>
                normalise(a.levelName) === normalise(row.level) &&
                normalise(a.name) === normalise(row.arm),
            );
        const close = exact ? null : here.find((a) => squash(a.label) === squash(typed));
        if (exact) plan.arm = exact;
        else if (close)
          plan.errors.push({
            code: 'class',
            message: `Class "${typed}" not found. Did you mean ${close.label}?`,
            suggestion: close.label,
          });
        else invalid(`class “${typed}” isn’t open at ${branch.name}`);
      }

      // Guardian: matched by phone (linked), by email (asked), or new.
      const phone = row.guardianPhone ? toE164(row.guardianPhone) : null;
      const email = row.guardianEmail ? row.guardianEmail.toLowerCase() : null;
      if (row.guardianPhone && !phone) invalid('guardian phone is not a Nigerian mobile number');
      if (email && !EMAIL.test(email)) invalid('guardian email is not valid');
      const byPhone = phone ? ctx.byPhone.get(phone) : undefined;
      if (byPhone) plan.guardian = { kind: 'existing', id: byPhone.id, name: byPhone.name };
      else if (row.guardianName || phone || email) {
        if (!row.guardianName) invalid('guardian name is required with a phone or email');
        const byEmail = email ? ctx.byEmail.get(email) : undefined;
        if (byEmail && !fixes.forceNewGuardian.has(row.line)) {
          plan.emailMatch = byEmail;
          plan.guardian = { kind: 'existing', id: byEmail.id, name: byEmail.name };
        } else {
          const key = phone ?? email ?? `row:${row.line}`;
          const known = fileGuardians.get(key);
          plan.guardian = {
            kind: 'new',
            key,
            fullName: known?.fullName ?? row.guardianName,
            phone,
            email,
          };
        }
        if (byEmail)
          plan.warning = {
            code: 'guardian-match',
            message: `Guardian email matches existing parent ${byEmail.name}`,
          };
      }

      // Places: rows without errors take them in file order.
      if (plan.arm && !plan.errors.length) {
        const used = plan.arm.used + (taken.get(plan.arm.id) ?? 0);
        if (used >= plan.arm.capacity)
          invalid(`${plan.arm.label} is full (${used} of ${plan.arm.capacity})`);
        else taken.set(plan.arm.id, (taken.get(plan.arm.id) ?? 0) + 1);
      }
      if (
        plan.guardian.kind === 'new' &&
        !plan.errors.length &&
        !fileGuardians.has(plan.guardian.key)
      )
        fileGuardians.set(plan.guardian.key, { fullName: plan.guardian.fullName });

      // Possible duplicates: a student on roll, or an earlier row, with the same name and birthday.
      if (plan.birth && row.firstName && row.surname) {
        const key = studentKey(row.firstName, row.surname, plan.birth);
        const existing = ctx.students.get(key);
        const earlier = seenStudents.get(key);
        if (existing)
          plan.warning = {
            code: 'duplicate',
            message: `Possible duplicate of ${existing.admissionNo} (${existing.className ? `${existing.className}, ` : ''}same name and date of birth)`,
          };
        else if (earlier)
          plan.warning = {
            code: 'duplicate',
            message: `Same name and date of birth as row ${earlier}`,
          };
        if (!earlier) seenStudents.set(key, row.line);
      }
      if (!plan.warning && !phone)
        plan.warning = {
          code: 'no-guardian',
          message: row.guardianName
            ? `No guardian phone. ${row.guardianName} is added without a phone number.`
            : 'No guardian details. The student will be imported without a guardian.',
        };
      return plan;
    });
  }
}

/** One issue per row (the review screen fixes rows one decision at a time). */
function issueOf(p: RowPlan): ImportIssue | null {
  const base = { row: p.row.line, student: p.name };
  if (p.errors.length === 1 && p.errors[0]!.code !== 'invalid') {
    const e = p.errors[0]!;
    return {
      ...base,
      kind: 'error',
      code: e.code,
      message: e.message,
      ...(e.suggestion !== undefined && { suggestion: e.suggestion }),
      ...(e.value !== undefined && { value: e.value }),
    };
  }
  if (p.errors.length) {
    const text = p.errors.map((e) => e.message).join('; ');
    return {
      ...base,
      kind: 'error',
      code: 'invalid',
      message: text.charAt(0).toUpperCase() + text.slice(1),
    };
  }
  return p.warning ? { ...base, kind: 'warning', ...p.warning } : null;
}

/**
 * Guardians the rows create and the rows linked to guardians already here. In the preview a
 * guardian matched by email counts as new until the screen chooses "link" (its default).
 */
function guardianCounts(plans: RowPlan[]) {
  const created = new Set<string>();
  let linked = 0;
  for (const p of plans) {
    if (p.emailMatch) created.add(`email:${p.emailMatch.id}`);
    else if (p.guardian.kind === 'new') created.add(p.guardian.key);
    else if (p.guardian.kind === 'existing') linked++;
  }
  return { created: created.size, linked };
}

/** "2026/2027 · Main Campus · JSS 1 intake" (or "· 3 classes" for a mixed file). */
function targetOf(session: string, plans: RowPlan[], ctx: CheckContext) {
  const arms = plans.flatMap((p) => p.arm ?? []);
  const branches = [...new Set(arms.map((a) => a.branchName))];
  if (!branches.length) {
    const fallback = ctx.placement.branches.find((b) => b.id === ctx.defaultBranchId);
    if (fallback) branches.push(fallback.name);
  }
  const levels = [...new Set(arms.map((a) => a.levelName))];
  return [
    session,
    branches.join(' + '),
    levels.length === 1 ? `${levels[0]} intake` : levels.length ? `${levels.length} classes` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
