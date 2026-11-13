import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type { AssignmentDetail, MaterialDetail, MaterialList } from '@/types';

import { latestMaterial, MATERIALS, materialsForClass } from '../materials-db';
import { failure as baseFailure, signIn } from './helpers';

const FIRST = 't-2627-1';
const PAST = 't-2526-3';
const MB = 1024 * 1024;

async function failure(request: Promise<unknown>) {
  let field: string | undefined;
  const f = await baseFailure(
    request.catch((e: { response?: { data?: { fields?: Record<string, string> } } }) => {
      field = Object.keys(e.response?.data?.fields ?? {})[0];
      throw e;
    }),
  );
  return { ...f, field };
}

const upload = (over: Record<string, unknown> = {}) => ({
  armId: 'mc-jss2b',
  subject: 'MTH',
  type: 'PDF',
  title: 'Factorisation notes',
  description: 'Read before Thursday.',
  file: { name: 'factorisation_notes.pdf', type: 'application/pdf', bytes: 3 * MB },
  link: null,
  ...over,
});

let ade: AxiosInstance;
let okafor: AxiosInstance;
beforeAll(async () => {
  ade = await signIn('s.ade@greenfield.edu.ng');
  okafor = await signIn('g.okafor@greenfield.edu.ng');
});

describe('Seeded materials', () => {
  it('gives each demo teacher files, slides, a video link and an archived item, with views', () => {
    for (const t of ['ade', 'okafor', 'bello', 'eze']) {
      const mine = MATERIALS.filter((m) => m.teacherId === t && m.termId === FIRST);
      const types = new Set(mine.map((m) => m.type));
      expect(types.has('PDF')).toBe(true);
      expect(types.has('Video link')).toBe(true);
      expect(mine.some((m) => m.status === 'Archived')).toBe(true);
      expect(mine.some((m) => m.views > 0)).toBe(true);
    }
    expect(materialsForClass('mc-jss2b', 'MTH', FIRST).every((m) => m.status === 'Published')).toBe(
      true,
    );
    expect(latestMaterial('mc-jss2b', 'MTH', FIRST)).not.toBeNull();
  });
});

describe('Materials list', () => {
  it('filters by class, subject, type and status', async () => {
    const { data } = await ade.get<MaterialList>('/v1/materials', {
      params: { class: 'mc-jss2b', subject: 'MTH', pageSize: 50 },
    });
    expect(data.data.every((m) => m.classLabel === 'JSS 2B · Mathematics')).toBe(true);
    expect(data.counts.Archived).toBe(1);
    const { data: videos } = await ade.get<MaterialList>('/v1/materials', {
      params: { type: 'Video link', pageSize: 50 },
    });
    expect(videos.data.length).toBeGreaterThan(0);
    expect(
      videos.data.every((m) => m.type === 'Video link' && m.link?.startsWith('https://')),
    ).toBe(true);
    const { data: archived } = await ade.get<MaterialList>('/v1/materials', {
      params: { status: 'Archived' },
    });
    expect(archived.data.every((m) => m.status === 'Archived')).toBe(true);
    expect(
      (await failure(ade.get('/v1/materials', { params: { class: 'mc-jss2b', subject: 'ENG' } })))
        .status,
    ).toBe(403);
  });
});

describe('Upload', () => {
  it('publishes a file for my class', async () => {
    const { data } = await ade.post<MaterialDetail>('/v1/materials', upload());
    expect(data).toMatchObject({ status: 'Published', views: 0, students: 14 });
    expect(data.history[0]?.title).toBe('Published');
  });

  it('refuses files over 25 MB and files that don’t match the type', async () => {
    const big = await failure(
      ade.post(
        '/v1/materials',
        upload({ file: { name: 'lesson.pdf', type: 'application/pdf', bytes: 26 * MB } }),
      ),
    );
    expect(big).toMatchObject({ status: 422, field: 'file' });
    expect(big.message).toMatch(/26\.0 MB\. Files can be up to 25 MB/);
    const wrong = await failure(ade.post('/v1/materials', upload({ type: 'Presentation' })));
    expect(wrong.field).toBe('file');
    expect((await failure(ade.post('/v1/materials', upload({ file: null })))).field).toBe('file');
    expect((await failure(ade.post('/v1/materials', upload({ title: '' })))).field).toBe('title');
  });

  it('accepts https YouTube, Vimeo and Drive links only', async () => {
    const link = (url: string) =>
      ade.post<MaterialDetail>(
        '/v1/materials',
        upload({ type: 'Video link', file: null, link: url }),
      );
    for (const ok of [
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
      'https://vimeo.com/123',
      'https://drive.google.com/file/d/xyz/view',
    ])
      expect((await link(ok)).data.link).toMatch(/^https:\/\//);
    for (const bad of ['http://youtube.com/watch?v=abc', 'https://example.com/video', 'not a link'])
      expect((await failure(link(bad))).field).toBe('link');
  });

  it('only uploads to my classes in the active term', async () => {
    expect((await failure(ade.post('/v1/materials', upload({ armId: 'mc-jss3a' })))).status).toBe(
      403,
    );
    expect(
      (await failure(ade.post('/v1/materials', upload(), { params: { term: PAST } }))).code,
    ).toBe('TERM_LOCKED');
  });
});

describe('Archive and restore', () => {
  it('archives and restores, and linked assignments show it as unavailable', async () => {
    const m = MATERIALS.find(
      (x) => x.teacherId === 'ade' && x.armId === 'mc-jss2b' && x.status === 'Published',
    )!;
    const { data: created } = await ade.post<AssignmentDetail>('/v1/assignments', {
      armId: 'mc-jss2b',
      subject: 'MTH',
      title: 'Read the notes',
      instructions: 'Read and summarise.',
      dueAt: '2026-12-16T16:00',
      maxScore: 10,
      allowLate: false,
      attachments: [
        { ...m.file!, name: m.file?.name ?? m.title, materialId: m.id, bytes: m.file?.bytes ?? 1 },
      ],
      publish: true,
    });
    expect(created.attachments[0]?.unavailable).toBe(false);
    const { data: archived } = await ade.post<MaterialDetail>(`/v1/materials/${m.id}/archive`);
    expect(archived.status).toBe('Archived');
    expect(archived.linkedAssignments.map((a) => a.id)).toContain(created.id);
    expect(archived.history[0]?.detail).toMatch(/1 assignment now show/);
    const { data: after } = await ade.get<AssignmentDetail>(`/v1/assignments/${created.id}`);
    expect(after.attachments[0]?.unavailable).toBe(true);
    expect((await failure(ade.post(`/v1/materials/${m.id}/archive`))).status).toBe(422);
    const { data: restored } = await ade.post<MaterialDetail>(`/v1/materials/${m.id}/restore`);
    expect(restored.status).toBe('Published');
  });

  it('hides other teachers’ materials and locks past terms', async () => {
    const theirs = MATERIALS.find((x) => x.teacherId === 'okafor')!;
    const f = await failure(ade.get(`/v1/materials/${theirs.id}`));
    expect(f.status).toBe(403);
    expect(f.message).not.toContain(theirs.title);
    expect((await failure(ade.post(`/v1/materials/${theirs.id}/archive`))).status).toBe(403);
    const past = MATERIALS.find((x) => x.teacherId === 'okafor' && x.termId === PAST)!;
    const { data } = await okafor.get<MaterialDetail>(`/v1/materials/${past.id}`);
    expect(data.permissions.archive).toBe(false);
    expect((await failure(okafor.post(`/v1/materials/${past.id}/archive`))).code).toBe(
      'TERM_LOCKED',
    );
  });
});
