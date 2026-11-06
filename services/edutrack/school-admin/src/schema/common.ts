import * as yup from 'yup';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';

export const NIGERIAN_MOBILE = /^(\+234|0)[789][01]\d{8}$/;

export const email = (message = 'Enter a valid email address') =>
  yup.string().trim().required(message).email(message);

export const optionalNigerianPhone = (
  message = 'Enter a Nigerian mobile number, like 0803 412 7781',
) =>
  yup
    .string()
    .trim()
    .default('')
    .test(
      'ng-phone',
      message,
      (value) => !value || NIGERIAN_MOBILE.test(value.replace(/[\s-]/g, '')),
    );

/** New password + confirmation, enforcing the platform password policy. */
export const newPasswordFields = {
  password: yup
    .string()
    .required('Enter a new password')
    .test('policy', "Your password doesn't meet every requirement yet.", (value) =>
      meetsPasswordPolicy(value ?? ''),
    ),
  confirmPassword: yup
    .string()
    .required('Confirm your new password')
    .oneOf([yup.ref('password')], "The two passwords don't match."),
};
