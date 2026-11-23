import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock, HOUR } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { buildTemplate, importText } from '../shared/excel-template.js';
import { parseCsv } from '../staff/staff-view.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { AcademicStructureService } from './academic-structure.service.js';
import { ClassesService, levelKey } from './classes.service.js';

/** A checked import waits this long for "Import" before it has to be uploaded again. */
const BATCH_TTL_MS = 24 * HOUR;
const EXPIRED = 'This import has expired. Upload the file again.';
const ARM = /^[A-Za-z0-9][A-Za-z0-9 ]{0,11}$/;
const DEFAULT_CAPACITY = 40;

const unprocessable = (message: string, code: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);

export interface ClassImportRowView {
  line: number;
  branch: string;
  section: string;
  level: string;
  arm: string;
  capacity: number;
  room: string;
  classTeacher: string;
  /** The class teacher's staff id, once found. */
  classTeacherId: string | null;
  /** The level isn't at this branch yet: importing adds it. */
  newLevel: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Bulk upload of classes and arms (School Admin › Classes › Add › Bulk upload): one row per arm,
 * with its branch, section, class level, capacity, room and class teacher. A level new to a
 * branch is added (after the branch's other levels in file order); the arms go through the same
 * rules as adding them one by one.
 */
@Injectable()
export class ClassImportService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
    private readonly classes: ClassesService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** `GET /v1/academics/classes/import/template`: dropdowns of the school's branches and sections. */
  async template(): Promise<Buffer> {
    const branches = await this.structure.activeBranches();
    const sections = [...new Set(branches.flatMap((b) => b.sections))];
    const branch = branches[0]?.name ?? 'Main Campus';
    const section = branches[0]?.sections.find((s) => /junior/i.test(s)) ?? sections[0] ?? '';
    return buildTemplate(
      'Classes',
      [
        { header: 'branch', options: branches.map((b) => b.name), width: 18 },
        { header: 'section', options: sections, width: 20 },
        { header: 'class_level', width: 14, hint: 'e.g. JSS 1, Primary 4, Nursery 2' },
        { header: 'arm', width: 10, hint: 'A short name, e.g. A, B or Gold' },
        {
          header: 'capacity',
          width: 10,
          hint: `Places in the arm (1–100). Blank: ${DEFAULT_CAPACITY}`,
        },
        { header: 'room', width: 12, hint: 'Optional' },
        {
          header: 'class_teacher',
          width: 24,
          hint: 'Optional: the teacher’s email or staff number',
        },
      ],
      [
        [branch, section, 'JSS 1', 'A', '35', 'Room 4', ''],
        [branch, section, 'JSS 1', 'B', '35', 'Room 5', ''],
      ],
    );
  }

  async preview(dto: { fileName: string; text: string }) {
    if (!/\.(csv|xlsx)$/i.test(dto.fileName ?? ''))
      throw unprocessable('Upload the .xlsx or .csv template.', 'IMPORT_FORMAT');
    const rows = parseCsv(await importText(dto.fileName, dto.text ?? ''));
    if (rows.length < 2)
      throw unprocessable(
        'The file has no class rows. Use the template’s columns.',
        'IMPORT_EMPTY',
      );
    if (rows.length > 501)
      throw unprocessable(
        'Import up to 500 arms at a time. Split the file and try again.',
        'IMPORT_TOO_LONG',
      );
    const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\*$/, ''));
    const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim();
    const missing = ['branch', 'section', 'class_level', 'arm'].filter((k) => !head.includes(k));
    if (missing.length)
      throw unprocessable(
        `Missing columns: ${missing.join(', ')}. Download the template.`,
        'IMPORT_COLUMNS',
      );

