import { Injectable } from '@nestjs/common';
import type { SetupStepSource } from '../setup/setup-step-source.js';
import { fmtDate, plural, SESSION_STATUS } from './academic-format.js';
import { ACADEMIC_STEP, AcademicStructureService } from './academic-structure.service.js';

const fromSetup = { from: 'setup' };
const CODE = /^[A-Z]{2,5}$/;

/**
 * The Setup Center steps Academics owns: Academic Sections, Academic Session, Terms, and Classes &
 * Arms, described from the school's data with the mock's wording (`academicSteps` and
 * `completeAcademicStep` in `school-admin/src/api/mock/handlers/academics-shared.ts`).
 */
@Injectable()
export class AcademicSetupSteps {
  constructor(private readonly structure: AcademicStructureService) {}

  private get db() {
    return this.structure.db;
  }

  readonly all: SetupStepSource[] = [
    {
      id: ACADEMIC_STEP.sections,
      state: async () => {
        const [sections, confirmed] = await Promise.all([
          this.structure.sections(),
          this.structure.confirmedKeys(),
        ]);
        return {
          done: confirmed.has(ACADEMIC_STEP.sections),
          description: sections.length
            ? sections.map((s) => `${s.name} (${s.code || '—'})`).join(', ')
            : 'Choose the sections you run',
          to: { name: 'academic-sections', query: fromSetup },
          blockers: [
            ...(!sections.length ? ['Add at least one section.'] : []),
            ...(sections.some((s) => !CODE.test(s.code))
              ? ['Give every section a 2–5 letter code.']
              : []),
          ],
        };
      },
    },
    {
      id: ACADEMIC_STEP.session,
      state: async () => {
        const [session, confirmed] = await Promise.all([
          this.structure.currentSession(),
          this.structure.confirmedKeys(),
        ]);
        return {
          done: confirmed.has(ACADEMIC_STEP.session),
          description: session
            ? `${session.name} is ${SESSION_STATUS[session.status].toLowerCase()} · ${fmtDate(session.startsOn)} – ${fmtDate(session.endsOn)}`
            : 'Create your first session and its dates',
          to: session ? { name: 'sessions' } : { name: 'session-new', query: fromSetup },
          blockers: session ? [] : ['Create the session first.'],
        };
      },
    },
    {
      id: ACADEMIC_STEP.terms,
      state: async () => {
        const [session, confirmed] = await Promise.all([
          this.structure.currentSession(),
          this.structure.confirmedKeys(),
        ]);
        return {
          done: confirmed.has(ACADEMIC_STEP.terms),
          description: session
            ? `${plural(session.terms.length, 'term')} in ${session.name} · ${plural(
                session.terms.reduce((n, t) => n + t.events.length, 0),
                'calendar event',
              )}`
            : 'Create the session first',
          to: session
            ? { name: 'session-terms', params: { id: session.id }, query: fromSetup }
            : { name: 'session-new', query: fromSetup },
          blockers: session ? [] : ['Create the session first.'],
        };
      },
    },
    {
      id: ACADEMIC_STEP.classes,
      state: async () => {
        const [branches, branchLevels, arms, confirmed] = await Promise.all([
          this.structure.activeBranches(),
          this.db.branchLevel.findMany({
            include: { level: { select: { sectionId: true } } },
          }),
          this.db.classArm.count({ where: { archivedAt: null } }),
          this.structure.confirmedKeys(),
        ]);
        const blockers: string[] = [];
        if (!confirmed.has(ACADEMIC_STEP.sections))
          blockers.push('Finish Academic Sections first.');
        for (const b of branches)
          b.sectionIds.forEach((sectionId, i) => {
            if (!branchLevels.some((l) => l.branchId === b.id && l.level.sectionId === sectionId))
              blockers.push(
                `Add at least one class level for ${b.sections[i]} at ${b.name}, or remove the section from the branch.`,
              );
          });
        if (!branchLevels.length) blockers.push('Add at least one class level.');
        return {
          done: confirmed.has(ACADEMIC_STEP.classes),
          description: arms
            ? `${plural(arms, 'arm')} across ${plural(branchLevels.length, 'class level')}`
            : 'Add class levels and their arms',
          to: { name: 'classes', query: fromSetup },
          blockers,
        };
      },
    },
  ];
}
