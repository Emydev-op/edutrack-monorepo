import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { email, newPasswordFields, optionalNigerianPhone } from './common';

export const loginSchema = toTypedSchema(
  yup.object({
    email: email('Enter a valid email address, like you@example.com'),
    password: yup.string().required('Enter your password'),
    remember: yup.boolean().default(false),
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

/** Activation is one form across steps; each step validates only its own fields. */
export const activationSchema = toTypedSchema(
  yup.object({
    firstName: yup.string().trim().required('Enter your first name'),
    lastName: yup.string().trim().required('Enter your last name'),
    phone: optionalNigerianPhone('Enter a Nigerian mobile number, like 0803 555 0161'),
    ...newPasswordFields,
  }),
);

export const profileSchema = toTypedSchema(
  yup.object({
    phone: optionalNigerianPhone('Enter a Nigerian mobile number, like 0803 555 0161').test(
      'required',
      'Enter your mobile number',
      (v) => !!v,
    ),
    address: yup.string().trim().max(300, 'Keep the address to 300 characters').default(''),
  }),
);
