import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { formatDay } from '@/lib/dates';
import { ASSIGNMENT_LIMITS } from '@/types';

export interface AssignmentFormContext {
  /** Active term dates, "YYYY-MM-DD". */
  termStart: () => string;
  termEnd: () => string;
  termName: () => string;
  /** The API's now, local "YYYY-MM-DDTHH:mm". */
  now: () => string;
  /** On edit: the saved due time (not re-checked against the clock when unchanged). */
  savedDueAt: () => string | null;
  /** On edit: the highest score already given, if any. */
  highest: () => { score: number; studentName: string } | null;
}

/**
 * Create / edit an assignment. `publish` is a hidden field the two buttons set: a draft needs a
 * class and a title, publishing needs everything. The API checks the same rules.
 */
export function assignmentSchema(ctx: AssignmentFormContext) {
  /** Required only when publishing. */
  function neededToPublish(this: yup.TestContext, value: unknown) {
    return !this.parent.publish || Boolean(value);
  }
  const dueAt = (v: { dueDate?: string; dueTime?: string }) =>
    v.dueDate && v.dueTime ? `${v.dueDate}T${v.dueTime}` : null;

  return toTypedSchema(
    yup.object({
      publish: yup.boolean().default(true),
      classKey: yup.string().trim().required('Choose the class and subject.'),
      title: yup
        .string()
        .trim()
        .required('Enter a title.')
        .max(ASSIGNMENT_LIMITS.title, `Keep the title to ${ASSIGNMENT_LIMITS.title} characters.`),
      instructions: yup
        .string()
        .trim()
        .default('')
        .test('needed', 'Enter instructions so students know what to do.', neededToPublish)
        .max(
          ASSIGNMENT_LIMITS.instructions,
          `Keep the instructions to ${ASSIGNMENT_LIMITS.instructions} characters.`,
        ),
      dueDate: yup
        .string()
        .default('')
        .test('needed', 'Choose the due date.', neededToPublish)
        .test('in-term', '', function (value) {
          if (!value) return true;
          const full = dueAt(this.parent);
          if (full && full === ctx.savedDueAt()) return true;
          if (value < ctx.termStart() || value > ctx.termEnd())
            return this.createError({
              message: `The due date must be inside ${ctx.termName()} (${formatDay(ctx.termStart(), false)} – ${formatDay(ctx.termEnd(), false)}).`,
            });
          return true;
        }),
      dueTime: yup
        .string()
        .default('')
        .test('needed', 'Choose the time it’s due.', neededToPublish)
        .test('both', 'Choose the time it’s due.', function (value) {
          return !this.parent.dueDate || Boolean(value);
        })
        .test('future', 'That time has already passed. Choose a later time.', function () {
          const full = dueAt(this.parent);
          if (!full || full === ctx.savedDueAt()) return true;
          return !ctx.now() || full > ctx.now();
        }),
      maxScore: yup
        .number()
        .nullable()
        .default(null)
        .test('needed', 'Enter the max score.', function (v) {
          return !this.parent.publish || (v !== null && v !== undefined);
        })
        .test(
          'range',
          'The max score is a whole number from 1 to 100.',
          (v) => v === null || v === undefined || (Number.isInteger(v) && v >= 1 && v <= 100),
        )
        .test('above-given', '', function (v) {
          const best = ctx.highest();
          if (v === null || v === undefined || !best || v >= best.score) return true;
          return this.createError({
            message: `${best.studentName} already has ${best.score}. The max score can’t go below ${best.score}.`,
          });
        }),
      allowLate: yup.string().oneOf(['no', 'yes']).default('no'),
    }),
  );
}

/** Which form field shows each API field's message. */
export const API_FIELD: Record<string, string> = {
  armId: 'classKey',
  subject: 'classKey',
  title: 'title',
  instructions: 'instructions',
  dueAt: 'dueDate',
  maxScore: 'maxScore',
};
