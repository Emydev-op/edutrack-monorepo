import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { GroupRole, GroupTemplateKind, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { eventTypeFromDb, isoDate } from '../academics/academic-format.js';
import { SessionsService } from '../academics/sessions.service.js';
import { schoolFileKey } from '../profile/school-files.js';
import { asGroupSchool } from './group-context.js';

type Kind = GroupTemplateKind;
export const TEMPLATE_KINDS: { kind: Kind; key: string; label: string; description: string }[] = [
  {
    kind: 'GRADING',
    key: 'grading',
    label: 'Grading & assessment',
    description: 'Score components, weights, grade scale and promotion rule per section',
  },
  {
    kind: 'FEES',
    key: 'fees',
    label: 'Fee items',
    description: 'Fee items, and their amounts per class level this term',
  },
  {
    kind: 'ROLES',
    key: 'roles',
    label: 'Roles & permissions',
    description: 'The school’s own School Admin roles and what they can do',
  },
  {
    kind: 'MESSAGES',
    key: 'messages',
    label: 'Message templates',
    description: 'SMS and email wording for results, fees and announcements',
  },
  {
    kind: 'CALENDAR',
    key: 'calendar',
    label: 'Term dates',
    description:
      'This session’s term dates and events (resumption, mid-term, exams), for a session of the same name',
  },
  {
    kind: 'SUBJECTS',
    key: 'subjects',
    label: 'Subjects & curriculum',
    description: 'Subjects, and which class levels offer each one this session',
  },
  {
    kind: 'POLICIES',
    key: 'policies',
    label: 'School policies',
    description:
      'Exempt-score reweighting, promotion suggestions and fee holds, register edit window and sign-in rules',
  },
  {
    kind: 'BRANDING',
    key: 'branding',
    label: 'Branding',
    description: 'Logo, brand colour and motto',
  },
];
const byKey = new Map(TEMPLATE_KINDS.map((k) => [k.key, k]));

/** Who may save and apply each template: the owner all; finance fees; academic grading. */
const MAY: Record<Kind, GroupRole[]> = {
  GRADING: ['OWNER', 'ACADEMIC'],
  FEES: ['OWNER', 'FINANCE'],
  ROLES: ['OWNER'],
  MESSAGES: ['OWNER'],
  CALENDAR: ['OWNER', 'ACADEMIC'],
  SUBJECTS: ['OWNER', 'ACADEMIC'],
  POLICIES: ['OWNER'],
  BRANDING: ['OWNER'],
};

const dec = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);
/**
 * Does a school's setup carry everything the template has, unchanged? Each list in the template
 * (sections, fee items and amounts, roles, message wordings) must appear item for item; the
 * school's own extra items don't make it differ. Grading compares only sections the school runs.
 */
