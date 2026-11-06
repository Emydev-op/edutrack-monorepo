import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { email, optionalNigerianPhone } from './common';

const userFields = {
  firstName: yup.string().trim().required('Enter a first name'),
  lastName: yup.string().trim().required('Enter a last name'),
  email: email(),
  phone: optionalNigerianPhone(),
};

export const inviteUserDetailsSchema = toTypedSchema(yup.object(userFields));
export const editUserSchema = toTypedSchema(
  yup.object({ ...userFields, roleId: yup.string().required() }),
);
