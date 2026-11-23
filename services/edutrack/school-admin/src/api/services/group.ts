import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { Ref } from 'vue';

import { useAuthStore } from '@/stores/auth';
import type { LoginResponse } from '@/types';

import { getRequest, postRequest } from '../helpers';

export interface GroupOverview {
  group: { id: string; name: string };
  role: string;
  schools: {
    id: string;
    name: string;
    slug: string;
    brandColor: string | null;
    status: string;
    plan: string | null;
    subscription: string | null;
    term: string | null;
    students: number;
    staff: number;
    branches: number;
    fees: { billed: number; collected: number; outstanding: number } | null;
  }[];
  totals: {
    schools: number;
    students: number;
    staff: number;
    branches: number;
    fees: { billed: number; collected: number; outstanding: number } | null;
  };
}

/** The group overview, for a school group's own staff (others get 403, so it's not retried). */
export const useGroupOverviewQuery = () =>
  useQuery({
    queryKey: ['group-overview'],
    queryFn: () => getRequest<GroupOverview>('/v1/group/overview'),
    retry: false,
    staleTime: 60_000,
  });

/** Moves the session to another of the person's schools (group staff move between them). */
export const useSwitchSchoolMutation = () => {
  const auth = useAuthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schoolId: string) =>
      postRequest<LoginResponse>('/v1/auth/switch-school', { schoolId }),
    onSuccess: (session) => {
      auth.refreshed(session);
      qc.clear();
    },
  });
};

export interface GroupTemplate {
  key:
    'grading' | 'fees' | 'roles' | 'messages' | 'calendar' | 'subjects' | 'policies' | 'branding';
  label: string;
  description: string;
  canEdit: boolean;
  saved: { at: string; from: string | null } | null;
  schools: { schoolId: string; school: string; status: 'Matches' | 'Differs' | 'Not set' | null }[];
}
export interface GroupTemplatesView {
  group: string;
  templates: GroupTemplate[];
}
type ApplyResult = GroupTemplatesView & {
  label: string;
  results: { school: string; applied: boolean; notes: string[] }[];
};

/** The group's shared setup and whether each school matches it. */
export const useGroupTemplatesQuery = () =>
  useQuery({
    queryKey: ['group-templates'],
    queryFn: () => getRequest<GroupTemplatesView>('/v1/group/templates'),
    retry: false,
  });

export const useSaveGroupTemplateMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, schoolId }: { key: string; schoolId: string }) =>
      postRequest<GroupTemplatesView>(`/v1/group/templates/${key}/save`, { schoolId }),
    onSuccess: (data) => qc.setQueryData(['group-templates'], data),
  });
};

export const useApplyGroupTemplateMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, schoolIds }: { key: string; schoolIds: string[] }) =>
      postRequest<ApplyResult>(`/v1/group/templates/${key}/apply`, { schoolIds }),
    onSuccess: (data) => qc.setQueryData(['group-templates'], data),
  });
};

export type ReportPeriod = 'current' | 'previous';
export interface GroupReportSchool {
  id: string;
  name: string;
  brandColor: string | null;
  term: string | null;
  compareTerm: string | null;
  students: { onRoll: number; admitted: number; left: number };
  staff: { total: number; teaching: number; perTeacher: number | null };
  attendance: { rate: number | null; before: number | null };
  results: {
    graded: number;
    average: number | null;
    passRate: number | null;
    averageBefore: number | null;
    passRateBefore: number | null;
  };
  fees: {
    billed: number;
    collected: number;
    outstanding: number;
    rate: number | null;
    rateBefore: number | null;
    collectedBefore: number | null;
  } | null;
  enrolmentBefore: { admitted: number; left: number } | null;
}
export interface GroupReports {
  group: { id: string; name: string };
  role: string;
  period: ReportPeriod;
  seesFees: boolean;
  schools: GroupReportSchool[];
  totals: {
    schools: number;
    students: { onRoll: number; admitted: number; left: number };
    staff: { total: number; teaching: number; perTeacher: number | null };
    attendance: number | null;
    results: { graded: number; average: number | null; passRate: number | null };
    fees: { billed: number; collected: number; outstanding: number; rate: number | null } | null;
  };
  subjects: {
    subject: string;
    schools: Record<string, number>;
    average: number;
    results: number;
  }[];
  topStudents: {
    studentId: string;
    schoolId: string;
    name: string;
    school: string;
    className: string;
    subjects: number;
    average: number;
  }[];
  arrears:
    | { school: string; schoolId: string; level: string; students: number; outstanding: number }[]
    | null;
  collections: { month: string; schools: Record<string, number>; total: number }[] | null;
  methods: { method: string; amount: number }[] | null;
}

/** Group reports for this term or the term before, compared with the term before that. */
export const useGroupReportsQuery = (period: Ref<ReportPeriod>) =>
  useQuery({
    queryKey: ['group-reports', period],
    queryFn: () =>
      getRequest<GroupReports>('/v1/group/reports', { params: { period: period.value } }),
    retry: false,
    staleTime: 60_000,
  });

export type GroupAudience = 'everyone' | 'parents' | 'students' | 'teachers' | 'staff';
export type GroupChannel = 'In-app' | 'Email' | 'SMS';
export interface GroupAnnouncementAudience {
  audience: GroupAudience;
  channels: GroupChannel[];
  smsText?: string;
  schoolIds: string[];
}
export interface GroupAnnouncementPreview {
  schools: {
    schoolId: string;
    school: string;
    recipients: number;
    reach: Record<GroupChannel, number> | null;
    smsUnits: number;
    credit: number;
    enough: boolean;
    notes: string[];
    error: string | null;
  }[];
  recipients: number;
  smsUnits: number;
}
export interface GroupAnnouncementResult {
  results: {
    schoolId: string;
    school: string;
    sent: boolean;
    recipients: number;
    error: string | null;
  }[];
  sent: number;
  recipients: number;
}

/** Who a group announcement reaches in each chosen school. */
export const previewGroupAnnouncement = (p: GroupAnnouncementAudience) =>
  postRequest<GroupAnnouncementPreview>('/v1/group/announcements/preview', p);

/** Sends one announcement in each chosen school (each school sends its own copy). */
export const useSendGroupAnnouncementMutation = () =>
  useMutation({
    mutationFn: (p: GroupAnnouncementAudience & { title: string; body: string }) =>
      postRequest<GroupAnnouncementResult>('/v1/group/announcements', p),
  });
