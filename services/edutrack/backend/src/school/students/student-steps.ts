import { Injectable } from '@nestjs/common';
import { SetupStateService } from '../shared/setup-state.service.js';
import type { SetupStepSource } from '../setup/setup-step-source.js';
import { StudentsService } from './students.service.js';

const COUNT = new Intl.NumberFormat('en-NG');

/**
 * The Setup Center's Students step, from the school's enrollments, in the mock's wording
 * ("1,248 enrolled for 2026/2027"; `school-admin/src/api/mock/db.ts`).
 */
@Injectable()
export class StudentSetupSteps {
  constructor(
    private readonly students: StudentsService,
    private readonly setupState: SetupStateService,
  ) {}

  readonly all: SetupStepSource[] = [
    {
      id: 'students',
      state: async () => {
        const [{ session, enrolled, onRoll }, done] = await Promise.all([
          this.students.enrolledThisSession(),
          this.setupState.isConfirmed('students'),
        ]);
        return {
          done,
          description:
            session && enrolled
              ? `${COUNT.format(enrolled)} enrolled for ${session}`
              : onRoll
                ? `${COUNT.format(onRoll)} on the roll · none enrolled${session ? ` for ${session}` : ''} yet`
                : 'Admit students or import them from a spreadsheet',
          to: { name: 'students' },
          blockers: onRoll ? [] : ['Admit or import at least one student first.'],
        };
      },
    },
  ];
}
