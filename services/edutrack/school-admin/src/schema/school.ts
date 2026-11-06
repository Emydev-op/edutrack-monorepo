import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { isNigerianState, lgasOf } from '@edutrack/app-kit/lib/nigeria-locations';

import type { FileRef, SchoolSection } from '@/types';

import { NIGERIAN_MOBILE, optionalNigerianPhone } from './common';

const phone = (message: string) =>
  yup
    .string()
    .trim()
    .required(message)
    .test('ng-phone', message, (v = '') => NIGERIAN_MOBILE.test(v.replace(/[\s-]/g, '')));

const state = () =>
  yup
    .string()
    .required('Choose the state')
    .test('ng-state', 'Choose a Nigerian state', (v = '') => isNigerianState(v));

const file = () => yup.mixed<FileRef>().nullable().default(null);

export const CURRENT_YEAR = new Date().getFullYear();

/** The school profile wizard. Each step validates only its own fields (see PROFILE_STEP_FIELDS). */
export const schoolProfileSchema = toTypedSchema(
  yup.object({
    name: yup
      .string()
      .trim()
      .required('Enter the name parents and staff will see.')
      .min(3, 'The name must be at least 3 characters.'),
    motto: yup.string().trim().default('').max(80, 'Keep the motto under 80 characters.'),
    founded: yup
      .string()
      .trim()
      .default('')
      .test('year', `Enter a year between 1900 and ${CURRENT_YEAR}.`, (v = '') => {
        if (!v) return true;
        return /^\d{4}$/.test(v) && +v >= 1900 && +v <= CURRENT_YEAR;
      }),
    logo: file(),
    email: yup
      .string()
      .trim()
      .required('Enter a valid email, like info@school.ng.')
      .email('Enter a valid email, like info@school.ng.'),
    phone: phone('Enter a Nigerian number, like 0809 555 0123.'),
    website: yup
      .string()
      .trim()
      .default('')
      .test('web', 'Enter a valid web address, like greenfieldacademy.ng.', (v = '') =>
        !v ? true : /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v),
      ),
    street: yup.string().trim().required('Enter the street address.'),
    city: yup.string().trim().required('Enter the town or city.'),
    state: state(),
    lga: yup
      .string()
      .required('Select the LGA')
      .test('in-state', 'Select an LGA in the chosen state', function (v = '') {
        return lgasOf(this.parent.state ?? '').includes(v);
      }),
    approvingBody: yup.string().required('Choose the approving body.'),
    approvalNumber: yup
      .string()
      .trim()
      .required('Enter the approval number from your approving body.'),
    cacNumber: yup
      .string()
      .trim()
      .default('')
      .test(
        'cac',
        'CAC numbers look like RC 1234567.',
        (v = '') => !v || /^(RC|BN)\s?\d{4,8}$/i.test(v),
      ),
    certificate: file(),
  }),
);

export const PROFILE_STEP_FIELDS = [
  ['name', 'motto', 'founded'],
  ['email', 'phone', 'website', 'street', 'city', 'state', 'lga'],
  ['approvingBody', 'approvalNumber', 'cacNumber'],
  [],
  [],
] as const;

/** Branch form. `takenNames` / `takenCodes` are the other branches'. */
export const branchSchema = (
  taken: () => { names: string[]; codes: [string, string][] },
  prefix: () => string,
) =>
  toTypedSchema(
    yup.object({
      name: yup
        .string()
        .trim()
        .required('Enter a branch name.')
        .min(3, 'Use at least 3 characters.')
        .test('unique', 'A branch with this name already exists.', (v = '') =>
          taken().names.every((n) => n.toLowerCase() !== v.trim().toLowerCase()),
        ),
      code: yup
        .string()
        .required(`Use a short code like ${prefix()}IK.`)
        .test(
          'format',
          () => `Use a short code like ${prefix()}IK.`,
          (v = '') => /^[A-Z0-9]{2,5}-[A-Z0-9]{2,4}$/.test(v),
        )
        .test(
          'unique',
          ({ value }) => {
            const owner = taken().codes.find(([c]) => c === value);
            return `This code is already used by ${owner?.[1] ?? 'another branch'}.`;
          },
          (v = '') => !taken().codes.some(([c]) => c === v),
        ),
      headId: yup.string().default(''),
      grantBranchAdmin: yup.boolean().default(true),
      street: yup.string().trim().required('Enter the street address.'),
      city: yup.string().trim().required('Enter the town or city.'),
      state: state(),
      lga: yup
        .string()
        .default('')
        .test('in-state', 'Select an LGA in the chosen state', function (v = '') {
          return !v || lgasOf(this.parent.state ?? '').includes(v);
        }),
      phone: optionalNigerianPhone('Enter a Nigerian number, like 0803 555 0142.'),
      email: yup.string().trim().default('').email('Enter a valid email.'),
      sections: yup
        .array(yup.mixed<SchoolSection>().required())
        .default([])
        .min(1, 'Choose at least one section.'),
      hasStore: yup.boolean().default(true),
    }),
  );
