/**
 * Learning materials for the mock API: files (PDF, documents, slides, images) and video links a
 * teacher shares with a class for a subject. Owned by the Materials builder.
 *
 * Other areas read through `materialsForClass` / `latestMaterial`, never the array directly.
 */
import {
  MATERIAL_EXTENSIONS,
  MATERIAL_LIMITS,
  MATERIAL_TYPES,
  VIDEO_HOSTS,
  type FileRef,
  type MaterialStatus,
  type MaterialType,
} from '@/types';

import { fieldError, fileSizeLabel } from './assignments-db';
import { logHistory } from './notify-db';
import { seeded, TEACHING_ASSIGNMENTS } from './school-db';
import { notFound, studentsInArmFor } from './scope';

export interface MaterialRecord {
  id: string;
  termId: string;
  teacherId: string;
  armId: string;
  subject: string;
  type: MaterialType;
  title: string;
  description: string;
  file: FileRef | null;
  link: string | null;
  status: MaterialStatus;
  /** Local "YYYY-MM-DDTHH:mm" */
  publishedAt: string;
  archivedAt: string | null;
  views: number;
  /** Students who opened it at least once. */
  viewerIds: string[];
  lastViewedAt: string | null;
}

export const MATERIALS: MaterialRecord[] = [];
let seq = 0;
export const nextMaterialId = () => `mt-${++seq}`;
export const materialKey = (id: string) => `material:${id}`;

export const materialById = (id: string): MaterialRecord =>
  MATERIALS.find((m) => m.id === id) ?? notFound('That material');

/** Published materials for a class and subject in a term, newest first. */
export const materialsForClass = (
  armId: string,
  subject: string,
  termId: string,
  options: { includeArchived?: boolean } = {},
) =>
  MATERIALS.filter(
    (m) =>
      m.armId === armId &&
      m.subject === subject &&
      m.termId === termId &&
      (options.includeArchived || m.status === 'Published'),
  ).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

/** The newest published material for a class, for the lesson page. */
export const latestMaterial = (armId: string, subject: string, termId: string) =>
  materialsForClass(armId, subject, termId)[0] ?? null;

export const materialsOfTeacher = (teacherId: string, termId: string) =>
  MATERIALS.filter((m) => m.teacherId === teacherId && m.termId === termId);

/* ---------- Validation ---------- */

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Checks a video link: https:// on YouTube, Vimeo or Google Drive. */
export function validateVideoLink(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fieldError('link', 'Paste the video link.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fieldError('link', 'That isn’t a web address. Paste the full link, starting https://');
  }
  if (url.protocol !== 'https:') fieldError('link', 'Use a secure link that starts with https://');
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (!VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)))
    fieldError('link', 'Use a YouTube, Vimeo or Google Drive link.');
  return url.toString();
}

/** Checks an uploaded file against the chosen type and the 25 MB limit. */
export function validateMaterialFile(type: MaterialType, value: unknown): FileRef {
  const f = value as Partial<FileRef> | null;
  if (!f || typeof f.name !== 'string' || !f.name.trim() || typeof f.bytes !== 'number')
    return fieldError('file', 'Choose a file to upload.');
  const allowed = MATERIAL_EXTENSIONS[type as Exclude<MaterialType, 'Video link'>] ?? [];
  if (!allowed.includes(extOf(f.name)))
    fieldError(
      'file',
      `“${f.name}” isn’t a ${type === 'Image' ? 'image' : type} file. Choose a .${allowed.join(', .')} file, or change the type.`,
    );
  if (f.bytes > MATERIAL_LIMITS.bytes)
    fieldError(
      'file',
      `“${f.name}” is ${fileSizeLabel(f.bytes)}. Files can be up to 25 MB. Compress it or share it as a link.`,
    );
  if (f.bytes <= 0) fieldError('file', `“${f.name}” is empty.`);
  return { name: f.name.trim(), type: typeof f.type === 'string' ? f.type : '', bytes: f.bytes };
}

export function validateMaterialBody(body: Record<string, unknown>) {
  const type = body.type as MaterialType;
  if (!MATERIAL_TYPES.includes(type)) fieldError('type', 'Choose what kind of material it is.');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) fieldError('title', 'Enter a title.');
  if (title.length > MATERIAL_LIMITS.title)
    fieldError('title', `Keep the title to ${MATERIAL_LIMITS.title} characters.`);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > MATERIAL_LIMITS.description)
    fieldError('description', `Keep the description to ${MATERIAL_LIMITS.description} characters.`);
  if (type === 'Video link')
    return { type, title, description, link: validateVideoLink(body.link), file: null };
  return { type, title, description, link: null, file: validateMaterialFile(type, body.file) };
}

/* ---------- Seed ---------- */

