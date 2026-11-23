import { branchLogoAddress } from '../../auth/auth.presenter.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';

/**
 * The person's campus in the Teacher, Parent and Student Portals: its name and its own colour and
 * logo (each null to keep the school's). The portals theme themselves in it once signed in; the
 * sign-in pages keep the school's brand.
 */
export interface CampusBrand {
  name: string;
  brandColor: string | null;
  logoUrl: string | null;
}

/** Campus brands by branch id (this school's branches only). */
export async function campusBrands(
  db: TenantPrismaClient,
  branchIds: (string | null | undefined)[],
): Promise<Map<string, CampusBrand>> {
  const ids = [...new Set(branchIds.filter((id): id is string => !!id))];
  if (!ids.length) return new Map();
  const rows = await db.branch.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      code: true,
      brandColor: true,
      logoFileId: true,
      logoFile: { select: { deletedAt: true } },
      school: { select: { slug: true } },
    },
  });
  return new Map(
    rows.map((b) => [
      b.id,
      {
        name: b.name,
        brandColor: b.brandColor,
        logoUrl: b.logoFile?.deletedAt ? null : branchLogoAddress(b.school.slug, b),
      },
    ]),
  );
}

export async function campusBrand(db: TenantPrismaClient, branchId: string | null | undefined) {
  return (await campusBrands(db, [branchId])).get(branchId ?? '') ?? null;
}
