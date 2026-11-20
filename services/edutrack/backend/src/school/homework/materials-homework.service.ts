import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MaterialType } from '../../generated/prisma/enums.js';
import type { ArmInfo } from '../academics/academic-catalog.service.js';
import { plural } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import {
  ASSIGNMENT_STATUS,
  fieldError,
  forbidden,
  HomeworkCoreService,
  MATERIAL_STATUS,
  MATERIAL_TYPE,
  MATERIAL_TYPE_BY_LABEL,
  termLocked,
  unprocessable,
} from './homework-core.service.js';
import { extOf, HomeworkFilesService } from './homework-files.js';

export const MATERIAL_LIMITS = { title: 120, description: 1000 };
/** File extensions accepted for each file type. */
const EXTENSIONS: Record<Exclude<MaterialType, 'VIDEO_LINK'>, string[]> = {
  PDF: ['pdf'],
  DOCUMENT: ['doc', 'docx'],
  PRESENTATION: ['ppt', 'pptx'],
  IMAGE: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
};
/** Video links must be https:// on one of these hosts. */
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'drive.google.com'];

const include = {
  subject: { select: { id: true, code: true, name: true } },
  file: true,
  attachedTo: { include: { assignment: { select: { id: true, title: true, status: true } } } },
  _count: { select: { views: true } },
} satisfies Prisma.MaterialInclude;
type MaterialFull = Prisma.MaterialGetPayload<{ include: typeof include }>;

export interface MaterialBody {
  armId?: string;
  subject?: string;
  type?: string;
  title?: string;
  description?: string;
  file?: { id?: string; name?: string } | null;
  link?: string | null;
}

/**
 * Teacher Workspace › Materials: files (PDF, documents, slides, images) and video links a teacher
 * shares with a class they teach for a subject; archive hides one from students (assignments that
 * attach it then show it as unavailable), restore brings it back. Shapes follow the mock
 * (`teacher-portal/src/api/mock/handlers/materials.ts`).
 */
@Injectable()
export class MaterialsHomeworkService {
  constructor(
    private readonly core: HomeworkCoreService,
    private readonly files: HomeworkFilesService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.core.db;
  }
  private get scope() {
    return this.core.scope;
  }

  private async teaching(staffId: string, term: TermRow, armId: string, subject: string) {
    const mine = await this.scope.assignments(staffId, term.id);
    const found = mine.find((a) => a.armId === armId && a.subject.code === subject);
    if (!found) throw forbidden('You don’t teach that class and subject this term.');
    return found;
  }

  private async own(auth: AuthUserContext, id: string) {
    const s = await this.scope.staff(auth);
    const m = await this.db.material.findFirst({ where: { id }, include });
    if (!m) throw AppException.notFound('That material doesn’t exist.', 'NOT_FOUND');
    const [term, arm] = await Promise.all([
      this.scope.term(m.termId),
      this.scope.catalog.arm(m.armId),
    ]);
    if (m.teacherStaffId !== s.id)
      throw forbidden(
        `You don’t have access to this material for ${arm?.label ?? 'that class'} · ${m.subject.name}.`,
      );
    await this.teaching(s.id, term, m.armId, m.subject.code);
    return { m, term, arm: arm! };
  }

  private row(m: MaterialFull, arm: ArmInfo) {
    return {
      id: m.id,
      termId: m.termId,
      armId: m.armId,
      armName: arm.label,
      subject: m.subject.code,
      subjectName: m.subject.name,
      classLabel: HomeworkCoreService.classLabel(arm, m.subject),
      type: MATERIAL_TYPE[m.type],
      title: m.title,
      status: MATERIAL_STATUS[m.status],
      file: m.file ? HomeworkFilesService.ref(m.file) : null,
      link: m.linkUrl,
      views: m.viewCount,
      publishedAt: this.core.local(m.publishedAt)!,
      archivedAt: this.core.local(m.archivedAt),
    };
  }

  private async detail(m: MaterialFull, term: TermRow, arm: ArmInfo) {
    const lockReason = TeacherScopeService.lockReason(term);
    const roll = await this.core.rolls()(term.sessionId, arm, m.subjectId);
    return {
      ...this.row(m, arm),
      file: m.file ? await this.files.view(m.file) : null,
      description: m.description,
      branchName: arm.branch,
      viewers: m._count.views,
      students: roll.length,
      lastViewedAt: this.core.local(m.lastViewedAt),
      linkedAssignments: m.attachedTo.map((x) => ({
        id: x.assignment.id,
        title: x.assignment.title,
        status: ASSIGNMENT_STATUS[x.assignment.status],
      })),
      permissions: {
        archive: !lockReason && m.status === 'PUBLISHED',
        restore: !lockReason && m.status === 'ARCHIVED',
        lockReason,
      },
      history: await this.core.timeline('Material', m.id),
    };
  }

