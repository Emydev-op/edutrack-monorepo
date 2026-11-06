import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { optionalNigerianPhone } from './common';

export const profileSchema = toTypedSchema(
  yup.object({
    firstName: yup.string().trim().required('Enter your first name'),
    lastName: yup.string().trim().required('Enter your last name'),
    phone: optionalNigerianPhone(),
  }),
);
