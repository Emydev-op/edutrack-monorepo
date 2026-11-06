import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { NIGERIAN_MOBILE } from '@/schema/common';

const inAYear = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

/** The add/edit staff form. Email is required only when they get portal access. */
export const staffFormSchema = toTypedSchema(
  yup.object({
    title: yup.string().default(''),
    firstName: yup.string().trim().required('Enter a first name.'),
    lastName: yup.string().trim().required('Enter a last name.'),
    gender: yup.mixed<'Female' | 'Male' | ''>().oneOf(['Female', 'Male', '']).default(''),
    phone: yup
      .string()
      .trim()
      .default('')
      .test(
        'ng-phone',
        'Use a Nigerian mobile number, e.g. 0803 555 0161.',
        (v) => !v || NIGERIAN_MOBILE.test(v.replace(/[\s-]/g, '')),
      ),
    access: yup.boolean().default(false),
    email: yup
      .string()
      .trim()
      .default('')
      .email('Enter a valid email, e.g. name@school.ng.')
      .when('access', ([access], s) =>
        access ? s.required('An email is needed to send the invitation.') : s,
      ),
    address: yup.string().trim().default(''),
    emergencyContact: yup.string().trim().default(''),
    kind: yup
      .mixed<'Teaching' | 'Non-teaching'>()
      .oneOf(['Teaching', 'Non-teaching'])
      .required()
      .default('Teaching'),
    position: yup.string().required('Choose a position.'),
    department: yup.string().default(''),
    employment: yup
      .mixed<'Full-time' | 'Part-time' | 'Contract'>()
      .oneOf(['Full-time', 'Part-time', 'Contract'])
      .required()
      .default('Full-time'),
    since: yup
      .string()
      .default('')
      .test('not-far', 'More than a year away. Check the date.', (v) => !v || v <= inAYear()),
    branchIds: yup.array(yup.string().required()).min(1, 'Choose at least one branch.').default([]),
    qualified: yup.array(yup.string().required()).default([]),
    maxPeriods: yup
      .number()
      .typeError('Enter a number of periods.')
      .when('kind', ([kind], s) =>
        kind === 'Teaching'
          ? s
              .required('Enter the maximum periods per week.')
              .integer('Use a whole number.')
              .min(1, 'At least 1 period.')
              .max(40, 'At most 40 periods.')
          : s.optional(),
      ),
    role: yup
      .string()
      .default('')
      .when('access', ([access], s) =>
        access ? s.required('Choose what they can do in Edutrack.') : s,
      ),
  }),
);

export const TITLES = [
  { value: '', label: '—' },
  ...['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.'].map((t) => ({ value: t, label: t })),
];
export const GENDERS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
];
export const EMPLOYMENT = ['Full-time', 'Part-time', 'Contract'];
