import * as yup from 'yup';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';

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
