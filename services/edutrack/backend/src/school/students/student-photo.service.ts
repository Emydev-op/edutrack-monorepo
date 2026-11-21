import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RequestContext } from '../../common/context/request-context.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { parseUpload } from '../staff/staff-view.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';

const LINK_SECONDS = 3600;

/**
 * A student's photo (e.g. the school's uniform portrait): set or removed in School Admin, shown on
 * their record and printed on report cards. Links to it are signed and short-lived; nothing about
 * it is public.
 */
@Injectable()
export class StudentPhotoService {
  private readonly logger = new Logger(StudentPhotoService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly storage: StorageService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async file(studentId: string) {
    const s = await this.db.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { photoFile: { select: { storageKey: true, deletedAt: true } } },
    });
    return s?.photoFile && !s.photoFile.deletedAt ? s.photoFile : null;
  }

  /** A signed link to the photo (an hour), or null. */
  async url(studentId: string): Promise<string | null> {
    const f = await this.file(studentId);
    return f ? this.storage.getDownloadUrl(f.storageKey, LINK_SECONDS).catch(() => null) : null;
  }

  /** Signed links for several students at once (report cards of a class). */
  async urls(studentIds: string[]): Promise<Map<string, string>> {
    const rows = await this.db.student.findMany({
      where: { id: { in: studentIds }, photoFileId: { not: null } },
      select: { id: true, photoFile: { select: { storageKey: true, deletedAt: true } } },
    });
    const out = new Map<string, string>();
    for (const r of rows)
      if (r.photoFile && !r.photoFile.deletedAt) {
        const link = await this.storage
          .getDownloadUrl(r.photoFile.storageKey, LINK_SECONDS)
          .catch(() => null);
        if (link) out.set(r.id, link);
      }
    return out;
  }

  /** The photo's bytes for a PDF, or null (none, or storage unavailable). */
  async bytes(studentId: string): Promise<Buffer | null> {
    const f = await this.file(studentId);
    return f ? this.storage.download(f.storageKey).catch(() => null) : null;
  }

  /** `PUT /v1/students/:id/photo`: a JPG or PNG data URL (2 MB), or null to remove it. */
  async set(studentId: string, dataUrl: string | null) {
    const s = await this.db.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, firstName: true, surname: true, status: true, photoFileId: true },
    });
    if (!s) throw AppException.notFound('Student not found', 'STUDENT_NOT_FOUND');
    if (s.status !== 'ACTIVE')
      throw AppException.conflict(
        'This student has left the school, so their record is read-only.',
        'STUDENT_LEFT',
      );
    const schoolId = RequestContext.schoolId()!;
    let file: {
      id: string;
      schoolId: string;
      storageKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: bigint;
      sha256: string;
      uploadedById: string | null;
    } | null = null;
    if (dataUrl) {
      const photo = parseUpload(dataUrl, 'photo');
      const id = randomUUID();
      const storageKey = `schools/${schoolId}/students/${s.id}/photo/${id}.${photo.ext}`;
      await this.storage.upload(storageKey, photo.bytes, photo.mime);
      file = {
        id,
        schoolId,
        storageKey,
        originalName: `photo.${photo.ext}`,
        mimeType: photo.mime,
        sizeBytes: BigInt(photo.bytes.length),
        sha256: createHash('sha256').update(photo.bytes).digest('hex'),
        uploadedById: RequestContext.get()?.userId ?? null,
      };
    }
    const previous = s.photoFileId
      ? await this.db.storedFile.findUnique({ where: { id: s.photoFileId } })
      : null;
    const name = `${s.firstName} ${s.surname}`;
    await this.db.$transaction(async (tx) => {
      if (file) await tx.storedFile.create({ data: file });
      if (previous)
        await tx.storedFile.update({
          where: { id: previous.id },
          data: { deletedAt: this.clock.now() },
        });
      await tx.student.update({ where: { id: s.id }, data: { photoFileId: file?.id ?? null } });
      await this.audit.record(
        {
          action: file ? 'student.photo_set' : 'student.photo_removed',
          area: 'Students',
          entity: 'Student',
          entityId: s.id,
          summary: file ? `Photo updated for ${name}` : `Photo removed for ${name}`,
        },
        asTx(tx),
      );
    });
    if (previous)
      await this.storage.remove(previous.storageKey).catch((error: unknown) => {
        this.logger.warn({ msg: 'Old student photo not removed', error: String(error) });
      });
    return { photoUrl: await this.url(s.id), name, removed: !file };
  }
}
