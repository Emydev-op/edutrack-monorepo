import * as yup from 'yup';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';
import { nigerianPhoneProblem } from '@edutrack/app-kit/lib/phone';

export { NIGERIAN_MOBILE } from '@edutrack/app-kit/lib/phone';

export const email = (message = 'Enter a valid email address') =>
  yup.string().trim().required(message).email(message);

/** Optional Nigerian mobile number; the error says what is wrong (digit count, prefix…). */
export const optionalNigerianPhone = (
  message = 'Enter a Nigerian mobile number, like 0803 412 7781',
) =>
  yup
    .string()
    .trim()
    .default('')
    .test('ng-phone', message, function (value) {
      const example = /like (.+)$/.exec(message)?.[1];
      const problem = nigerianPhoneProblem(value ?? '', example);
      return problem ? this.createError({ message: problem }) : true;
    });

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
