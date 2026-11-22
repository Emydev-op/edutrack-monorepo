import { buildTemplate, importText } from '../shared/excel-template.js';
import { Injectable } from '@nestjs/common';
import { Clock, HOUR } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import type { StaffImportDto } from './dto/staff.dto.js';
import { StaffAccountsService } from './staff-accounts.service.js';
import { asAuditDb, plural, withNotice } from './staff-audit.js';
import { isUuid, StaffRecordsService } from './staff-records.service.js';
import {
  defaultRole,
  EMAIL,
  GROUP_OF,
  groupOf,
  isPhone,
  KIND_OF,
  parseCsv,
  POSITIONS,
  toE164,
  unprocessable,
  type KindLabel,
} from './staff-view.js';

/** A validated import waits this long for "Import" before it has to be uploaded again. */
const BATCH_TTL_MS = 24 * HOUR;
const EXPIRED = 'This import has expired. Upload the file again.';

export interface StaffImportRowView {
  line: number;
  name: string;
  email: string;
  phone: string;
  kind: KindLabel | '';
  position: string;
  branch: string;
  access: boolean;
  role: string;
  errors: string[];
  warnings: string[];
}

/**
 * CSV import of staff: the preview parses and checks every row (as the mock does) and keeps the
 * result as an `ImportBatch`; committing creates the valid rows, with staff numbers from the
 * school's format and invitations for rows that asked for portal access.
 */
@Injectable()
export class StaffImportService {
  constructor(
    private readonly records: StaffRecordsService,
    private readonly accounts: StaffAccountsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.records.db;
  }