/** JSON with sorted keys: the database reorders a stored template's keys. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

function matches(template: unknown, own: unknown): boolean {
  if (!own) return false;
  const t = template as Record<string, unknown[]>;
  const o = own as Record<string, unknown[]>;
  // Keys starting with "_" carry what's needed to copy (a logo's file), not what's compared.
  return Object.keys(t)
    .filter((key) => !key.startsWith('_'))
    .every((key) => {
      const mine = new Set((o[key] ?? []).map(canonical));
      const theirs = t[key] ?? [];
      if (key === 'sections') {
        const codes = new Set((o[key] ?? []).map((x) => (x as { code: string }).code));
        const shared = theirs.filter((x) => codes.has((x as { code: string }).code));
        return shared.length > 0 && shared.every((x) => mine.has(canonical(x)));
      }
      return theirs.every((x) => mine.has(canonical(x)));
    });
}

interface GradingData {
  sections: {
    code: string;
    mode: string;
    scaleName: string;
    passMark: number | null;
    rounding: string;
    showPosition: boolean;
    promotionMinAverage: number | null;
    promotionSubjects: string[];
    components: {
      key: string;
      name: string;
      maxScore: number | null;
      weight: number | null;
      typicalWhen: string;
    }[];
    gradeBands: {
      grade: string;
      minScore: number | null;
      maxScore: number | null;
      remark: string;
      points: number | null;
      isPass: boolean;
    }[];
    ratings: { name: string; description: string }[];
  }[];
}
interface FeesData {
  items: { name: string; category: string; charged: string; type: string; description: string }[];
  amounts: { level: string; item: string; amountKobo: string }[];
}
interface RolesData {
  roles: { name: string; description: string; scope: string; permissions: unknown }[];
}
interface MessagesData {
  templates: { event: string; channel: string; subject: string; body: string }[];
}
interface CalendarData {
  session: { name: string; startsOn: string; endsOn: string }[];
  terms: {
    sequence: number;
    name: string;
    startsOn: string;
    endsOn: string;
    events: { type: string; name: string; startsOn: string; endsOn: string }[];
  }[];
}
interface SubjectsData {
  subjects: {
    code: string;
    name: string;
    category: string;
    periodsPerWeek: number;
    section: string | null;
  }[];
  offerings: { level: string; subject: string; offering: string; periodsPerWeek: number | null }[];
}
interface PoliciesData {
  policies: {
    reweightExempt: boolean;
    promotionSuggestions: boolean;
    blockPromotionOnFees: boolean;
    registerEditDays: number;
    idleTimeoutMinutes: number;
    lockoutAttempts: number;
    lockoutMinutes: number;
    passwordExpiryDays: number;
  }[];
}
interface BrandingData {
  brand: { brandColor: string | null; motto: string | null; logo: string | null }[];
  _logo?: { storageKey: string; mimeType: string; name: string } | null;
}

/**
 * Group templates (School Admin › Group overview › Templates): the group's shared setup, saved
 * from one member school and applied, on request, to the schools the owner picks. Each school
 * gets its own copy it can still adjust; before applying, each school shows whether its setup
 * matches the template, differs, or has none yet. Grading skips a section whose scheme is locked
 * (scores entered); fees skip a branch whose fee structure this term is published.
 */
