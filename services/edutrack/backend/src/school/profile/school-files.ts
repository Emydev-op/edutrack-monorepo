import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';

/** What an upload may be, recognised by its first bytes (never by the name or declared type). */
const KINDS = {
  png: { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  pdf: { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
} as const;

export type UploadKind = keyof typeof KINDS;

export interface UploadRule {
  kinds: readonly UploadKind[];
  maxBytes: number;
  /** "Use a PNG or JPG image." */
  typeMessage: string;
  /** "The logo is larger than 1 MB." */
  sizeMessage: string;
  /** Error code prefix: LOGO → LOGO_TYPE, LOGO_TOO_LARGE. */
  code: string;
}

export interface ParsedUpload {
  bytes: Buffer;
  mime: string;
  ext: string;
  sha256: string;
}

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

/** True when the value is a fresh upload (a data URL) rather than the stored file's link. */
export const isDataUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.startsWith('data:');

/** Reads a `data:<type>;base64,…` upload and checks its bytes and size against the rule. */
export function parseUpload(dataUrl: string, rule: UploadRule): ParsedUpload {
  const fail = (message: string, suffix: string) =>
    new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, `${rule.code}_${suffix}`);
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw fail(rule.typeMessage, 'TYPE');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > rule.maxBytes) throw fail(rule.sizeMessage, 'TOO_LARGE');
  const kind = rule.kinds.find((k) => KINDS[k].magic.every((b, i) => bytes[i] === b));
  if (!kind) throw fail(rule.typeMessage, 'TYPE');
  const { mime, ext } = KINDS[kind];
  return { bytes, mime, ext, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** `schools/<schoolId>/<folder>/<id>.<ext>`, the key a school's file is stored under. */
export function schoolFileKey(schoolId: string, folder: string, ext: string) {
  const id = randomUUID();
  return { id, storageKey: `schools/${schoolId}/${folder}/${id}.${ext}` };
}

/** `412 KB`, `1.2 MB`: how the portals show file sizes. */
export const sizeText = (bytes: number) =>
  bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
