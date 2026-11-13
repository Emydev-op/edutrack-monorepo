/**
 * Types for the materials area (upload, publish, archive). Owned by the Materials builder.
 * Re-exported from `@/types`.
 */
import type { FileRef } from './assignments';
import type { PageMeta } from './common';
import type { TimelineEntry } from '@edutrack/app-kit/types';

export type MaterialType = 'PDF' | 'Document' | 'Presentation' | 'Image' | 'Video link';
export const MATERIAL_TYPES: readonly MaterialType[] = [
  'PDF',
  'Document',
  'Presentation',
  'Image',
  'Video link',
];
export type MaterialStatus = 'Published' | 'Archived';
export const MATERIAL_STATUSES: readonly MaterialStatus[] = ['Published', 'Archived'];

/** File extensions accepted for each file type (lower case). */
export const MATERIAL_EXTENSIONS: Record<Exclude<MaterialType, 'Video link'>, string[]> = {
  PDF: ['pdf'],
  Document: ['doc', 'docx'],
  Presentation: ['ppt', 'pptx'],
  Image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
};
export const MATERIAL_LIMITS = { bytes: 25 * 1024 * 1024, title: 120, description: 1000 } as const;
/** Video links must be https:// on one of these hosts. */
export const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'drive.google.com'] as const;

export interface MaterialRow {
  id: string;
  termId: string;
  armId: string;
  armName: string;
  subject: string;
  subjectName: string;
  classLabel: string;
  type: MaterialType;
  title: string;
  status: MaterialStatus;
  file: FileRef | null;
  link: string | null;
  views: number;
  /** Local "YYYY-MM-DDTHH:mm" */
  publishedAt: string;
  archivedAt: string | null;
}

export interface MaterialDetail extends MaterialRow {
  description: string;
  branchName: string;
  /** Distinct students who opened it. */
  viewers: number;
  students: number;
  lastViewedAt: string | null;
  /** Assignments that attach it (they show it as unavailable while archived). */
  linkedAssignments: { id: string; title: string; status: string }[];
  permissions: { archive: boolean; restore: boolean; lockReason: string | null };
  history: TimelineEntry[];
}

export interface MaterialListQuery {
  term?: string;
  class?: string;
  subject?: string;
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MaterialList {
  data: MaterialRow[];
  meta: PageMeta;
  counts: Record<MaterialStatus, number>;
}

export interface MaterialPayload {
  armId: string;
  subject: string;
  type: MaterialType;
  title: string;
  description: string;
  file: FileRef | null;
  link: string | null;
}
