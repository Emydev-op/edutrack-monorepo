import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { defaultStudentLogins } from '../student-logins/student-login-rules.js';
import { asTx } from '../shared/tenant-tx.js';
import { fail } from './academic-format.js';
import {
  ACADEMIC_STEP,
  AcademicStructureService,
  type AcademicSectionView,
} from './academic-structure.service.js';
import type { SectionInputDto } from './dto/academics.dto.js';

export interface SectionsView {
  sections: AcademicSectionView[];
  confirmed: boolean;
}

const CODE = /^[A-Z]{2,5}$/;

/** Academics › Sections: the sections the school runs, in promotion order. */
@Injectable()
export class SectionsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
    private readonly audit: SchoolAuditService,
  ) {}

  async view(): Promise<SectionsView> {
    const [sections, confirmed] = await Promise.all([
      this.structure.sectionViews(),
      this.structure.confirmedKeys(),
    ]);
    return { sections, confirmed: confirmed.has(ACADEMIC_STEP.sections) };
  }

  /**
   * Replaces the list: renames keep classes, branches and everything else attached (they hang off
   * the section's id); removed sections leave their branches; a section with class levels can't go.
   */
  async save(schoolId: string, input: SectionInputDto[]): Promise<SectionsView> {
    if (!input.length) throw fail('Add at least one section.', 'SECTIONS_REQUIRED');
    const names = new Set<string>();
    const codes = new Set<string>();
    const rows = input.map((s) => {
      const name = (s.name ?? '').trim();
      if (!name) throw fail('Name every section.', 'VALIDATION');
      if (names.has(name.toLowerCase()))
        throw fail(`Two sections are called “${name}”.`, 'SECTION_NAME_TAKEN');
      names.add(name.toLowerCase());
      if (!CODE.test(s.code ?? ''))
        throw fail(`${name}: use a 2–5 letter code in capitals, e.g. JSS.`, 'VALIDATION');
      if (codes.has(s.code))
        throw fail(`Two sections use the code ${s.code}.`, 'SECTION_CODE_TAKEN');
      codes.add(s.code);
      return {
        id: s.id,
        name,
        code: s.code,
        description: (s.description ?? '').trim(),
        studentLogins: s.studentLogins,
      };
    });

    const existing = await this.tenant.db.section.findMany({
      include: { _count: { select: { levels: true } } },
    });
    const keptIds = new Set(
      rows.map((r) => r.id).filter((id): id is string => existing.some((e) => e.id === id)),
    );
    const removed = existing.filter((e) => !keptIds.has(e.id));
    const blocked = removed.filter((s) => s._count.levels > 0);
    if (blocked.length)
      throw fail(
        `${blocked.map((s) => s.name).join(', ')} still ${blocked.length > 1 ? 'have' : 'has'} classes. Remove its class levels in Classes & Arms first.`,
        'SECTION_HAS_CLASSES',
      );

    await this.tenant.db.$transaction(async (tx) => {
      if (removed.length) {
        const ids = removed.map((s) => s.id);
        await tx.branchSection.deleteMany({ where: { sectionId: { in: ids } } });
        await tx.section.deleteMany({ where: { id: { in: ids } } });
      }
      // Park kept rows on placeholder names and codes so swaps don't trip the unique keys.
      for (const id of keptIds)
        await tx.section.update({
          where: { id },
          data: { name: `~${id}`, code: `~${id.slice(-8)}` },
        });
      for (const [i, r] of rows.entries()) {
        const data = { name: r.name, code: r.code, description: r.description, sortOrder: i };
        // Older clients don't send the flag: kept sections keep theirs, new ones get the default.
        if (r.id && keptIds.has(r.id))
          await tx.section.update({
            where: { id: r.id },
            data: {
              ...data,
              ...(r.studentLogins !== undefined && { studentLogins: r.studentLogins }),
            },
          });
        else
          await tx.section.create({
            data: {
              schoolId,
              ...data,
              studentLogins: r.studentLogins ?? defaultStudentLogins(r.code),
            },
          });
      }
      await this.audit.record(
        {
          action: 'sections.save',
          area: 'Academic',
          entity: 'Section',
          summary: 'Academic sections saved',
          detail: rows.map((r) => r.code).join(' · '),
          before: { sections: existing.map((s) => `${s.name} (${s.code})`) },
          after: { sections: rows.map((r) => `${r.name} (${r.code})`) },
        },
        asTx(tx),
      );
    });
    return this.view();
  }
}
