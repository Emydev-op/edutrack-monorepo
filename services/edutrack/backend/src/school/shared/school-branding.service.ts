import { Injectable } from '@nestjs/common';
import { DEFAULT_BRAND_COLOR, type PublicSchool } from '@edutrack/shared';
import { schoolLogoAddress } from '../../auth/auth.presenter.js';
import { initialsOf } from '../../auth/identifiers.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';

/** Logo links are signed; an hour covers a long session on one page. */
const LOGO_LINK_SECONDS = 3600;

/** A school's public face: name, motto, colour and logo. Used by the entry page and sign-in. */
@Injectable()
export class SchoolBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Signed link to a stored logo, or null (no logo, deleted, or storage unreachable). */
  async logoUrl(file: { storageKey: string; deletedAt: Date | null } | null | undefined) {
    if (!file || file.deletedAt) return null;
    return this.storage.getDownloadUrl(file.storageKey, LOGO_LINK_SECONDS).catch(() => null);
  }

  /** A fresh signed link to the logo of the school with this slug, or null. */
  async logoLinkBySlug(slug: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      select: { logoFile: { select: { storageKey: true, deletedAt: true } } },
    });
    return this.logoUrl(school?.logoFile);
  }

  /** A fresh signed link to a campus's own logo (by school slug and branch code), or null. */
  async branchLogoLink(slug: string, code: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { code, school: { slug } },
      select: { logoFile: { select: { storageKey: true, deletedAt: true } } },
    });
    return this.logoUrl(branch?.logoFile);
  }

  async publicSchool(schoolId: string): Promise<PublicSchool | null> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        slug: true,
        name: true,
        motto: true,
        brandColor: true,
        status: true,
        logoFileId: true,
        logoFile: { select: { deletedAt: true } },
      },
    });
    if (!school) return null;
    return {
      slug: school.slug,
      name: school.name,
      initials: initialsOf(school.name),
      motto: school.motto,
      brandColor: school.brandColor ?? DEFAULT_BRAND_COLOR,
      // The stable address (redirects to a fresh signed link), so a page left open keeps it.
      logoUrl: school.logoFile?.deletedAt ? null : schoolLogoAddress(school),
      available: school.status !== 'SUSPENDED',
    };
  }
}