@Injectable()
export class GroupTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly storage: StorageService,
  ) {}

  private async staff(auth: AuthUserContext) {
    const s = await this.prisma.groupStaff.findFirst({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'asc' },
      include: {
        group: {
          include: { schools: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
        },
      },
    });
    if (!s)
      throw AppException.forbidden(
        'Group templates are for the school group’s own staff.',
        'NOT_GROUP_STAFF',
      );
    return s;
  }

  private kindOf(key: string) {
    const k = byKey.get(key);
    if (!k) throw AppException.notFound('Unknown template', 'TEMPLATE_NOT_FOUND');
    return k;
  }

  private require(role: GroupRole, kind: Kind) {
    if (!MAY[kind].includes(role))
      throw AppException.forbidden(
        'Your group role can’t change this template.',
        'GROUP_ROLE_FORBIDDEN',
      );
  }

  /* ---------------- Reading a school's setup ---------------- */

  private async activeSession(schoolId: string) {
    return this.prisma.academicSession.findFirst({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true },
    });
  }

  private async capture(kind: Kind, schoolId: string): Promise<unknown> {
    switch (kind) {
      case 'GRADING': {
        const session = await this.activeSession(schoolId);
        if (!session) return null;
        const [schemes, subjects] = await Promise.all([
          this.prisma.assessmentScheme.findMany({
            where: { schoolId, sessionId: session.id },
            include: {
              section: { select: { code: true } },
              components: { orderBy: { sortOrder: 'asc' } },
              gradeBands: { orderBy: { sortOrder: 'asc' } },
              ratings: { orderBy: { sortOrder: 'asc' } },
            },
          }),
          this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true } }),
        ]);
        const code = new Map(subjects.map((s) => [s.id, s.code]));
        const data: GradingData = {
          sections: schemes
            .map((s) => ({
              code: s.section.code,
              mode: s.mode,
              scaleName: s.scaleName,
              passMark: dec(s.passMark),
              rounding: s.rounding,
              showPosition: s.showPosition,
              promotionMinAverage: dec(s.promotionMinAverage),
              promotionSubjects: s.promotionSubjectIds
                .map((id) => code.get(id))
                .filter((c): c is string => !!c)
                .sort(),
              components: s.components.map((c) => ({
                key: c.key,
                name: c.name,
                maxScore: dec(c.maxScore),
                weight: dec(c.weight),
                typicalWhen: c.typicalWhen,
              })),
              gradeBands: s.gradeBands.map((g) => ({
                grade: g.grade,
                minScore: dec(g.minScore),
                maxScore: dec(g.maxScore),
                remark: g.remark,
                points: dec(g.points),
                isPass: g.isPass,
              })),
              ratings: s.ratings.map((r) => ({ name: r.name, description: r.description })),
            }))
            .sort((a, b) => a.code.localeCompare(b.code)),
        };
        return data.sections.length ? data : null;
      }
      case 'FEES': {
        const items = await this.prisma.feeItem.findMany({
          where: { schoolId, status: 'ACTIVE' },
          orderBy: { name: 'asc' },
        });
        const term = await this.prisma.term.findFirst({
          where: { schoolId, status: 'ACTIVE' },
          select: { id: true },
        });
        // The first campus's structure for this term carries the amounts.
        const structure = term
          ? await this.prisma.feeStructure.findFirst({
              where: { schoolId, termId: term.id },
              orderBy: { createdAt: 'asc' },
              include: {
                amounts: {
                  include: {
                    level: { select: { name: true } },
                    feeItem: { select: { name: true } },
                  },
                },
              },
            })
          : null;
        const data: FeesData = {
          items: items.map((i) => ({
            name: i.name,
            category: i.category,
            charged: i.charged,
            type: i.type,
            description: i.description,
          })),
          amounts: (structure?.amounts ?? [])
            .map((a) => ({
              level: a.level.name,
              item: a.feeItem.name,
              amountKobo: a.amountKobo.toString(),
            }))
            .sort((a, b) => a.level.localeCompare(b.level) || a.item.localeCompare(b.item)),
        };
        return data.items.length ? data : null;
      }
      case 'ROLES': {
        const roles = await this.prisma.schoolRole.findMany({
          where: { schoolId, type: 'CUSTOM', archivedAt: null },
          orderBy: { name: 'asc' },
        });
        const data: RolesData = {
          roles: roles.map((r) => ({
            name: r.name,
            description: r.description,
            scope: r.scope,
            permissions: r.permissions,
          })),
        };
        return data.roles.length ? data : null;
      }
      case 'MESSAGES': {
        const rows = await this.prisma.messageTemplate.findMany({
          where: { schoolId },
          orderBy: [{ event: 'asc' }, { channel: 'asc' }],
        });
        const data: MessagesData = {
          templates: rows.map((t) => ({
            event: t.event,
            channel: t.channel,
            subject: t.subject,
            body: t.body,
          })),
        };
        return data.templates.length ? data : null;
      }
      case 'CALENDAR': {
        const session = await this.prisma.academicSession.findFirst({
          where: { schoolId, status: 'ACTIVE' },
          include: {
            terms: {
              orderBy: { sequence: 'asc' },
              include: { events: { orderBy: [{ startsOn: 'asc' }, { name: 'asc' }] } },
            },
          },
        });
        if (!session?.terms.length) return null;
        const data: CalendarData = {
          session: [
            {
              name: session.name,
              startsOn: isoDate(session.startsOn),
              endsOn: isoDate(session.endsOn),
            },
          ],
          terms: session.terms.map((t) => ({
            sequence: t.sequence,
            name: t.name,
            startsOn: isoDate(t.startsOn),
            endsOn: isoDate(t.endsOn),
            events: t.events.map((e) => ({
              type: eventTypeFromDb(e.type),
              name: e.name,
              startsOn: isoDate(e.startsOn),
              endsOn: isoDate(e.endsOn),
            })),
          })),
        };
        return data;
      }
      case 'SUBJECTS': {
        const session = await this.activeSession(schoolId);
        const subjects = await this.prisma.subject.findMany({
          where: { schoolId, status: 'ACTIVE' },
          orderBy: { code: 'asc' },
          include: { section: { select: { code: true } } },
        });
        if (!subjects.length) return null;
        const entries = session
          ? await this.prisma.curriculumEntry.findMany({
              where: { schoolId, sessionId: session.id },
              include: {
                level: { select: { name: true } },
                subject: { select: { code: true } },
              },
            })
          : [];
        const data: SubjectsData = {
          subjects: subjects.map((x) => ({
            code: x.code,
            name: x.name,
            category: x.category,
            periodsPerWeek: x.periodsPerWeek,
            section: x.section?.code ?? null,
          })),
          offerings: entries
            .map((e) => ({
              level: e.level.name,
              subject: e.subject.code,
              offering: e.offering,
              periodsPerWeek: e.periodsPerWeek,
            }))
            .sort((a, b) => a.level.localeCompare(b.level) || a.subject.localeCompare(b.subject)),
        };
        return data;
      }
      case 'POLICIES': {
        const p = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
        if (!p) return null;
        const data: PoliciesData = {
          policies: [
            {
              reweightExempt: p.reweightExempt,
              promotionSuggestions: p.promotionSuggestions,
              blockPromotionOnFees: p.blockPromotionOnFees,
              registerEditDays: p.registerEditDays,
              idleTimeoutMinutes: p.idleTimeoutMinutes,
              lockoutAttempts: p.lockoutAttempts,
              lockoutMinutes: p.lockoutMinutes,
              passwordExpiryDays: p.passwordExpiryDays,
            },
          ],
        };
        return data;
      }
      case 'BRANDING': {
        const school = await this.prisma.school.findUniqueOrThrow({
          where: { id: schoolId },
          select: { brandColor: true, motto: true, logoFile: true },
        });
        const logo = school.logoFile && !school.logoFile.deletedAt ? school.logoFile : null;
        if (!school.brandColor && !school.motto && !logo) return null;
        const data: BrandingData = {
          brand: [
            {
              brandColor: school.brandColor?.toUpperCase() ?? null,
              motto: school.motto ?? null,
              logo: logo?.sha256 ?? null,
            },
          ],
          _logo: logo
            ? { storageKey: logo.storageKey, mimeType: logo.mimeType, name: logo.originalName }
            : null,
        };
        return data;
      }
    }
  }

  /* ---------------- Views ---------------- */

  /** `GET /v1/group/templates`: each template, and whether each school matches it. */
  async list(auth: AuthUserContext) {
    const s = await this.staff(auth);
    const saved = await this.prisma.groupTemplate.findMany({ where: { groupId: s.groupId } });
    const schools = s.group.schools;
    const out = [];
    for (const k of TEMPLATE_KINDS) {
      const t = saved.find((x) => x.kind === k.kind);
      const states = await Promise.all(
        schools.map(async (sc) => {
          const own = await this.capture(k.kind, sc.id);
          return {
            schoolId: sc.id,
            school: sc.name,
            status: !t
              ? null
              : own === null
                ? ('Not set' as const)
                : matches(t.data, own)
                  ? ('Matches' as const)
                  : ('Differs' as const),
          };
        }),
      );
      out.push({
        key: k.key,
        label: k.label,
        description: k.description,
        canEdit: MAY[k.kind].includes(s.role),
        saved: t
          ? {
              at: t.savedAt.toISOString(),
              from: schools.find((x) => x.id === t.sourceSchoolId)?.name ?? null,
            }
          : null,
        schools: states,
      });
    }
    return { group: s.group.name, templates: out };
  }

  /** `POST /v1/group/templates/:key/save`: the template becomes that school's current setup. */
  async save(auth: AuthUserContext, key: string, schoolId: string) {
    const s = await this.staff(auth);
    const k = this.kindOf(key);
    this.require(s.role, k.kind);
    const school = s.group.schools.find((x) => x.id === schoolId);
    if (!school) throw AppException.forbidden('Choose a school of your group.', 'NOT_IN_GROUP');
    const data = await this.capture(k.kind, schoolId);
    if (data === null)
      throw AppException.conflict(
        `${school.name} has no ${k.label.toLowerCase()} set up to save yet.`,
        'NOTHING_TO_SAVE',
      );
    const now = this.clock.now();
    await this.prisma.groupTemplate.upsert({
      where: { groupId_kind: { groupId: s.groupId, kind: k.kind } },
      create: {
        groupId: s.groupId,
        kind: k.kind,
        data: data as Prisma.InputJsonValue,
        sourceSchoolId: schoolId,
        savedById: auth.userId,
        savedAt: now,
      },
      update: {
        data: data as Prisma.InputJsonValue,
        sourceSchoolId: schoolId,
        savedById: auth.userId,
        savedAt: now,
      },
    });
    return { label: k.label, school: school.name, ...(await this.list(auth)) };
  }

  /** `POST /v1/group/templates/:key/apply`: copies the template into the schools chosen. */
  async apply(auth: AuthUserContext, key: string, schoolIds: string[]) {
    const s = await this.staff(auth);
    const k = this.kindOf(key);
    this.require(s.role, k.kind);
    const t = await this.prisma.groupTemplate.findUnique({
      where: { groupId_kind: { groupId: s.groupId, kind: k.kind } },
    });
    if (!t) throw AppException.conflict('Save the template from a school first.', 'NO_TEMPLATE');
    const targets = s.group.schools.filter((x) => schoolIds.includes(x.id));
    if (!targets.length)
      throw AppException.validation(
        { schoolIds: 'Choose at least one school.' },
        'Choose at least one school.',
      );
    const results = [];
    for (const sc of targets) {
      try {
        const notes = await this.write(k.kind, sc.id, t.data, auth.userId);
        results.push({ school: sc.name, applied: true, notes });
      } catch (e) {
        results.push({
          school: sc.name,
          applied: false,
          notes: [e instanceof Error ? e.message : 'Not applied'],
        });
      }
    }
    return { label: k.label, results, ...(await this.list(auth)) };
  }

  /* ---------------- Writing a school's copy ---------------- */

  private async write(
    kind: Kind,
    schoolId: string,
    raw: unknown,
    userId: string,
  ): Promise<string[]> {
    const notes: string[] = [];
    switch (kind) {
      case 'GRADING': {
        const data = raw as GradingData;
        const session = await this.activeSession(schoolId);
        if (!session) throw new Error('No active session.');
        const [sections, subjects] = await Promise.all([
          this.prisma.section.findMany({
            where: { schoolId },
            select: { id: true, code: true, name: true },
          }),
          this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true } }),
        ]);
        for (const sec of data.sections) {
          const target = sections.find((x) => x.code === sec.code);
          if (!target) continue; // The school doesn't run this section.
          const existing = await this.prisma.assessmentScheme.findFirst({
            where: { schoolId, sessionId: session.id, sectionId: target.id },
          });
          if (existing?.lockedAt) {
            notes.push(`${target.name} kept: scores are already entered this session.`);
            continue;
          }
          const fields = {
            mode: sec.mode as never,
            scaleName: sec.scaleName,
            passMark: sec.passMark ?? 40,
            rounding: sec.rounding as never,
            showPosition: sec.showPosition,
            promotionMinAverage: sec.promotionMinAverage,
            promotionSubjectIds: sec.promotionSubjects
              .map((c) => subjects.find((x) => x.code === c)?.id)
              .filter((x): x is string => !!x),
          };
          await this.prisma.$transaction(async (tx) => {
            const scheme = existing
              ? await tx.assessmentScheme.update({ where: { id: existing.id }, data: fields })
              : await tx.assessmentScheme.create({
                  data: { schoolId, sessionId: session.id, sectionId: target.id, ...fields },
                });
            await tx.assessmentComponent.deleteMany({ where: { schemeId: scheme.id } });
            await tx.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
            await tx.descriptiveRating.deleteMany({ where: { schemeId: scheme.id } });
            await tx.assessmentComponent.createMany({
              data: sec.components.map((c, i) => ({
                schoolId,
                schemeId: scheme.id,
                key: c.key,
                name: c.name,
                maxScore: c.maxScore ?? 0,
                weight: c.weight ?? 0,
                typicalWhen: c.typicalWhen,
                sortOrder: i + 1,
              })),
            });
            await tx.gradeBand.createMany({
              data: sec.gradeBands.map((g, i) => ({
                schoolId,
                schemeId: scheme.id,
                grade: g.grade,
                minScore: g.minScore ?? 0,
                maxScore: g.maxScore ?? 0,
                remark: g.remark,
                points: g.points ?? 0,
                isPass: g.isPass,
                sortOrder: i + 1,
              })),
            });
            await tx.descriptiveRating.createMany({
              data: sec.ratings.map((r, i) => ({
                schoolId,
                schemeId: scheme.id,
                name: r.name,
                description: r.description,
                sortOrder: i + 1,
              })),
            });
          });
        }
        return notes;
      }
      case 'FEES': {
        const data = raw as FeesData;
        const ids = new Map<string, string>();
        for (const i of data.items) {
          const row = await this.prisma.feeItem.upsert({
            where: { schoolId_name: { schoolId, name: i.name } },
            create: {
              schoolId,
              name: i.name,
              category: i.category as never,
              charged: i.charged as never,
              type: i.type as never,
              description: i.description,
            },
            update: {
              category: i.category as never,
              charged: i.charged as never,
              type: i.type as never,
              description: i.description,
              status: 'ACTIVE',
            },
          });
          ids.set(i.name, row.id);
        }
        if (!data.amounts.length) return notes;
        const term = await this.prisma.term.findFirst({
          where: { schoolId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!term) {
          notes.push('Amounts not copied: there’s no active term.');
          return notes;
        }
        const [branches, levels] = await Promise.all([
          this.prisma.branch.findMany({
            where: { schoolId, status: 'ACTIVE' },
            select: { id: true, name: true },
          }),
          this.prisma.classLevel.findMany({
            where: { schoolId },
            select: { id: true, name: true },
          }),
        ]);
        for (const b of branches) {
          const structure =
            (await this.prisma.feeStructure.findFirst({
              where: { termId: term.id, branchId: b.id },
            })) ??
            (await this.prisma.feeStructure.create({
              data: { schoolId, termId: term.id, branchId: b.id },
            }));
          if (structure.status === 'PUBLISHED') {
            notes.push(`${b.name}: amounts kept (this term’s fees are published).`);
            continue;
          }
          for (const a of data.amounts) {
            const levelId = levels.find((l) => l.name === a.level)?.id;
            const feeItemId = ids.get(a.item);
            if (!levelId || !feeItemId) continue;
            await this.prisma.feeStructureAmount.upsert({
              where: {
                structureId_levelId_feeItemId: { structureId: structure.id, levelId, feeItemId },
              },
              create: {
                schoolId,
                structureId: structure.id,
                levelId,
                feeItemId,
                amountKobo: BigInt(a.amountKobo),
              },
              update: { amountKobo: BigInt(a.amountKobo) },
            });
          }
        }
        return notes;
      }
      case 'ROLES': {
        const data = raw as RolesData;
        for (const r of data.roles) {
          const existing = await this.prisma.schoolRole.findFirst({
            where: { schoolId, name: r.name },
          });
          if (existing && existing.type !== 'CUSTOM') {
            notes.push(`${r.name} kept: it’s one of the school’s built-in roles.`);
            continue;
          }
          const fields = {
            description: r.description,
            scope: r.scope as never,
            permissions: r.permissions as Prisma.InputJsonValue,
            archivedAt: null,
          };
          if (existing)
            await this.prisma.schoolRole.update({ where: { id: existing.id }, data: fields });
          else
            await this.prisma.schoolRole.create({
              data: { schoolId, name: r.name, type: 'CUSTOM', ...fields },
            });
        }
        return notes;
      }
      case 'MESSAGES': {
        const data = raw as MessagesData;
        for (const m of data.templates)
          await this.prisma.messageTemplate.upsert({
            where: {
              schoolId_event_channel: {
                schoolId,
                event: m.event as never,
                channel: m.channel as never,
              },
            },
            create: {
              schoolId,
              event: m.event as never,
              channel: m.channel as never,
              subject: m.subject,
              body: m.body,
            },
            update: { subject: m.subject, body: m.body },
          });
        return notes;
      }
      case 'CALENDAR':
        return this.writeCalendar(schoolId, raw as CalendarData, userId);
      case 'SUBJECTS':
        return this.writeSubjects(schoolId, raw as SubjectsData);
      case 'POLICIES': {
        const p = (raw as PoliciesData).policies[0];
        if (!p) return notes;
        await this.prisma.schoolSettings.upsert({
          where: { schoolId },
          create: { schoolId, ...p },
          update: p,
        });
        return notes;
      }
      case 'BRANDING':
        return this.writeBranding(schoolId, raw as BrandingData, userId);
    }
  }

  /** The session of the same name gets the template's term dates and events. */
  private async writeCalendar(schoolId: string, data: CalendarData, userId: string) {
    const from = data.session[0];
    if (!from) return [];
    const session = await this.prisma.academicSession.findFirst({
      where: { schoolId, name: from.name },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
    if (!session)
      throw new Error(
        `No ${from.name} session yet. Add it in Academics › Sessions, then apply the term dates.`,
      );
    if (['CLOSED', 'ARCHIVED'].includes(session.status))
      throw new Error(`${session.name} is closed, so its term dates can’t change.`);
    await this.prisma.academicSession.update({
      where: { id: session.id },
      data: { startsOn: new Date(from.startsOn), endsOn: new Date(from.endsOn) },
    });
    await asGroupSchool(this.prisma, schoolId, userId, () =>
      this.sessions.saveTerms(
        schoolId,
        session.id,
        data.terms.map((t) => ({
          id: session.terms.find((x) => x.sequence === t.sequence)?.id,
          name: t.name,
          start: t.startsOn,
          end: t.endsOn,
          events: t.events.map((e) => ({
            type: e.type as never,
            name: e.name,
            start: e.startsOn,
            end: e.endsOn,
          })),
        })),
      ),
    );
    return [];
  }

  /**
   * Subjects are added or updated by code (the school's own extra subjects stay), and this
   * session's curriculum gains the template's offerings at class levels of the same name.
   */
  private async writeSubjects(schoolId: string, data: SubjectsData) {
    const notes: string[] = [];
    const [sections, levels, session] = await Promise.all([
      this.prisma.section.findMany({ where: { schoolId }, select: { id: true, code: true } }),
      this.prisma.classLevel.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      this.activeSession(schoolId),
    ]);
    const ids = new Map<string, string>();
    const notRun = new Set<string>();
    for (const x of data.subjects) {
      const sectionId = x.section ? (sections.find((s) => s.code === x.section)?.id ?? null) : null;
      // A subject of a section this school doesn't run isn't copied.
      if (x.section && !sectionId) {
        notRun.add(x.section);
        continue;
      }
      const fields = {
        name: x.name,
        category: x.category as never,
        periodsPerWeek: x.periodsPerWeek,
        sectionId,
        status: 'ACTIVE' as const,
      };
      const row = await this.prisma.subject.upsert({
        where: { schoolId_code: { schoolId, code: x.code } },
        create: { schoolId, code: x.code, ...fields },
        update: fields,
      });
      ids.set(x.code, row.id);
    }
    if (notRun.size)
      notes.push(
        `Subjects of sections this school doesn’t run (${[...notRun].join(', ')}) were skipped.`,
      );
    if (!data.offerings.length) return notes;
    if (!session) {
      notes.push('Curriculum not copied: there’s no active session.');
      return notes;
    }
    const missing = new Set<string>();
    for (const o of data.offerings) {
      const levelId = levels.find((l) => l.name === o.level)?.id;
      const subjectId = ids.get(o.subject);
      if (!levelId) {
        missing.add(o.level);
        continue;
      }
      if (!subjectId) continue;
      await this.prisma.curriculumEntry.upsert({
        where: {
          sessionId_levelId_subjectId: { sessionId: session.id, levelId, subjectId },
        },
        create: {
          schoolId,
          sessionId: session.id,
          levelId,
          subjectId,
          offering: o.offering as never,
          periodsPerWeek: o.periodsPerWeek,
        },
        update: { offering: o.offering as never, periodsPerWeek: o.periodsPerWeek },
      });
    }
    if (missing.size)
      notes.push(`No class level named ${[...missing].join(', ')}: those offerings were skipped.`);
    return notes;
  }

  /** The brand colour and motto, and a copy of the logo file. */
  private async writeBranding(schoolId: string, data: BrandingData, userId: string) {
    const b = data.brand[0];
    if (!b) return [];
    const notes: string[] = [];
    let logoFileId: string | null | undefined;
    if (data._logo) {
      try {
        const bytes = await this.storage.download(data._logo.storageKey);
        const ext = data._logo.name.split('.').pop() ?? 'png';
        const file = schoolFileKey(schoolId, 'branding', ext);
        await this.storage.upload(file.storageKey, bytes, data._logo.mimeType);
        await this.prisma.storedFile.create({
          data: {
            id: file.id,
            schoolId,
            storageKey: file.storageKey,
            originalName: data._logo.name,
            mimeType: data._logo.mimeType,
            sizeBytes: BigInt(bytes.length),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            uploadedById: userId,
          },
        });
        logoFileId = file.id;
      } catch {
        notes.push('Logo not copied: the template’s logo file couldn’t be read.');
      }
    } else if (!b.logo) logoFileId = null;
    const previous = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { logoFileId: true },
    });
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        brandColor: b.brandColor,
        motto: b.motto,
        ...(logoFileId !== undefined && { logoFileId }),
      },
    });
    if (logoFileId !== undefined && previous.logoFileId && previous.logoFileId !== logoFileId)
      await this.prisma.storedFile.update({
        where: { id: previous.logoFileId },
        data: { deletedAt: this.clock.now() },
      });
    return notes;
  }
}
