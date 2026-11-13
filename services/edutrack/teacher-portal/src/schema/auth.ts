import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { email, newPasswordFields, optionalNigerianPhone } from './common';

export const loginSchema = toTypedSchema(
  yup.object({
    email: email(),
    password: yup.string().required('Enter your password'),
    remember: yup.boolean().default(true),
  }),
);

export const forgotPasswordSchema = toTypedSchema(yup.object({ email: email() }));

export const resetPasswordSchema = toTypedSchema(yup.object(newPasswordFields));

export const expiredPasswordSchema = toTypedSchema(
  yup.object({
    email: email(),
    current: yup.string().required('Enter your current password'),
    ...newPasswordFields,
  }),
);

export const changePasswordSchema = toTypedSchema(
  yup.object({
    current: yup.string().required('Enter your current password'),
    ...newPasswordFields,
  }),
);

/** Invitation acceptance is one form across steps; each step validates only its own fields. */
export const acceptInvitationSchema = toTypedSchema(
  yup.object({
    firstName: yup.string().trim().required('Enter your first name'),
    lastName: yup.string().trim().required('Enter your last name'),
    phone: optionalNigerianPhone(),
    ...newPasswordFields,
  }),
);
