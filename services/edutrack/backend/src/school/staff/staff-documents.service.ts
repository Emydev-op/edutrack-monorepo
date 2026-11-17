import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { DocumentStatus } from '../../generated/prisma/enums.js';
import { addMonths, formatDay } from '../../platform/shared/format.js';
import { StorageService } from '../../storage/storage.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import type { UploadStaffDocumentDto } from './dto/staff.dto.js';
import { asAuditDb, withNotice } from './staff-audit.js';
import { isUuid, StaffRecordsService } from './staff-records.service.js';
import { parseUpload } from './staff-view.js';

/** Download links are signed; an hour covers a long look at the profile. */
const LINK_SECONDS = 3600;

const STATUS_LABEL: Record<DocumentStatus, 'Verified' | 'Pending' | 'Missing' | 'Optional'> = {
  VERIFIED: 'Verified',
  PENDING: 'Pending',
  MISSING: 'Missing',
  OPTIONAL: 'Optional',
};

export interface StaffDocumentView {
  id: string;
  name: string;
  kind: string;
  uploaded: string;
  status: 'Verified' | 'Pending' | 'Missing' | 'Optional';
  /** Signed download link (an hour), null when nothing is on file. */
  url: string | null;
}

/**
 * Employment documents on a staff profile. Uploads arrive as data URLs, are checked by their
 * bytes (PDF, JPG or PNG, 5 MB), stored under `schools/<schoolId>/staff/<staffId>/documents/` with
 * a `StoredFile` row, and stay Pending until someone verifies them. A new upload of the same kind
 * replaces the file.
 */
@Injectable()
export class StaffDocumentsService {
  private readonly logger = new Logger(StaffDocumentsService.name);

  constructor(
    private readonly records: StaffRecordsService,
    private readonly storage: StorageService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  async rows(staffId: string): Promise<StaffDocumentView[]> {
    const docs = await this.records.db.staffDocument.findMany({
      where: { staffId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { file: { select: { storageKey: true, deletedAt: true } } },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        uploaded: d.status === 'MISSING' || !d.name ? '—' : formatDay(d.updatedAt),
        status: STATUS_LABEL[d.status],
        url:
          d.file && !d.file.deletedAt
            ? await this.storage.getDownloadUrl(d.file.storageKey, LINK_SECONDS).catch(() => null)
            : null,
      })),
    );
  }

  async upload(staffId: string, dto: UploadStaffDocumentDto) {
    const s = await this.records.find(staffId);
    const parsed = parseUpload(dto.file, 'document');
    const schoolId = this.records.schoolId();
    const fileId = randomUUID();
    const storageKey = `schools/${schoolId}/staff/${s.id}/documents/${fileId}.${parsed.ext}`;
    await this.storage.upload(storageKey, parsed.bytes, parsed.mime);
    const replaced = await this.records.db.$transaction(async (tx) => {
      await tx.storedFile.create({
        data: {
          id: fileId,
          schoolId,
          storageKey,
          originalName: dto.name,
          mimeType: parsed.mime,
          sizeBytes: BigInt(parsed.bytes.length),
          sha256: createHash('sha256').update(parsed.bytes).digest('hex'),
          uploadedById: RequestContext.get()?.userId ?? null,
          // A leaver's files share the leaver's purge date (two years after they left).
          retainUntil: s.status === 'DEACTIVATED' && s.leftOn ? addMonths(s.leftOn, 24) : null,
        },
      });
      const existing = await tx.staffDocument.findFirst({
        where: { staffId: s.id, kind: { equals: dto.kind, mode: 'insensitive' }, deletedAt: null },
        include: { file: { select: { id: true, storageKey: true } } },
      });
      const fields = {
        name: dto.name,
        status: 'PENDING' as const,
        fileId,
        verifiedById: null,
        verifiedAt: null,
      };
      if (existing) {
        await tx.staffDocument.update({ where: { id: existing.id }, data: fields });
        if (existing.file)
          await tx.storedFile.update({
            where: { id: existing.file.id },
            data: { deletedAt: this.clock.now() },
          });
      } else
        await tx.staffDocument.create({
          data: { schoolId, staffId: s.id, kind: dto.kind, ...fields },
        });
      await this.audit.record(
        {
          action: 'staff.document_upload',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: `${dto.kind} uploaded`,
          detail: dto.name,
        },
        asAuditDb(tx),
      );
      return existing?.file ?? null;
    });
    if (replaced)
      await this.storage
        .remove(replaced.storageKey)
        .catch((error: unknown) =>
          this.logger.warn({ msg: 'Replaced staff document not removed', error: String(error) }),
        );
    return withNotice(
      await this.rows(s.id),
      `${dto.kind} uploaded. Verify it once you’ve checked it.`,
    );
  }

  async verify(staffId: string, documentId: string) {
    const s = await this.records.find(staffId);
    const doc = isUuid(documentId)
      ? await this.records.db.staffDocument.findFirst({
          where: { id: documentId, staffId: s.id, deletedAt: null },
        })
      : null;
    if (!doc) throw AppException.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
    if (doc.status !== 'PENDING')
      throw AppException.conflict(
        'Only a pending document can be verified.',
        'DOCUMENT_NOT_PENDING',
      );
    await this.records.db.$transaction(async (tx) => {
      await tx.staffDocument.update({
        where: { id: doc.id },
        data: {
          status: 'VERIFIED',
          verifiedById: RequestContext.get()?.userId ?? null,
          verifiedAt: this.clock.now(),
        },
      });
      await this.audit.record(
        {
          action: 'staff.document_verify',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: `${doc.kind} verified`,
          detail: doc.name,
        },
        asAuditDb(tx),
      );
    });
    return withNotice(await this.rows(s.id), `${doc.kind} verified.`);
  }
}
