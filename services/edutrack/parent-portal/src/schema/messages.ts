import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { BODY_MAX, SUBJECT_MAX } from '@/lib/messages';

export const newMessageSchema = toTypedSchema(
  yup.object({
    subject: yup
      .string()
      .trim()
      .required('Add a subject')
      .max(SUBJECT_MAX, `Keep the subject to ${SUBJECT_MAX} characters`),
    body: yup
      .string()
      .trim()
      .required('Write your message')
      .max(BODY_MAX, `Keep the message to ${BODY_MAX} characters`),
  }),
);
