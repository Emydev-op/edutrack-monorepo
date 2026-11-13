import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { nigerianPhone, optionalNigerianPhone } from './common';

/** Phone, address and emergency contact; name and email are kept by the school office. */
export const profileSchema = toTypedSchema(
  yup.object({
    phone: nigerianPhone(),
    address: yup.string().trim().max(200, 'Keep the address under 200 characters').default(''),
    // The emergency contact is optional, but once started it needs a name and a mobile number.
    contactName: yup
      .string()
      .trim()
      .default('')
      .test(
        'needed',
        'Enter the emergency contact’s name',
        (value, ctx) =>
          Boolean(value) || !(ctx.parent.contactPhone || ctx.parent.contactRelationship),
      ),
    contactPhone: optionalNigerianPhone().test(
      'needed',
      'Enter the emergency contact’s mobile number',
      (value, ctx) => Boolean(value) || !ctx.parent.contactName,
    ),
    contactRelationship: yup.string().trim().default(''),
  }),
);