  async list(
    auth: AuthUserContext,
    q: {
      term?: string;
      class?: string;
      subject?: string;
      type?: string;
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(q.term);
    if (q.class && q.subject) await this.teaching(s.id, term, q.class, q.subject);
    const mine = await this.db.material.findMany({
      where: {
        termId: term.id,
        teacherStaffId: s.id,
        ...(q.class && { armId: q.class }),
        ...(q.subject && { subject: { code: q.subject } }),
      },
      include,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    const arms = new Map((await this.scope.catalog.arms()).map((a) => [a.id, a]));
    const rows = mine.filter((m) => arms.has(m.armId)).map((m) => this.row(m, arms.get(m.armId)!));
    const counts = {
      Published: rows.filter((r) => r.status === 'Published').length,
      Archived: rows.filter((r) => r.status === 'Archived').length,
    };
    const search = (q.search ?? '').trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!q.type || r.type === q.type) &&
        (!q.status || r.status === q.status) &&
        (!search || `${r.title} ${r.classLabel} ${r.type}`.toLowerCase().includes(search)),
    );
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 10, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
      counts,
    };
  }

  async get(auth: AuthUserContext, id: string) {
    const { m, term, arm } = await this.own(auth, id);
    return this.detail(m, term, arm);
  }

  private videoLink(value: unknown) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) throw fieldError('link', 'Paste the video link.');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw fieldError('link', 'That isn’t a web address. Paste the full link, starting https://');
    }
    if (url.protocol !== 'https:')
      throw fieldError('link', 'Use a secure link that starts with https://');
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (!VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)))
      throw fieldError('link', 'Use a YouTube, Vimeo or Google Drive link.');
    return url.toString();
  }

  async create(auth: AuthUserContext, body: MaterialBody, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const lock = termLocked(term);
    if (lock) throw lock;
    const armId = typeof body.armId === 'string' ? body.armId : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    if (!armId || !subject) throw fieldError('armId', 'Choose the class and subject.');
    const ta = await this.teaching(s.id, term, armId, subject);
    const type = MATERIAL_TYPE_BY_LABEL[String(body.type ?? '')];
    if (!type) throw fieldError('type', 'Choose what kind of material it is.');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw fieldError('title', 'Enter a title.');
    if (title.length > MATERIAL_LIMITS.title)
      throw fieldError('title', `Keep the title to ${MATERIAL_LIMITS.title} characters.`);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > MATERIAL_LIMITS.description)
      throw fieldError(
        'description',
        `Keep the description to ${MATERIAL_LIMITS.description} characters.`,
      );
    let fileId: string | null = null;
    let linkUrl: string | null = null;
    if (type === 'VIDEO_LINK') linkUrl = this.videoLink(body.link);
    else {
      const id = body.file?.id;
      if (!id) throw fieldError('file', 'Choose a file to upload.');
      const f = (await this.files.claim(auth, [id], 'file')).get(id)!;
      const allowed = EXTENSIONS[type];
      if (!allowed.includes(extOf(f.originalName)))
        throw fieldError(
          'file',
          `“${f.originalName}” isn’t a ${type === 'IMAGE' ? 'image' : MATERIAL_TYPE[type]} file. Choose a .${allowed.join(', .')} file, or change the type.`,
        );
      fileId = id;
    }
    const roll = await this.core.rolls()(term.sessionId, ta.arm, ta.subjectId);
    const id = await this.db.$transaction(async (tx) => {
      const m = await tx.material.create({
        data: {
          schoolId: TeacherScopeService.schoolId(),
          termId: term.id,
          armId,
          subjectId: ta.subjectId,
          teacherStaffId: s.id,
          type,
          title,
          description,
          fileId,
          linkUrl,
          publishedAt: this.core.now(),
        },
      });
      await this.audit.record(
        {
          action: 'material.publish',
          area: 'Academic',
          entity: 'Material',
          entityId: m.id,
          summary: 'Published',
          detail: `Shared with ${plural(roll.length, 'student')}`,
        },
        asTx(tx),
      );
      return m.id;
    });
    return this.get(auth, id);
  }

  private async setStatus(auth: AuthUserContext, id: string, archive: boolean) {
    const { m, term } = await this.own(auth, id);
    const lock = termLocked(term);
    if (lock) throw lock;
    if (archive && m.status === 'ARCHIVED')
      throw unprocessable('This material is already archived.');
    if (!archive && m.status === 'PUBLISHED')
      throw unprocessable('This material is already published.');
    const links = m.attachedTo.length;
    await this.db.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: archive
          ? { status: 'ARCHIVED', archivedAt: this.core.now() }
          : { status: 'PUBLISHED', archivedAt: null },
      });
      await this.audit.record(
        {
          action: archive ? 'material.archive' : 'material.restore',
          area: 'Academic',
          entity: 'Material',
          entityId: id,
          summary: archive ? 'Archived' : 'Restored',
          detail: archive
            ? links
              ? `Students stopped seeing it. ${plural(links, 'assignment')} now show it as unavailable.`
              : 'Students stopped seeing it.'
            : 'Students can see it again.',
        },
        asTx(tx),
      );
    });
    return this.get(auth, id);
  }

  archive(auth: AuthUserContext, id: string) {
    return this.setStatus(auth, id, true);
  }

  restore(auth: AuthUserContext, id: string) {
    return this.setStatus(auth, id, false);
  }

  /** The newest published material for a class, for the lesson page. */
  async latestFor(termId: string, armId: string, subjectId: string) {
    const m = await this.db.material.findFirst({
      where: { termId, armId, subjectId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
    return m
      ? {
          id: m.id,
          title: m.title,
          type: MATERIAL_TYPE[m.type],
          publishedAt: this.core.local(m.publishedAt)!,
        }
      : null;
  }
}
