import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { SUPPORT_TEAMS, type SupportTeam } from '@/types';

import { email, optionalNigerianPhone } from './common';

const userFields = {
  firstName: yup.string().trim().required('Enter a first name'),
  lastName: yup.string().trim().required('Enter a last name'),
  email: email(),
  phone: optionalNigerianPhone(),
  supportTeam: yup
    .mixed<SupportTeam | ''>()
    .oneOf([...SUPPORT_TEAMS, ''])
    .default(''),
};

/** The support team picker: none, or one of the desk's teams. */
export const SUPPORT_TEAM_OPTIONS = [
  { value: '', label: 'Not on the support desk' },
  ...SUPPORT_TEAMS.map((t) => ({ value: t, label: t })),
];

export const inviteUserDetailsSchema = toTypedSchema(yup.object(userFields));
export const editUserSchema = toTypedSchema(
  yup.object({ ...userFields, roleId: yup.string().required() }),
);
