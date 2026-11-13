import * as yup from 'yup';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';

/** Nigerian mobile number, checked after removing spaces and dashes. */
export const NIGERIAN_MOBILE = /^(\+234|0)[789][01]\d{8}$/;
export const isNigerianMobile = (value: string) =>
  NIGERIAN_MOBILE.test(value.replace(/[\s-]/g, ''));
export const PHONE_MESSAGE = 'Enter a Nigerian mobile number, like 0803 412 7781';

export const email = (message = 'Enter a valid email address') =>
  yup.string().trim().required(message).email(message);

export const nigerianPhone = (message = PHONE_MESSAGE) =>
  yup
    .string()
    .trim()
    .required(message)
    .test('ng-phone', message, (value) => !value || isNigerianMobile(value));

export const optionalNigerianPhone = (message = PHONE_MESSAGE) =>
  yup
    .string()
    .trim()
    .default('')
    .test('ng-phone', message, (value) => !value || isNigerianMobile(value));

/** New password + confirmation, enforcing the platform password policy. */
export const newPasswordFields = {
  password: yup
    .string()
    .required('Enter a new password')
    .test('policy', 'Your password doesn’t meet every requirement yet.', (value) =>
      meetsPasswordPolicy(value ?? ''),
    ),
  confirmPassword: yup
    .string()
    .required('Confirm your new password')
    .oneOf([yup.ref('password')], 'The two passwords don’t match.'),
};
