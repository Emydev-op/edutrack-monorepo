import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SchoolBrandingService } from '../shared/school-branding.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { LOGO_RULE } from './profile.service.js';
import { parseUpload, schoolFileKey } from './school-files.js';

const COLOR = /^#[0-9a-f]{6}$/i;

/**
 * A campus's own branding (logo and colour), used on its report cards and receipts and in School
 * Admin while it's the working branch. Either can be cleared to use the school's again.
 */
@Injectable()
export class BranchBrandingService {
  private readonly logger = new Logger(BranchBrandingService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly storage: StorageService,
    private readonly branding: SchoolBrandingService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** `{ brandColor, logoUrl }`, each null to use the school's. */
  async view(branchId: string) {
    const b = await this.db.branch.findFirst({
      where: { id: branchId },
      select: { brandColor: true, logoFile: { select: { storageKey: true, deletedAt: true } } },
    });
    if (!b) throw AppException.notFound('Branch not found', 'BRANCH_NOT_FOUND');
    return { brandColor: b.brandColor, logoUrl: await this.branding.logoUrl(b.logoFile) };
  }

  /**
   * `PUT /v1/branches/:id/branding`: `brandColor` ("#1F6FEB", or null for the school's) and
   * `logo` (a PNG/JPG data URL, null to remove, omitted to keep).
   */
  async set(branchId: string, dto: { brandColor?: string | null; logo?: string | null }) {
    const b = await this.db.branch.findFirst({
      where: { id: branchId },
      select: { id: true, name: true, brandColor: true, logoFileId: true },
    });
    if (!b) throw AppException.notFound('Branch not found', 'BRANCH_NOT_FOUND');
    if (dto.brandColor && !COLOR.test(dto.brandColor))
      throw AppException.validation({ brandColor: 'Pick a brand colour.' }, 'Pick a brand colour.');
    const schoolId = RequestContext.schoolId()!;
    let upload: {
      id: string;
      storageKey: string;
      mime: string;
      bytes: Buffer;
      ext: string;
    } | null = null;
    if (dto.logo) {
      const parsed = parseUpload(dto.logo, LOGO_RULE);
      upload = { ...schoolFileKey(schoolId, `branches/${b.id}/logo`, parsed.ext), ...parsed };
      await this.storage.upload(upload.storageKey, upload.bytes, upload.mime);
    }
    const previous =
      dto.logo !== undefined && b.logoFileId
        ? await this.db.storedFile.findUnique({ where: { id: b.logoFileId } })
        : null;
    await this.db.$transaction(async (tx) => {
      if (upload)
        await tx.storedFile.create({
          data: {
            id: upload.id,
            schoolId,
            storageKey: upload.storageKey,
            originalName: `logo.${upload.ext}`,
            mimeType: upload.mime,
            sizeBytes: BigInt(upload.bytes.length),
            sha256: createHash('sha256').update(upload.bytes).digest('hex'),
            uploadedById: RequestContext.get()?.userId ?? null,
          },
        });
      if (previous)
        await tx.storedFile.update({
          where: { id: previous.id },
          data: { deletedAt: this.clock.now() },
        });
      await tx.branch.update({
        where: { id: b.id },
        data: {
          ...(dto.brandColor !== undefined && {
            brandColor: dto.brandColor ? dto.brandColor.toUpperCase() : null,
          }),
          ...(dto.logo !== undefined && { logoFileId: upload?.id ?? null }),
        },
      });
      await this.audit.record(
        {
          action: 'branch.branding',
          area: 'Branches',
          entity: 'Branch',
          entityId: b.id,
          summary: `${b.name} branding updated`,
          detail: [
            dto.brandColor !== undefined &&
              (dto.brandColor ? `colour ${dto.brandColor}` : 'school colour'),
            dto.logo !== undefined && (dto.logo ? 'new logo' : 'school logo'),
          ]
            .filter(Boolean)
            .join(' · '),
        },
        asTx(tx),
      );
    });
    if (previous)
      await this.storage.remove(previous.storageKey).catch((error: unknown) => {
        this.logger.warn({ msg: 'Old branch logo not removed', error: String(error) });
      });
    return { ...(await this.view(b.id)), name: b.name };
  }
}
