import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { isNigerianState, lgasOf } from '@edutrack/app-kit/lib/nigeria-locations';
import { contrastWithWhite, isHexColor } from '@/lib/brand-color';
import type { AcademicSection, PlanName } from '@/types';

import { email, optionalNigerianPhone } from './common';

const nigerianState = () =>
  yup
    .string()
    .default('')
    .required('Select the state')
    .test('known-state', 'Select a Nigerian state', (v) => isNigerianState(v ?? ''));

export const editSchoolSchema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Enter the display name'),
    contactEmail: email('Enter a valid contact email'),
    phone: yup.string().trim().default(''),
    state: nigerianState(),
  }),
);

export const inviteSchoolAdminSchema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Enter a name'),
    email: email(),
    role: yup.mixed<'School Admin' | 'Owner'>().oneOf(['School Admin', 'Owner']).required(),
    scope: yup.string().required(),
  }),
);

export const ALL_BRANCHES = 'All branches';
export const OTHER_POSITION = 'Other';
export const MAX_ADMINS = 5;
/** Positions a school's first administrators usually hold. "Other" asks for the title. */
export const SCHOOL_POSITIONS = [
  'Proprietor',
  'Principal',
  'Vice Principal',
  'Head Teacher',
  'School Administrator',
  'Bursar',
  'ICT Administrator',
  OTHER_POSITION,
] as const;

/**
 * Provisioning is one form across six steps. The view validates only the current step's fields
 * (see PROVISION_STEP_FIELDS) so later steps don't show errors early.
 */
export const provisionSchema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Enter the display name'),
    legalName: yup.string().trim().default(''),
    ownership: yup
      .mixed<'Private' | 'Public' | 'Mission'>()
      .oneOf(['Private', 'Public', 'Mission'])
      .required(),
    registrationNumber: yup.string().trim().default(''),
    email: email('Enter a valid email'),
    phone: optionalNigerianPhone('Enter a Nigerian number, like 0809 555 0123'),
    state: nigerianState(),
    lga: yup
      .string()
      .default('')
      .required('Select the LGA')
      .test('lga-in-state', 'Select an LGA in the chosen state', function (lga) {
        return lgasOf(this.parent.state ?? '').includes(lga ?? '');
      }),
    brandColor: yup
      .string()
      .required()
      .test('hex', 'Enter a 6-digit hex color, like #24497A.', (v) => isHexColor(v ?? ''))
      .test(
        'contrast',
        (v) =>
          `This color is too light for white text (${contrastWithWhite(v.value ?? '').toFixed(1)}:1). Pick a darker shade so buttons stay readable.`,
        (v) => contrastWithWhite(v ?? '') >= 4.5,
      ),
    sections: yup
      .array(yup.mixed<AcademicSection>().required())
      .min(1, 'Choose at least one section')
      .required(),
    branches: yup
      .array(
        yup.object({
          name: yup.string().trim().required('Name every branch'),
          address: yup.string().default(''),
        }),
      )
      .min(1, 'Add at least one branch')
      .required(),
    plan: yup.mixed<PlanName>().oneOf(['Starter', 'Growth', 'Enterprise']).required(),
    startDate: yup.string().required('Choose a start date'),
    admins: yup
      .array(
        yup.object({
          name: yup.string().trim().required("Enter the administrator's name"),
          email: email('The invitation needs a valid email'),
          phone: optionalNigerianPhone('Enter a Nigerian number, like 0809 555 0177'),
          position: yup.string().required('Choose a position'),
          positionOther: yup
            .string()
            .trim()
            .default('')
            .when('position', ([position], schema) =>
              position === OTHER_POSITION ? schema.required('Enter the position') : schema,
            ),
          scope: yup.string().required('Choose what they manage'),
        }),
      )
      .min(1, 'Add at least one administrator')
      .max(
        MAX_ADMINS,
        `You can invite up to ${MAX_ADMINS} administrators now; add more later from the school.`,
      )
      .test('unique-emails', 'Each administrator needs a different email', (admins) => {
        const emails = (admins ?? []).map((a) => a.email?.trim().toLowerCase()).filter(Boolean);
        return new Set(emails).size === emails.length;
      })
      .test(
        'school-wide-admin',
        'At least one administrator must manage all branches, so someone can run school-wide setup and billing.',
        (admins) => (admins ?? []).some((a) => a.scope === ALL_BRANCHES),
      )
      .test(
        'scope-exists',
        'A branch an administrator manages no longer exists. Choose another.',
        function (admins) {
          const branches = new Set(
            ((this.parent.branches ?? []) as { name: string }[]).map((b) => b.name.trim()),
          );
          return (admins ?? []).every(
            (a) => !a.scope || a.scope === ALL_BRANCHES || branches.has(a.scope),
          );
        },
      )
      .required(),
  }),
);

export const PROVISION_STEP_FIELDS = [
  ['name', 'email', 'phone', 'brandColor'],
  ['sections'],
  ['branches'],
  ['startDate'],
  // The administrators step is the last with inputs, so it validates the whole form (nested rows
  // and the cross-field rules above included); see ProvisionSchoolView.
  'all',
  [],
] as const;
