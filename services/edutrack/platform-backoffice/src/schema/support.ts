import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { ISSUE_CATEGORIES, ISSUE_PRIORITIES } from '@/types';

export const createIssueSchema = toTypedSchema(
  yup.object({
    schoolId: yup.string().required('Choose the school'),
    requester: yup.string().trim().required('Who at the school raised it?'),
    subject: yup.string().trim().required('Add a subject'),
    category: yup.mixed<(typeof ISSUE_CATEGORIES)[number]>().oneOf(ISSUE_CATEGORIES).required(),
    priority: yup.mixed<(typeof ISSUE_PRIORITIES)[number]>().oneOf(ISSUE_PRIORITIES).required(),
    assignee: yup.string().default('Unassigned'),
    description: yup.string().trim().required('Describe the issue'),
  }),
);
