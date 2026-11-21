import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { sizeText } from '../profile/school-files.js';

/** Up to 25 MB a file, as the Teacher Workspace allows (about 33.4 MB of base64). */
export const HOMEWORK_FILE_MAX = 25 * 1024 * 1024;

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const starts = (bytes: Buffer, magic: number[], at = 0) =>
  magic.every((b, i) => bytes[at + i] === b);

/** What homework files may be, by extension, recognised by their first bytes. */
const KINDS: Record<string, { mime: string; is: (b: Buffer) => boolean }> = {
  pdf: { mime: 'application/pdf', is: (b) => starts(b, [0x25, 0x50, 0x44, 0x46]) },
  png: { mime: 'image/png', is: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: 'image/jpeg', is: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', is: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  gif: { mime: 'image/gif', is: (b) => starts(b, [0x47, 0x49, 0x46, 0x38]) },
  webp: {
    mime: 'image/webp',
    is: (b) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  doc: { mime: 'application/msword', is: (b) => starts(b, OLE) },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    is: (b) => starts(b, ZIP),
  },
  ppt: { mime: 'application/vnd.ms-powerpoint', is: (b) => starts(b, OLE) },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    is: (b) => starts(b, ZIP),
  },
};

export const HOMEWORK_EXTENSIONS = Object.keys(KINDS);
export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** A file as the portals show it: name, type and size, its id and a short-lived link. */
export interface FileRefView {
  id: string;
  name: string;
  type: string;
  bytes: number;
  url?: string | null;
  materialId?: string;
  unavailable?: boolean;
}

type StoredRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
};

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?;base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * Files for homework: assignment attachments, materials and the work students (or, for primary
 * pupils, their parents) hand in. The browser uploads each file once (`POST /v1/uploads`, a data
 * URL) and the forms then refer to it by id. Files are private; reads hand out signed links.
 */
@Injectable()
export class HomeworkFilesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Checks and stores one upload for the signed-in user. */
  async upload(auth: AuthUserContext, body: { name?: string; dataUrl?: string }) {
    const name = String(body.name ?? '')
      .trim()
      .replace(/[\\/]/g, '_');
    const fail = (message: string) => AppException.validation({ file: message }, message);
    if (!name) throw fail('The file needs a name.');
    if (name.length > 200) throw fail('Rename the file to 200 characters or fewer.');
    const ext = extOf(name);
    const kind = KINDS[ext];
    const allowed = 'Use a PDF, Word, PowerPoint or image file.';
    if (!kind) throw fail(`“${name}” isn’t supported. ${allowed}`);
    const match = DATA_URL.exec(String(body.dataUrl ?? ''));
    if (!match) throw fail(`“${name}” didn’t upload. Attach it again.`);
    const bytes = Buffer.from(match[2]!, 'base64');
    if (!bytes.length) throw fail(`“${name}” is empty.`);
    if (bytes.length > HOMEWORK_FILE_MAX)
      throw fail(`“${name}” is ${sizeText(bytes.length)}. Each file can be up to 25 MB.`);
    if (!kind.is(bytes)) throw fail(`“${name}” isn’t a real .${ext} file. ${allowed}`);
    const schoolId = auth.schoolId!;
    const id = randomUUID();
    const storageKey = `schools/${schoolId}/homework/${id}.${ext}`;
    await this.storage.upload(storageKey, bytes, kind.mime);
    const row = await this.tenant.db.storedFile.create({
      data: {
        id,
        schoolId,
        storageKey,
        originalName: name,
        mimeType: kind.mime,
        sizeBytes: BigInt(bytes.length),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        uploadedById: auth.userId,
      },
    });
    return HomeworkFilesService.ref(row);
  }

  static ref(f: StoredRow): FileRefView {
    return { id: f.id, name: f.originalName, type: f.mimeType, bytes: Number(f.sizeBytes) };
  }

  /** The file with a signed download link (an hour). */
  async view(f: StoredRow): Promise<FileRefView> {
    return {
      ...HomeworkFilesService.ref(f),
      url: await this.storage.getDownloadUrl(f.storageKey, 3600),
    };
  }

  /**
   * Files the user uploaded and hasn't used anywhere yet (or that `keep` already holds), by id.
   * Anything else answers 422 on `field`.
   */
  async claim(auth: AuthUserContext, ids: string[], field: string, keep: string[] = []) {
    if (!ids.length) return new Map<string, StoredRow>();
    const fail = (message: string) => AppException.validation({ [field]: message }, message);
    const UUID = /^[0-9a-f-]{36}$/i;
    if (ids.some((id) => !UUID.test(id)))
      throw fail('One of the files didn’t upload. Attach it again.');
    const rows = await this.tenant.db.storedFile.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: {
        _count: { select: { assignmentAttachments: true, submissionFiles: true, materials: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) throw fail('One of the files didn’t upload. Attach it again.');
      if (keep.includes(id)) continue;
      const used = r._count.assignmentAttachments + r._count.submissionFiles + r._count.materials;
      if (r.uploadedById !== auth.userId || used)
        throw fail(`“${r.originalName}” can’t be attached here. Upload it again.`);
    }
    return byId as Map<string, StoredRow>;
  }
}