    const [branches, levels, arms, staff] = await Promise.all([
      this.structure.activeBranches(),
      this.db.classLevel.findMany({
        include: {
          section: { select: { name: true } },
          branchLevels: { select: { branchId: true } },
        },
      }),
      this.db.classArm.findMany({
        where: { archivedAt: null },
        select: { branchId: true, levelId: true, name: true },
      }),
      this.db.staff.findMany({
        where: { status: 'ACTIVE', leftOn: null },
        select: { id: true, email: true, staffNumber: true, kind: true },
      }),
    ]);
    const seen = new Set<string>();
    const out: ClassImportRowView[] = rows.slice(1).map((r, i) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const branchName = col(r, 'branch');
      const sectionName = col(r, 'section');
      const levelName = col(r, 'class_level').replace(/\s+/g, ' ');
      const arm = col(r, 'arm');
      const capacityText = col(r, 'capacity');
      const capacity = capacityText ? Number(capacityText) : DEFAULT_CAPACITY;
      const teacher = col(r, 'class_teacher');
      const branch = branches.find((b) => b.name.toLowerCase() === branchName.toLowerCase());
      const section = branch?.sections.find((s) => s.toLowerCase() === sectionName.toLowerCase());
      if (!branch) errors.push(`unknown branch “${branchName}”`);
      else if (!section) errors.push(`${branch.name} doesn’t run “${sectionName}”`);
      if (!levelName) errors.push('class_level is required');
      else if (levelName.length > 40) errors.push('class_level is longer than 40 characters');
      if (!ARM.test(arm)) errors.push('arm must be a short name, e.g. A, B or Gold');
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)
        errors.push('capacity must be a whole number from 1 to 100');
      const level = levels.find((l) => l.name.toLowerCase() === levelName.toLowerCase());
      if (level && section && level.section.name !== section)
        errors.push(`${level.name} is a ${level.section.name} class level, not ${section}`);
      const atBranch = !!(
        level &&
        branch &&
        level.branchLevels.some((b) => b.branchId === branch.id)
      );
      if (
        level &&
        branch &&
        arms.some(
          (a) =>
            a.branchId === branch.id &&
            a.levelId === level.id &&
            a.name.toLowerCase() === arm.toLowerCase(),
        )
      )
        errors.push(`${level.name} ${arm} already exists at ${branch.name}`);
      const key = `${branch?.id}|${levelName.toLowerCase()}|${arm.toLowerCase()}`;
      if (seen.has(key)) errors.push('this arm is in the file twice');
      seen.add(key);
      let classTeacherId: string | null = null;
      if (teacher) {
        const t = staff.find(
          (s) =>
            s.email?.toLowerCase() === teacher.toLowerCase() ||
            s.staffNumber.toLowerCase() === teacher.toLowerCase(),
        );
        if (!t) errors.push(`no active staff member “${teacher}”`);
        else if (t.kind !== 'TEACHING') errors.push(`${teacher} isn’t teaching staff`);
        else classTeacherId = t.id;
      }
      if (levelName && branch && !atBranch) warnings.push(`adds ${levelName} at ${branch.name}`);
      return {
        line: i + 2,
        branch: branch?.name ?? branchName,
        section: section ?? sectionName,
        level: level?.name ?? levelName,
        arm,
        capacity,
        room: col(r, 'room'),
        classTeacher: teacher,
        classTeacherId,
        newLevel: !atBranch,
        errors,
        warnings,
      };
    });
    const batch = await this.db.importBatch.create({
      data: {
        schoolId: RequestContext.schoolId()!,
        kind: 'CLASSES',
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

  /**
   * Adds the valid rows in file order, each through the same rules as adding it by hand. A row
   * that fails then (say a class teacher who has another class) is skipped with its reason.
   */
  async commit(id: string) {
    const batch = isUuid(id)
      ? await this.db.importBatch.findFirst({ where: { id, kind: 'CLASSES' } })
      : null;
    if (
      !batch ||
      batch.status !== 'VALIDATED' ||
      this.clock.nowMs() - batch.createdAt.getTime() > BATCH_TTL_MS
    )
      throw AppException.notFound(EXPIRED, 'IMPORT_EXPIRED');
    const rows = batch.rows as unknown as ClassImportRowView[];
    const ok = rows.filter((r) => !r.errors.length);
    if (!ok.length)
      throw unprocessable(
        'Every row has an error. Fix the file and upload it again.',
        'IMPORT_NOTHING_VALID',
      );
    const schoolId = RequestContext.schoolId()!;
    let imported = 0;
    let levels = 0;
    const skipped: { line: number; reason: string }[] = [];
    for (const r of ok) {
      try {
        const branch = (await this.structure.activeBranches()).find((b) => b.name === r.branch);
        if (!branch) throw unprocessable(`${r.branch} isn’t active any more.`, 'BRANCH_NOT_ACTIVE');
        const level = await this.db.classLevel.findFirst({
          where: {
            name: { equals: r.level, mode: 'insensitive' },
            branchLevels: { some: { branchId: branch.id } },
          },
        });
        if (!level) {
          await this.classes.addLevel(schoolId, {
            branchId: branch.id,
            section: r.section,
            name: r.level,
            arms: [r.arm],
            capacity: r.capacity,
          });
          levels++;
          if (r.room || r.classTeacherId) {
            const arm = await this.db.classArm.findFirstOrThrow({
              where: {
                branchId: branch.id,
                level: { name: { equals: r.level, mode: 'insensitive' } },
                name: r.arm,
                archivedAt: null,
              },
            });
            await this.classes.updateArm(schoolId, arm.id, {
              ...(r.room && { room: r.room }),
              ...(r.classTeacherId && { classTeacherId: r.classTeacherId }),
            });
          }
        } else
          await this.classes.addArm(schoolId, levelKey(level.id, branch.id), {
            arm: r.arm,
            capacity: r.capacity,
            ...(r.room && { room: r.room }),
            ...(r.classTeacherId && { classTeacherId: r.classTeacherId }),
          });
        imported++;
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        skipped.push({ line: r.line, reason: error.message });
      }
    }
    const result = { imported, levels, skipped: rows.length - imported, problems: skipped };
    await this.db.importBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED', committedAt: this.clock.now(), result },
    });
    await this.audit.record({
      action: 'classes.import',
      area: 'Academic',
      entity: 'ClassArm',
      summary: `Imported ${imported} arm${imported === 1 ? '' : 's'} from ${batch.fileName}`,
      detail: levels ? `${levels} new class level${levels === 1 ? '' : 's'}` : null,
    });
    return result;
  }
}
