import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/**
 * Which academic sections the signed-in admin manages. Many Nigerian schools give each section
 * its own head or admin: one person runs Nursery, another Primary, two share Junior and Senior
 * Secondary. A section admin sees the whole school (to coordinate), but only changes their own
 * sections' class levels and arms, subjects, curriculum, teachers' assignments and timetables.
 * School-wide settings (the sections themselves, shared subjects) stay with whole-school admins.
 */
@Injectable()
export class SectionAccessService {
  constructor(private readonly tenant: TenantPrismaService) {}

  /** The section ids this admin manages, or null for every section (a whole-school admin). */
  async mine(): Promise<Set<string> | null> {
    const membershipId = RequestContext.get()?.membershipId;
    if (!membershipId) return null;
    const rows = await this.tenant.db.membershipSection.findMany({
      where: { membershipId },
      select: { sectionId: true },
    });
    return rows.length ? new Set(rows.map((r) => r.sectionId)) : null;
  }

  /** Whether this admin may change things in a section (null: a school-wide thing). */
  async can(sectionId: string | null | undefined): Promise<boolean> {
    const mine = await this.mine();
    if (!mine) return true;
    return !!sectionId && mine.has(sectionId);
  }

  /** 403 unless this admin manages the section. */
  async require(sectionId: string | null | undefined, what = 'this') {
    if (await this.can(sectionId)) return;
    const name = sectionId
      ? (
          await this.tenant.db.section.findFirst({
            where: { id: sectionId },
            select: { name: true },
          })
        )?.name
      : null;
    throw new AppException(
      HttpStatus.FORBIDDEN,
      name
        ? `You manage other sections, so you can’t change ${what} in ${name}. Ask a whole-school admin or ${name}’s admin.`
        : `Only a whole-school admin can change ${what}.`,
      'SECTION_FORBIDDEN',
    );
  }

  /** 403 unless this admin manages the section of a class level. */
  async requireLevel(levelId: string, what = 'this class') {
    const level = await this.tenant.db.classLevel.findFirst({
      where: { id: levelId },
      select: { sectionId: true },
    });
    await this.require(level?.sectionId, what);
  }

  /** 403 unless this admin manages the section of an arm. */
  async requireArm(armId: string, what = 'this class') {
    const arm = await this.tenant.db.classArm.findFirst({
      where: { id: armId },
      select: { level: { select: { sectionId: true } } },
    });
    await this.require(arm?.level.sectionId, what);
  }
}
