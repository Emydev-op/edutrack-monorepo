import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { GroupRole, GroupTemplateKind, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
];
const byKey = new Map(TEMPLATE_KINDS.map((k) => [k.key, k]));

/** Who may save and apply each template: the owner all; finance fees; academic grading. */
const MAY: Record<Kind, GroupRole[]> = {
  GRADING: ['OWNER', 'ACADEMIC'],
  FEES: ['OWNER', 'FINANCE'],
  ROLES: ['OWNER'],
  MESSAGES: ['OWNER'],
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
  return Object.keys(t).every((key) => {
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
        const notes = await this.write(k.kind, sc.id, t.data);
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

  private async write(kind: Kind, schoolId: string, raw: unknown): Promise<string[]> {
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
    }
  }
}
