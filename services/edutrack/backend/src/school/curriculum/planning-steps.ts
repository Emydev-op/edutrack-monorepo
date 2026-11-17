import { Injectable } from '@nestjs/common';
import { plural } from '../academics/academic-format.js';
import { ASSESSMENT_STEP, AssessmentService } from '../assessment/assessment.service.js';
import { ASSIGNMENTS_STEP, AssignmentsService } from '../assignments/assignments.service.js';
import type { SetupStepSource } from '../setup/setup-step-source.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { CURRICULUM_STEP, CurriculumService } from './curriculum.service.js';

const fromSetup = { from: 'setup' };

/**
 * The Setup Center steps Phase 3a owns: Subjects & Curriculum, Assessment & Grading, Teacher
 * Assignments and Timetable, described with the mock's wording (`academicSteps` and
 * `completeAcademicStep` in `school-admin/src/api/mock/handlers/academics-shared.ts`).
 */
@Injectable()
export class PlanningSetupSteps {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly assessment: AssessmentService,
    private readonly assignments: AssignmentsService,
    private readonly timetable: TimetableService,
    private readonly setup: SetupStateService,
  ) {}

  readonly all: SetupStepSource[] = [
    {
      id: CURRICULUM_STEP,
      state: async () => {
        const [v, blockers, done] = await Promise.all([
          this.curriculum.view(),
          this.curriculum.blockers(),
          this.setup.isConfirmed(CURRICULUM_STEP),
        ]);
        return {
          done,
          description: v.subjects.length
            ? `${plural(v.subjects.filter((s) => s.status === 'Active').length, 'subject')} · ${plural(v.groups.length, 'elective group')}`
            : 'Choose compulsory and elective subjects',
          to: { name: 'subjects', query: fromSetup },
          blockers,
        };
      },
    },
    {
      id: ASSESSMENT_STEP,
      state: async () => {
        const [v, done] = await Promise.all([
          this.assessment.view(),
          this.setup.isConfirmed(ASSESSMENT_STEP),
        ]);
        return {
          done,
          description: v.missing.length
            ? `${v.missing.join(', ')} ${v.missing.length === 1 ? 'needs' : 'need'} a scheme`
            : v.sections.length
              ? 'Weights and grade scales set for every section'
              : 'Set CA and exam weights and your grading scale',
          to: { name: 'assessments', query: fromSetup },
          blockers: v.missing.length ? [`Set up a scheme for ${v.missing.join(', ')} first.`] : [],
        };
      },
    },
    {
      id: ASSIGNMENTS_STEP,
      state: async () => {
        const [s, done, subjectsDone] = await Promise.all([
          this.assignments.slots(),
          this.setup.isConfirmed(ASSIGNMENTS_STEP),
          this.setup.isConfirmed(CURRICULUM_STEP),
        ]);
        return {
          done,
          description: s.total
            ? `${s.filled} of ${s.total} subject slots assigned${s.noClassTeacher ? ` · ${plural(s.noClassTeacher, 'arm')} without a class teacher` : ''}`
            : 'Who teaches which subject in which class',
          to: { name: 'teacher-assignments', query: fromSetup },
          blockers: [
            ...(!subjectsDone ? ['Finish Subjects & Curriculum first.'] : []),
            ...(!s.assignments ? ['Assign at least one subject to a teacher first.'] : []),
          ],
        };
      },
    },
    {
      id: 'timetable',
      state: async () => {
        const [c, done] = await Promise.all([
          this.timetable.counts(),
          this.setup.isConfirmed('timetable'),
        ]);
        return {
          done,
          description: c.total
            ? `${plural(c.published, 'class', 'classes')} published this term${c.drafts ? ` · ${plural(c.drafts, 'draft')} in progress` : ''}`
            : 'Periods and lessons for each class',
          to: { name: 'timetable', query: fromSetup },
          blockers: c.anyPublished ? [] : ['Publish at least one class timetable first.'],
        };
      },
    },
  ];
}