  /**
   * `GET /v1/staff/import/template`: the staff template as an Excel workbook, with dropdowns of
   * the school's own options on every row: staff type, branch, portal access and role.
   */
  async template(): Promise<Buffer> {
    const [branches, roles] = await Promise.all([
      this.db.branch.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { name: true },
      }),
      this.db.schoolRole.findMany({
        where: { archivedAt: null, NOT: { key: 'owner' } },
        orderBy: { name: 'asc' },
        select: { name: true },
      }),
    ]);
    const branch = branches[0]?.name ?? 'Main Campus';
    return buildTemplate(
      'Staff',
      [
        { header: 'first_name', width: 16 },
        { header: 'last_name', width: 16 },
        { header: 'email', width: 26, hint: 'Needed for portal access (the invitation)' },
        { header: 'phone', width: 16, hint: 'A Nigerian number, e.g. 0803 555 0161' },
        { header: 'type', options: ['Teaching', 'Non-teaching'], width: 14 },
        { header: 'position', width: 18, hint: 'e.g. Teacher, Bursar, Driver' },
        { header: 'branch', options: branches.map((b) => b.name), width: 18 },
        { header: 'portal_access', options: ['Yes', 'No'], width: 14 },
        { header: 'role', options: roles.map((r) => r.name), width: 18 },
      ],
      [
        [
          'Grace',
          'Okafor',
          'g.okafor@school.ng',
          '0803 555 0161',
          'Teaching',
          'Teacher',
          branch,
          'Yes',
          'Teacher',
        ],
        ['Samuel', 'Ade', '', '0802 555 0199', 'Non-teaching', 'Driver', branch, 'No', ''],
      ],
    );
  }

  async preview(dto: StaffImportDto) {
    if (!/\.(csv|xlsx)$/i.test(dto.fileName ?? ''))
      throw unprocessable('Upload the .xlsx or .csv template.', 'IMPORT_FORMAT');
    const rows = parseCsv(await importText(dto.fileName, dto.text ?? ''));
    if (rows.length < 2)
      throw unprocessable(
        'The file has no staff rows. Use the template’s columns.',
        'IMPORT_EMPTY',
      );
    if (rows.length > 1001)
      throw unprocessable(
        'Import up to 1,000 staff at a time. Split the file and try again.',
        'IMPORT_TOO_LONG',
      );
    const head = rows[0]!.map((h) => h.trim().toLowerCase());
    const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim();
    const need = ['first_name', 'last_name', 'type', 'position', 'branch'];
    const missing = need.filter((k) => !head.includes(k));
    if (missing.length)
      throw unprocessable(
        `Missing columns: ${missing.join(', ')}. Download the template.`,
        'IMPORT_COLUMNS',
      );

    const [branches, staff, roles] = await Promise.all([
      this.db.branch.findMany({ where: { status: 'ACTIVE' }, select: { name: true } }),
      this.db.staff.findMany({ select: { email: true } }),
      this.db.schoolRole.findMany({ where: { archivedAt: null }, select: { name: true } }),
    ]);
    const taken = new Set(staff.map((s) => s.email?.toLowerCase()).filter(Boolean));
    const seenEmail = new Set<string>();
    const out: StaffImportRowView[] = rows.slice(1).map((r, i) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const first = col(r, 'first_name');
      const last = col(r, 'last_name');
      const email = col(r, 'email').toLowerCase();
      const phone = col(r, 'phone');
      const type = col(r, 'type');
      const kind: KindLabel | '' = /^teaching$/i.test(type)
        ? 'Teaching'
        : /^non-?teaching$/i.test(type)
          ? 'Non-teaching'
          : '';
      const position = col(r, 'position');
      const branch = col(r, 'branch');
      const access = /^(yes|y|true|1)$/i.test(col(r, 'portal_access'));
      const role = col(r, 'role');
      if (!first || !last) errors.push('first and last name are required');
      if (!kind) errors.push('type must be Teaching or Non-teaching');
      if (!position) errors.push('position is required');
      if (!branches.some((b) => b.name.toLowerCase() === branch.toLowerCase()))
        errors.push(`unknown branch “${branch}”`);
      if (email && !EMAIL.test(email)) errors.push('email is not valid');
      if (email && (seenEmail.has(email) || taken.has(email))) errors.push('email already used');
      if (email) seenEmail.add(email);
      if (phone && !isPhone(phone)) errors.push('phone is not a Nigerian mobile number');
      if (access && !email) errors.push('portal access needs an email');
      if (access && role && !roles.some((x) => x.name.toLowerCase() === role.toLowerCase()))
        errors.push(`unknown role “${role}”`);
      if (access && !role && !defaultRole(position, kind))
        errors.push('portal access needs a role for this position');
      if (!access) warnings.push('no portal access');
      if (position && !(POSITIONS as readonly string[]).includes(position))
        warnings.push('position not in the standard list');
      return {
        line: i + 2,
        name: `${first} ${last}`.trim(),
        email,
        phone,
        kind,
        position,
        branch,
        access,
        role,
        errors,
        warnings,
      };
    });
    const batch = await this.db.importBatch.create({
      data: {
        schoolId: this.records.schoolId(),
        kind: 'STAFF',
        fileName: dto.fileName,
        rowCount: out.length,
        validCount: out.filter((r) => !r.errors.length).length,
        rows: out as unknown as Prisma.InputJsonValue,
        issues: out.flatMap((r) => [
          ...r.errors.map((message) => ({ row: r.line, kind: 'error', message })),
          ...r.warnings.map((message) => ({ row: r.line, kind: 'warning', message })),
        ]),
        createdById: RequestContext.get()?.userId ?? null,
      },
    });
    return { id: batch.id, fileName: batch.fileName, rows: out };
  }

  async commit(id: string) {
    const batch = isUuid(id)
      ? await this.db.importBatch.findFirst({ where: { id, kind: 'STAFF' } })
      : null;
    if (
      !batch ||
      batch.status !== 'VALIDATED' ||
      this.clock.nowMs() - batch.createdAt.getTime() > BATCH_TTL_MS
    )
      throw AppException.notFound(EXPIRED, 'IMPORT_EXPIRED');
    const rows = batch.rows as unknown as StaffImportRowView[];
    const ok = rows.filter((r) => !r.errors.length);
    if (!ok.length)
      throw unprocessable(
        'Every row has an error. Fix the file and upload it again.',
        'IMPORT_NOTHING_VALID',
      );
    const schoolId = this.records.schoolId();
    const [branches, roles] = await Promise.all([
      this.db.branch.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      this.db.schoolRole.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, key: true },
      }),
    ]);

    const { imported, toSend } = await this.db.$transaction(async (tx) => {
      // Checked again: someone may have added the same people since the preview.
      const taken = new Set(
        (await tx.staff.findMany({ where: { email: { not: null } }, select: { email: true } })).map(
          (s) => s.email!.toLowerCase(),
        ),
      );
      let imported = 0;
      const toSend: string[] = [];
      for (const r of ok) {
        const branch = branches.find((b) => b.name.toLowerCase() === r.branch.toLowerCase());
        if (!branch || (r.email && taken.has(r.email))) continue;
        const kind = r.kind as KindLabel;
        const [firstName = '', ...rest] = r.name.split(' ');
        const staff = await tx.staff.create({
          data: {
            schoolId,
            staffNumber: await this.records.nextStaffNumber(tx),
            firstName,
            lastName: rest.join(' '),
            email: r.email || null,
            phone: r.phone ? toE164(r.phone) : null,
            positionTitle: r.position,
            kind: KIND_OF[kind],
            group: GROUP_OF[groupOf(kind, r.position)],
            employment: 'FULL_TIME',
            startedOn: this.records.today(),
            allBranches: false,
            maxPeriodsPerWeek: kind === 'Teaching' ? 28 : 0,
          },
        });
        await tx.staffBranch.create({
          data: { schoolId, staffId: staff.id, branchId: branch.id },
        });
        if (r.email) taken.add(r.email);
        imported++;
        if (r.access) {
          const roleName = r.role || defaultRole(r.position, kind);
          const role = roles.find(
            (x) => x.key !== 'owner' && x.name.toLowerCase() === roleName?.toLowerCase(),
          );
          if (role)
            try {
              toSend.push(
                await this.accounts.createInvitation(tx, { ...staff, branchIds: [branch.id] }, [
                  role.id,
                ]),
              );
            } catch (error) {
              // The email already has an account here: the record is imported without one.
              if (!(error instanceof AppException && error.code === 'ALREADY_MEMBER')) throw error;
            }
        }
        await this.audit.record(
          {
            action: 'staff.create',
            area: 'Staff',
            entity: 'Staff',
            entityId: staff.id,
            summary: `Added as ${r.position}`,
            detail: `Imported from ${batch.fileName}`,
          },
          asAuditDb(tx),
        );
      }
      const result = { imported, invites: toSend.length, skipped: rows.length - imported };
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'COMMITTED', committedAt: this.clock.now(), result },
      });
      await this.audit.record(
        {
          action: 'staff.import',
          area: 'Staff',
          entity: 'Staff',
          summary: `Imported ${imported} staff from ${batch.fileName}`,
          detail: `${plural(toSend.length, 'invitation')} sent`,
        },
        asAuditDb(tx),
      );
      return { imported, toSend };
    });
    await this.accounts.send(toSend);
    const result = { imported, invites: toSend.length, skipped: rows.length - imported };
    return withNotice(
      result,
      `${imported} staff imported.${result.invites ? ` ${plural(result.invites, 'invitation')} sent.` : ''}`,
    );
  }
}
