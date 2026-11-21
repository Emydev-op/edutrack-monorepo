import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { newPasswordFields } from './common';

const admissionNo = (message = 'Enter your admission number') =>
  yup.string().trim().required(message).max(40, 'Check your admission number');

export const loginSchema = toTypedSchema(
  yup.object({
    email: admissionNo(),
    password: yup.string().required('Enter your password'),
    remember: yup.boolean().default(false),
  }),
);

export const expiredPasswordSchema = toTypedSchema(
  yup.object({
    email: admissionNo(),
    current: yup.string().required('Enter your current password'),
    ...newPasswordFields,
  }),
);

/** Profile › Change password (signed in). */
export const changePasswordSchema = toTypedSchema(
  yup.object({
    current: yup.string().required('Enter your current password'),
    ...newPasswordFields,
  }),
);
