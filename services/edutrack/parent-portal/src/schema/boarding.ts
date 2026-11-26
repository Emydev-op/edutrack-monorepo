import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { nigerianPhone } from './common';

/** Kinds a parent can ask for (a term break is set by the school). */
export const EXEAT_KINDS = ['Weekend', 'Medical', 'Family event', 'Emergency', 'Other'] as const;
/** Kinds where the house staff need to know why. */
export const REASON_REQUIRED = ['Medical', 'Emergency', 'Other'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const exeatSchema = toTypedSchema(
  yup.object({
    kind: yup
      .string()
      .oneOf([...EXEAT_KINDS], 'Choose the kind of exeat.')
      .required('Choose the kind of exeat.'),
    leaveDate: yup.string().required('Choose the day they leave.').matches(DATE, 'Choose a date.'),
    leaveTime: yup.string().required('Choose a time.').matches(TIME, 'Choose a time.'),
    returnDate: yup
      .string()
      .required('Choose the day they come back.')
      .matches(DATE, 'Choose a date.')
      .test('after', 'They must come back after they leave.', function (value) {
        const { leaveDate, leaveTime, returnTime } = this.parent as Record<string, string>;
        if (!value || !leaveDate || !leaveTime || !returnTime) return true;
        return `${value}T${returnTime}` > `${leaveDate}T${leaveTime}`;
      }),
    returnTime: yup.string().required('Choose a time.').matches(TIME, 'Choose a time.'),
    reason: yup
      .string()
      .trim()
      .max(500, 'Keep the reason to 500 characters.')
      .default('')
      .test('required', 'Say why.', function (value) {
        const { kind } = this.parent as { kind?: string };
        return !REASON_REQUIRED.includes(kind ?? '') || !!value;
      }),
    pickupPersonId: yup.string().default(''),
  }),
);

export const pickupSchema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Enter their full name.').max(120, 'Keep it shorter.'),
    relationship: yup
      .string()
      .trim()
      .required('Say who they are to your child (e.g. Uncle, Driver).')
      .max(60, 'Keep it shorter.'),
    phone: nigerianPhone('Enter a Nigerian mobile number, like 0803 555 0161'),
    note: yup.string().trim().max(200, 'Keep the note to 200 characters.').default(''),
  }),
);
