import { HttpStatus, Injectable } from '@nestjs/common';
import type { Offering } from '../../generated/prisma/enums.js';
import { AcademicCatalogService } from '../academics/academic-catalog.service.js';
import { fail, plural, staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import {
  CATEGORY_BY_LABEL,
  CATEGORY_LABEL,
  OFFERING,
  OFFERING_LABEL,
  SUGGESTED_GROUPS,
  SUGGESTED_SUBJECTS,
} from './curriculum-defaults.js';

export const CURRICULUM_STEP = 'subjects-curriculum';

/** Sheets past these have scores a teacher handed in. */
export const SCORED: readonly string[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
  'APPROVED',
  'PUBLISHED',
];

export interface SubjectInput {
  code: string;
  name: string;
  category: string;
  status?: 'Active' | 'Inactive';
  periods: number;
}

export interface GroupInput {
  id?: string;
  name: string;
  section: string;
  subjects: string[];
  min: number;
  max: number;
  note?: string;
}

type CurriculumMap = Record<string, Record<string, Record<string, 'C' | 'E'>>>;

const CODE = /^[A-Z]{2,4}\d?$/;

/**
 * Academics › Subjects & Curriculum: the school's subjects, what each class level offers this
 * session (compulsory or elective) and the elective groups. Shapes and wording follow the School
 * Admin mock (`/v1/academics/curriculum`).
 */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly audit: SchoolAuditService,
    private readonly setup: SetupStateService,
  ) {}

  private get db() {
    return this.catalog.db;
  }

  /** Sections with their distinct level names, in promotion order (only sections with levels). */
  private async levelsBySection() {
    const [sections, levels] = await Promise.all([
      this.catalog.structure.sections(),
      this.db.classLevel.findMany({
        where: { branchLevels: { some: {} } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return sections
      .map((s) => ({
        id: s.id,
        code: s.code,
        section: s.name,
        levels: levels.filter((l) => l.sectionId === s.id),
      }))
      .filter((x) => x.levels.length);
  }

  async view() {
    const [session, term, subjects, bySection, confirmed] = await Promise.all([
      this.catalog.currentSession(),
      this.catalog.currentTerm(),
      this.db.subject.findMany({ orderBy: { name: 'asc' } }),
      this.levelsBySection(),
      this.setup.isConfirmed(CURRICULUM_STEP),
    ]);
    const [entries, groups, assignments, scored] = session
      ? await Promise.all([
          this.db.curriculumEntry.findMany({ where: { sessionId: session.id } }),
          this.db.electiveGroup.findMany({
            where: { sessionId: session.id },
            include: { subjects: { select: { subjectId: true } }, section: true },
            orderBy: [{ section: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
          }),
          term
            ? this.db.teachingAssignment.findMany({
                where: { termId: term.id },
                include: { staff: { select: { title: true, firstName: true, lastName: true } } },
              })
            : [],
          term
            ? this.db.resultSheet.findMany({
                where: { termId: term.id, status: { in: SCORED as never } },
                select: { subjectId: true },
                distinct: ['subjectId'],
              })
            : [],
        ])
      : [[], [], [], []];
    const code = new Map(subjects.map((s) => [s.id, s.code]));
    const curriculum: CurriculumMap = {};
    for (const { section, levels } of bySection)
      for (const lv of levels) {
        const offered = entries.filter((e) => e.levelId === lv.id);
        if (!offered.length) continue;
        curriculum[section] ??= {};
        curriculum[section][lv.name] = Object.fromEntries(
          offered.map((e) => [code.get(e.subjectId)!, OFFERING_LABEL[e.offering]]),
        );
      }
    const levelOrder = bySection.flatMap((x) => x.levels);
    const scoredIds = new Set(scored.map((s) => s.subjectId));
    return {
      subjects: subjects.map((s) => ({
        code: s.code,
        name: s.name,
        category: CATEGORY_LABEL[s.category],
        status: s.status === 'ACTIVE' ? ('Active' as const) : ('Inactive' as const),
        periods: s.periodsPerWeek,
        levels: levelOrder
          .filter((lv) => entries.some((e) => e.levelId === lv.id && e.subjectId === s.id))
          .map((lv) => lv.name),
        teachers: [
          ...new Set(
            assignments.filter((a) => a.subjectId === s.id).map((a) => staffName(a.staff)),
          ),
        ],
        hasScores: scoredIds.has(s.id),
      })),
      curriculum,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        section: g.section.name,
        subjects: g.subjects.map((x) => code.get(x.subjectId)!).filter(Boolean),
        min: g.minPicks,
        max: g.maxPicks,
        note: g.note,
      })),
      levels: bySection.map((x) => ({ section: x.section, levels: x.levels.map((l) => l.name) })),
      confirmed,
    };
  }

  private async requireSession() {
    const session = await this.catalog.currentSession();
    if (!session)
      throw fail('Create the academic session first.', 'NO_SESSION', HttpStatus.CONFLICT);
    return session;
  }

  /* ---------------- Subjects ---------------- */

  async applyDefaults(schoolId: string) {
    const session = await this.requireSession();
    if (await this.db.subject.count())
      throw fail(
        'You already have subjects. Add more one by one.',
        'SUBJECTS_EXIST',
        HttpStatus.CONFLICT,
      );
    const bySection = await this.levelsBySection();
    if (!bySection.length)
      throw fail('Add class levels in Classes & Arms first.', 'NO_LEVELS', HttpStatus.CONFLICT);
    let added = 0;
    await this.db.$transaction(async (tx) => {
      const ids = new Map<string, string>();
      for (const [name, code, category, periods, by] of SUGGESTED_SUBJECTS) {
        const secs = bySection.filter((s) => by[s.code]);
        if (!secs.length) continue;
        const subject = await tx.subject.create({
          data: { schoolId, code, name, category, periodsPerWeek: periods },
        });
        ids.set(code, subject.id);
        added++;
        for (const s of secs)
          for (const lv of s.levels)
            await tx.curriculumEntry.create({
              data: {
                schoolId,
                sessionId: session.id,
                levelId: lv.id,
                subjectId: subject.id,
                offering: OFFERING[by[s.code]!],
              },
            });
      }
      for (const s of bySection)
        for (const [name, codes, min, max, note] of SUGGESTED_GROUPS[s.code] ?? []) {
          const subjectIds = codes.flatMap((c) => (ids.has(c) ? [ids.get(c)!] : []));
          if (subjectIds.length < 2) continue;
          await tx.electiveGroup.create({
            data: {
              schoolId,
              sessionId: session.id,
              sectionId: s.id,
              name,
              minPicks: min,
              maxPicks: Math.min(max, subjectIds.length),
              note,
              subjects: { create: subjectIds.map((subjectId) => ({ schoolId, subjectId })) },
            },
          });
        }
      await this.audit.record(
        {
          action: 'subjects.defaults',
          area: 'Academic',
          entity: 'Subject',
          summary: 'Suggested subjects added',
          detail: plural(added, 'subject'),
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  private async checkSubject(p: SubjectInput, existingId?: string) {
    const name = (p.name ?? '').trim();
    if (!name) throw fail('Name the subject.', 'VALIDATION');
    if (!existingId) {
      if (!CODE.test(p.code ?? ''))
        throw fail('Use 2–4 capitals for the code, e.g. MTH.', 'VALIDATION');
      const taken = await this.db.subject.findFirst({ where: { code: p.code } });
      if (taken)
        throw fail(`The code ${p.code} is already used by ${taken.name}.`, 'SUBJECT_CODE_TAKEN');
    }
    const clash = await this.db.subject.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(existingId && { id: { not: existingId } }),
      },
    });
    if (clash) throw fail(`${name} already exists.`, 'SUBJECT_NAME_TAKEN');
    const periods = Number(p.periods);
    if (!Number.isInteger(periods) || periods < 1 || periods > 10)
      throw fail('Lessons per week must be between 1 and 10.', 'VALIDATION');
    const category = CATEGORY_BY_LABEL[p.category];
    if (!category) throw fail('Choose a category.', 'VALIDATION');
    return { name, periods, category };
  }

  async createSubject(schoolId: string, p: SubjectInput) {
    const { name, periods, category } = await this.checkSubject(p);
    await this.db.$transaction(async (tx) => {
      await tx.subject.create({
        data: {
          schoolId,
          code: p.code,
          name,
          category,
          periodsPerWeek: periods,
          status: p.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE',
        },
      });
      await this.audit.record(
        {
          action: 'subject.create',
          area: 'Academic',
          entity: 'Subject',
          summary: `Subject added: ${name}`,
          detail: p.code,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  private async subjectByCode(code: string) {
    const s = await this.db.subject.findFirst({ where: { code } });
    if (!s) throw fail('Subject not found', 'SUBJECT_NOT_FOUND', HttpStatus.NOT_FOUND);
    return s;
  }

  async updateSubject(code: string, p: SubjectInput) {
    const s = await this.subjectByCode(code);
    const { name, periods, category } = await this.checkSubject(p, s.id);
    const status = p.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
    if (status === 'INACTIVE' && s.status === 'ACTIVE') {
      const term = await this.catalog.currentTerm();
      if (
        term &&
        (await this.db.teachingAssignment.count({ where: { termId: term.id, subjectId: s.id } }))
      )
        throw fail(
          `${s.name} is still assigned to teachers. Remove those assignments first.`,
          'SUBJECT_ASSIGNED',
          HttpStatus.CONFLICT,
        );
    }
    await this.db.$transaction(async (tx) => {
      await tx.subject.update({
        where: { id: s.id },
        data: { name, periodsPerWeek: periods, category, status },
      });
      await this.audit.record(
        {
          action: 'subject.update',
          area: 'Academic',
          entity: 'Subject',
          entityId: s.id,
          summary: `Subject updated: ${name}`,
          detail: s.code,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /**
   * Deletes a subject nobody has used: its current-session curriculum, elective-group places and
   * staff qualifications go with it. Anything with history (scores, assignments, earlier sessions,
   * timetables, students' choices, lessons) keeps it: make it inactive instead.
   */
  async removeSubject(code: string) {
    const s = await this.subjectByCode(code);
    const session = await this.catalog.currentSession();
    const term = await this.catalog.currentTerm();
    if (
      await this.db.resultSheet.count({
        where: { subjectId: s.id, status: { not: 'NOT_STARTED' } },
      })
    )
      throw fail(
        `${s.name} has results this session. Make it inactive instead.`,
        'SUBJECT_HAS_RESULTS',
        HttpStatus.CONFLICT,
      );
    if (
      term &&
      (await this.db.teachingAssignment.count({ where: { subjectId: s.id, termId: term.id } }))
    )
      throw fail(
        `${s.name} is assigned to teachers. Remove those assignments first.`,
        'SUBJECT_ASSIGNED',
        HttpStatus.CONFLICT,
      );
    const used = await Promise.all([
      this.db.teachingAssignment.count({ where: { subjectId: s.id } }),
      this.db.curriculumEntry.count({
        where: { subjectId: s.id, ...(session && { sessionId: { not: session.id } }) },
      }),
      this.db.timetableSlot.count({ where: { subjectId: s.id } }),
      this.db.studentSubject.count({ where: { subjectId: s.id } }),
      this.db.resultSheet.count({ where: { subjectId: s.id } }),
      this.db.assignment.count({ where: { subjectId: s.id } }),
      this.db.material.count({ where: { subjectId: s.id } }),
      this.db.lessonNote.count({ where: { subjectId: s.id } }),
      this.db.assessmentSchedule.count({ where: { subjectId: s.id } }),
    ]);
    if (used.some(Boolean))
      throw fail(
        `${s.name} has history on EduTrack. Make it inactive instead.`,
        'SUBJECT_IN_USE',
        HttpStatus.CONFLICT,
      );
    await this.db.$transaction(async (tx) => {
      await tx.curriculumEntry.deleteMany({ where: { subjectId: s.id } });
      await tx.electiveGroupSubject.deleteMany({ where: { subjectId: s.id } });
      await tx.staffQualification.deleteMany({ where: { subjectId: s.id } });
      await tx.subject.delete({ where: { id: s.id } });
      await this.audit.record(
        {
          action: 'subject.delete',
          area: 'Academic',
          entity: 'Subject',
          entityId: s.id,
          summary: `Subject removed: ${s.name}`,
          detail: s.code,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /* ---------------- Curriculum ---------------- */

  /**
   * Replaces the current session's curriculum and elective groups. Taking a subject out of a
   * level clears its teaching assignments (and draft timetable lessons) for this and later terms;
   * it's refused once teachers have handed in scores for it this term, or taught it in an
   * earlier term of the session.
   */
  async save(schoolId: string, p: { curriculum?: CurriculumMap; groups?: GroupInput[] }) {
    const session = await this.requireSession();
    const term = await this.catalog.currentTerm();
    const [subjects, bySection, current] = await Promise.all([
      this.db.subject.findMany(),
      this.levelsBySection(),
      this.db.curriculumEntry.findMany({ where: { sessionId: session.id } }),
    ]);
    const subjectByCode = new Map(subjects.map((s) => [s.code, s]));
    const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? 'A subject';

    // What should be offered: levelId → subjectId → offering.
    const wanted = new Map<string, Offering>();
    for (const [section, levels] of Object.entries(p.curriculum ?? {})) {
      const sec = bySection.find((x) => x.section === section);
      if (!sec) throw fail(`${section} isn't one of your sections.`, 'VALIDATION');
      for (const [levelName, offered] of Object.entries(levels ?? {})) {
        const lv = sec.levels.find((l) => l.name === levelName);
        if (!lv) throw fail(`${levelName} isn't a class in ${section}.`, 'VALIDATION');
        for (const [code, o] of Object.entries(offered ?? {})) {
          if (o !== 'C' && o !== 'E') continue;
          const subject = subjectByCode.get(code);
          if (!subject) throw fail(`There is no subject with the code ${code}.`, 'VALIDATION');
          wanted.set(`${lv.id}|${subject.id}`, OFFERING[o]);
        }
      }
    }

    const groups = (p.groups ?? []).map((g, i) => {
      const name = (g.name ?? '').trim();
      if (!name) throw fail(`Name elective group ${i + 1}.`, 'VALIDATION');
      const sec = bySection.find((x) => x.section === g.section);
      if (!sec) throw fail(`${name}: choose a section.`, 'VALIDATION');
      const codes = [...new Set(g.subjects ?? [])];
      if (codes.length < 2) throw fail(`${name}: pick at least 2 subjects.`, 'VALIDATION');
      const ids = codes.map((c) => {
        const s = subjectByCode.get(c);
        if (!s) throw fail(`${name}: there is no subject with the code ${c}.`, 'VALIDATION');
        return s.id;
      });
      if (!Number.isInteger(g.min) || g.min < 0)
        throw fail(`${name}: the minimum is a whole number.`, 'VALIDATION');
      if (!Number.isInteger(g.max) || g.max < 1 || g.max < g.min)
        throw fail(
          `${name}: the maximum must be at least 1 and not below the minimum.`,
          'VALIDATION',
        );
      if (g.max > codes.length)
        throw fail(
          `${name}: students can’t choose ${g.max} of ${codes.length} subjects.`,
          'VALIDATION',
        );
      return {
        id: g.id,
        name,
        sectionId: sec.id,
        subjectIds: ids,
        min: g.min,
        max: g.max,
        note: (g.note ?? '').trim(),
      };
    });
    const groupKeys = groups.map((g) => `${g.sectionId}|${g.name.toLowerCase()}`);
    const dup = groups.find((_, i) => groupKeys.indexOf(groupKeys[i]!) !== i);
    if (dup) throw fail(`Two elective groups are called ${dup.name}.`, 'VALIDATION');

    const dropped = current.filter((e) => !wanted.has(`${e.levelId}|${e.subjectId}`));
    const levelName = (id: string) =>
      bySection.flatMap((x) => x.levels).find((l) => l.id === id)?.name ?? 'a class';
    if (dropped.length && term) {
      // Result sheets pin the curriculum entry, so any sheet this session keeps the subject.
      const scored = await this.db.resultSheet.findMany({
        where: {
          sessionId: session.id,
          OR: dropped.map((d) => ({ levelId: d.levelId, subjectId: d.subjectId })),
        },
        select: { levelId: true, subjectId: true },
        distinct: ['levelId', 'subjectId'],
      });
      if (scored.length)
        throw fail(
          `These already have results this session and can’t be removed until it closes: ${scored
            .map((x) => `${nameOf(x.subjectId)} in ${levelName(x.levelId)}`)
            .join(', ')}.`,
          'CURRICULUM_HAS_SCORES',
          HttpStatus.CONFLICT,
        );
      const earlier = await this.db.teachingAssignment.findMany({
        where: {
          sessionId: session.id,
          term: { startsOn: { lt: term.startsOn } },
          OR: dropped.map((d) => ({ levelId: d.levelId, subjectId: d.subjectId })),
        },
        select: { levelId: true, subjectId: true },
        distinct: ['levelId', 'subjectId'],
      });
      if (earlier.length)
        throw fail(
          `These were taught earlier this session and stay until it closes: ${earlier
            .map((x) => `${nameOf(x.subjectId)} in ${levelName(x.levelId)}`)
            .join(', ')}.`,
          'CURRICULUM_TAUGHT',
          HttpStatus.CONFLICT,
        );
    }

    let cleared = 0;
    await this.db.$transaction(async (tx) => {
      for (const d of dropped)
        cleared += await this.clearOffering(tx, session.id, d.levelId, d.subjectId);
      if (dropped.length)
        await tx.curriculumEntry.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } });
      for (const [key, offering] of wanted) {
        const [levelId, subjectId] = key.split('|') as [string, string];
        await tx.curriculumEntry.upsert({
          where: { sessionId_levelId_subjectId: { sessionId: session.id, levelId, subjectId } },
          create: { schoolId, sessionId: session.id, levelId, subjectId, offering },
          update: { offering },
        });
      }
      await this.saveGroups(tx, schoolId, session.id, groups);
      await this.audit.record(
        {
          action: 'curriculum.save',
          area: 'Academic',
          entity: 'Curriculum',
          summary: 'Curriculum saved',
          detail: `${plural(groups.length, 'elective group')}${cleared ? ` · ${plural(cleared, 'assignment')} cleared` : ''}`,
        },
        asTx(tx),
      );
    });
    return { ...(await this.view()), cleared };
  }

  /** Removes this and later terms' assignments and draft lessons for a subject no longer offered. */
  private async clearOffering(tx: TenantTx, sessionId: string, levelId: string, subjectId: string) {
    const assignments = await tx.teachingAssignment.findMany({
      where: { sessionId, levelId, subjectId },
      select: { id: true, armId: true, termId: true },
    });
    for (const a of assignments) {
      await tx.timetableSlot.deleteMany({
        where: { subjectId, termId: a.termId, timetable: { armId: a.armId } },
      });
      await tx.assessmentSchedule.updateMany({
        where: { teachingAssignmentId: a.id },
        data: { teachingAssignmentId: null },
      });
    }
    const { count } = await tx.teachingAssignment.deleteMany({
      where: { id: { in: assignments.map((a) => a.id) } },
    });
    return count;
  }

  private async saveGroups(
    tx: TenantTx,
    schoolId: string,
    sessionId: string,
    groups: {
      id?: string;
      name: string;
      sectionId: string;
      subjectIds: string[];
      min: number;
      max: number;
      note: string;
    }[],
  ) {
    const existing = await tx.electiveGroup.findMany({ where: { sessionId } });
    const keep = new Set(
      groups.flatMap((g) => (g.id && existing.some((e) => e.id === g.id) ? [g.id] : [])),
    );
    const gone = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (gone.length) {
      // Students' choices stay; they just no longer belong to a group.
      await tx.studentSubject.updateMany({
        where: { groupId: { in: gone } },
        data: { groupId: null },
      });
      await tx.electiveGroup.deleteMany({ where: { id: { in: gone } } });
    }
    // Park kept names so renames that swap two names don't collide.
    for (const id of keep)
      await tx.electiveGroup.update({ where: { id }, data: { name: `~${id}` } });
    for (const g of groups) {
      const data = {
        sectionId: g.sectionId,
        name: g.name,
        minPicks: g.min,
        maxPicks: g.max,
        note: g.note,
      };
      const id =
        g.id && keep.has(g.id)
          ? (await tx.electiveGroup.update({ where: { id: g.id }, data })).id
          : (await tx.electiveGroup.create({ data: { schoolId, sessionId, ...data } })).id;
      await tx.electiveGroupSubject.deleteMany({ where: { groupId: id } });
      await tx.electiveGroupSubject.createMany({
        data: g.subjectIds.map((subjectId) => ({ schoolId, groupId: id, subjectId })),
      });
    }
  }

  /** Setup Center: why Subjects & Curriculum can't be completed yet. */
  async blockers(): Promise<string[]> {
    const view = await this.view();
    if (!view.subjects.length) return ['Add at least one subject.'];
    const empty = view.levels.flatMap(({ section, levels }) =>
      levels.filter((lv) => !Object.values(view.curriculum[section]?.[lv] ?? {}).includes('C')),
    );
    return empty.length
      ? [`Give these classes at least one compulsory subject: ${empty.join(', ')}.`]
      : [];
  }
}