const SEED: Record<string, [MaterialType, string, string, string | number][]> = {
  MTH: [
    ['PDF', 'Algebra worked examples', 'Step-by-step examples for this week’s lessons.', 1840],
    ['Presentation', 'Linear equations slides', 'The slides from Tuesday’s lesson.', 5120],
    [
      'Video link',
      'Solving equations (video)',
      'A short video recap. Watch before the next lesson.',
      'https://www.youtube.com/watch?v=l3XzepN03KQ',
    ],
    ['PDF', 'Number bases summary sheet', 'One-page summary for revision.', 420],
  ],
  FMT: [
    ['PDF', 'Matrices notes', 'Definitions, properties and worked examples.', 2210],
    [
      'Video link',
      'Determinants explained',
      'Recommended viewing before the test.',
      'https://vimeo.com/76979871',
    ],
    ['Presentation', 'Binary operations slides', 'Lesson slides.', 3050],
  ],
  ENG: [
    ['PDF', 'Essay writing guide', 'How to plan and structure a narrative essay.', 960],
    ['Document', 'Comprehension practice passages', 'Five passages with questions.', 310],
    [
      'Video link',
      'Parts of speech song',
      'A fun way to remember the eight parts of speech.',
      'https://youtu.be/YbvTFlyVR8E',
    ],
    ['Image', 'Letter format poster', 'The informal letter layout, for your notebook.', 780],
  ],
  PHY: [
    ['PDF', 'Motion graphs notes', 'Distance–time and velocity–time graphs.', 1520],
    ['Presentation', 'Simple pendulum practical', 'Method, table and graph.', 6400],
    [
      'Video link',
      'Energy and power (video)',
      'Watch from 2:30.',
      'https://drive.google.com/file/d/1a2b3c4d5e/view',
    ],
  ],
  BSC: [
    ['PDF', 'States of matter notes', 'Solids, liquids and gases.', 880],
    ['Image', 'Human skeleton diagram', 'Label this diagram in your notebook.', 1260],
    ['Presentation', 'Living things slides', 'Characteristics of living things.', 4100],
  ],
};

const MIME: Record<MaterialType, string> = {
  PDF: 'application/pdf',
  Document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  Presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  Image: 'image/png',
  'Video link': '',
};
const EXT: Record<MaterialType, string> = {
  PDF: 'pdf',
  Document: 'docx',
  Presentation: 'pptx',
  Image: 'png',
  'Video link': '',
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const DEMO_TEACHERS = ['ade', 'okafor', 'bello', 'eze'];

(function seedMaterials() {
  const rng = seeded(9_112_026);
  const days = ['2026-09-22', '2026-10-06', '2026-11-10', '2026-11-24', '2026-12-03'];
  for (const ta of TEACHING_ASSIGNMENTS) {
    if (!DEMO_TEACHERS.includes(ta.teacherId)) continue;
    const list = SEED[ta.subject] ?? SEED.MTH!;
    const past = ta.termId === 't-2526-3';
    const students = studentsInArmFor(ta.armId, ta.subject, ta.termId);
    const items = past ? list.slice(0, 2) : list;
    items.forEach(([type, title, description, extra], i) => {
      const publishedAt = past
        ? `2026-0${5 + i}-1${i}T10:00`
        : `${days[(i + rng.int(0, 1)) % days.length]}T${String(8 + i).padStart(2, '0')}:30`;
      const viewers = rng
        .shuffle(students)
        .slice(0, rng.int(Math.floor(students.length * 0.3), students.length));
      const m: MaterialRecord = {
        id: nextMaterialId(),
        termId: ta.termId,
        teacherId: ta.teacherId,
        armId: ta.armId,
        subject: ta.subject,
        type,
        title,
        description,
        file:
          type === 'Video link'
            ? null
            : {
                name: `${slug(title)}.${EXT[type]}`,
                type: MIME[type],
                bytes: Number(extra) * 1024,
              },
        link: type === 'Video link' ? String(extra) : null,
        status: 'Published',
        publishedAt,
        archivedAt: null,
        views: viewers.length + rng.int(0, viewers.length),
        viewerIds: viewers.map((s) => s.id),
        lastViewedAt: viewers.length ? '2026-12-07T20:14' : null,
      };
      MATERIALS.push(m);
      logHistory(
        materialKey(m.id),
        'Published',
        `Shared with ${students.length} students`,
        'info',
        publishedAt,
      );
    });
    // One archived item per active class: last term's revision sheet.
    if (!past) {
      const m: MaterialRecord = {
        id: nextMaterialId(),
        termId: ta.termId,
        teacherId: ta.teacherId,
        armId: ta.armId,
        subject: ta.subject,
        type: 'PDF',
        title: 'Old revision sheet (replaced)',
        description: 'Replaced by the updated summary sheet.',
        file: { name: 'old_revision_sheet.pdf', type: 'application/pdf', bytes: 640 * 1024 },
        link: null,
        status: 'Archived',
        publishedAt: '2026-09-16T09:00',
        archivedAt: '2026-10-05T15:20',
        views: rng.int(4, 12),
        viewerIds: [],
        lastViewedAt: '2026-10-02T18:40',
      };
      MATERIALS.push(m);
      logHistory(materialKey(m.id), 'Published', undefined, 'info', m.publishedAt);
      logHistory(
        materialKey(m.id),
        'Archived',
        'Students stopped seeing it.',
        'neutral',
        m.archivedAt!,
      );
    }
  }
})();
