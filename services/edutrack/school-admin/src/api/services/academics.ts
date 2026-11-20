import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AcademicSession,
  ArmInput,
  AssessmentConfig,
  AssessmentView,
  AssignmentInput,
  AssignmentsView,
  AssignmentWarning,
  AttendanceArmDetail,
  AttendanceOverview,
  CalendarEvent,
  CalendarEventInput,
  CalendarView,
  Checklist,
  ClassArm,
  ClassDetail,
  ClassesView,
  Correction,
  CurriculumInput,
  CurriculumView,
  LevelInput,
  NewSessionPayload,
  PromotionDecisionInput,
  PromotionView,
  PublishCheck,
  ReportCard,
  ResultSheet,
  ResultsMatrix,
  SectionInput,
  SectionsView,
  SessionsView,
  SubjectImportPreview,
  SubjectImportRow,
  SubjectInput,
  TermInput,
  TimetableArmOption,
  TimetableView,
} from '@/types';

import {
  cleanParams,
  deleteRequest,
  getBlob,
  getRequest,
  postRequest,
  putRequest,
} from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * Academics changes ripple: classes feed students and timetables, subjects feed assignments, and
 * every area describes a Setup Center step. A mutation refreshes all of Academics, the Setup
 * Center, nav counts and the working context (sessions and terms).
 */
function useAcademicsMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [
          queryKeys.academics.all,
          queryKeys.staff.all,
          queryKeys.setup.all,
          queryKeys.navCounts,
          queryKeys.comms.all,
          queryKeys.notifications,
          queryKeys.contextOptions,
          queryKeys.students.all,
          queryKeys.enrollment,
          queryKeys.admissions.all,
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}

const A = '/v1/academics';
const k = queryKeys.academics;

/* ---------------- Sections ---------------- */

export const useSectionsQuery = () =>
  useQuery({ queryKey: k.sections, queryFn: () => getRequest<SectionsView>(`${A}/sections`) });

export const useSaveSectionsMutation = () =>
  useAcademicsMutation((sections: SectionInput[]) =>
    putRequest<SectionsView>(`${A}/sections`, { sections }),
  );

/* ---------------- Sessions & terms ---------------- */

export const useSessionsQuery = () =>
  useQuery({ queryKey: k.sessions, queryFn: () => getRequest<SessionsView>(`${A}/sessions`) });

export const useCreateSessionMutation = () =>
  useAcademicsMutation((p: NewSessionPayload) => postRequest<AcademicSession>(`${A}/sessions`, p));

export const useSaveTermsMutation = (id: MaybeRefOrGetter<string>) =>
  useAcademicsMutation((terms: TermInput[]) =>
    putRequest<AcademicSession>(`${A}/sessions/${toValue(id)}/terms`, { terms }),
  );

export const useStartSessionMutation = () =>
  useAcademicsMutation((id: string) => postRequest<AcademicSession>(`${A}/sessions/${id}/start`));

export const useSessionCloseQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.sessionClose(toValue(id))),
    queryFn: () =>
      getRequest<{ session: AcademicSession; checklist: Checklist }>(
        `${A}/sessions/${toValue(id)}/close`,
      ),
  });

export const useCloseSessionMutation = () =>
  useAcademicsMutation((id: string) => postRequest(`${A}/sessions/${id}/close`));

export const useCloseTermMutation = () =>
  useAcademicsMutation((id: string) => postRequest(`${A}/terms/${id}/close`));

/* ---------------- Calendar ---------------- */

export const useCalendarQuery = () =>
  useQuery({ queryKey: k.calendar, queryFn: () => getRequest<CalendarView>(`${A}/calendar`) });

export const useSaveEventMutation = () =>
  useAcademicsMutation(({ id, ...p }: CalendarEventInput & { id?: string }) =>
    id
      ? putRequest<CalendarEvent>(`${A}/calendar/events/${id}`, p)
      : postRequest<CalendarEvent>(`${A}/calendar/events`, p),
  );

export const useDeleteEventMutation = () =>
  useAcademicsMutation((id: string) => deleteRequest(`${A}/calendar/events/${id}`));

/* ---------------- Classes & arms ---------------- */

export const useClassesQuery = () =>
  useQuery({ queryKey: k.classes, queryFn: () => getRequest<ClassesView>(`${A}/classes`) });

export const useClassQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.classDetail(toValue(id))),
    queryFn: () => getRequest<ClassDetail>(`${A}/classes/${toValue(id)}`),
  });

export const useApplyDefaultLevelsMutation = () =>
  useAcademicsMutation(() => postRequest<ClassesView>(`${A}/classes/defaults`));

export const useAddLevelMutation = () =>
  useAcademicsMutation((p: LevelInput) => postRequest<ClassesView>(`${A}/classes/levels`, p));

export const useRenameLevelMutation = () =>
  useAcademicsMutation(({ id, name }: { id: string; name: string }) =>
    putRequest<ClassesView>(`${A}/classes/levels/${id}`, { name }),
  );

export const useMoveLevelMutation = () =>
  useAcademicsMutation(({ id, direction }: { id: string; direction: 'up' | 'down' }) =>
    postRequest<ClassesView>(`${A}/classes/levels/${id}/move`, { direction }),
  );

export const useDeleteLevelMutation = () =>
  useAcademicsMutation((id: string) => deleteRequest<ClassesView>(`${A}/classes/levels/${id}`));

export const useAddArmMutation = () =>
  useAcademicsMutation(({ levelId, ...p }: ArmInput & { levelId: string }) =>
    postRequest<ClassesView>(`${A}/classes/levels/${levelId}/arms`, p),
  );

export const useUpdateArmMutation = () =>
  useAcademicsMutation(({ id, ...p }: Partial<ArmInput> & { id: string }) =>
    putRequest<ClassArm>(`${A}/classes/arms/${id}`, p),
  );

export const useDeleteArmMutation = () =>
  useAcademicsMutation((id: string) => deleteRequest<ClassesView>(`${A}/classes/arms/${id}`));

/* ---------------- Subjects & curriculum ---------------- */

export const useCurriculumQuery = () =>
  useQuery({
    queryKey: k.curriculum,
    queryFn: () => getRequest<CurriculumView>(`${A}/curriculum`),
  });

export const useApplyDefaultSubjectsMutation = () =>
  useAcademicsMutation(() => postRequest<CurriculumView>(`${A}/subjects/defaults`));

export const useSaveSubjectMutation = () =>
  useAcademicsMutation(({ original, ...p }: SubjectInput & { original?: string }) =>
    original
      ? putRequest<CurriculumView>(`${A}/subjects/${original}`, p)
      : postRequest<CurriculumView>(`${A}/subjects`, p),
  );

export const useDeleteSubjectMutation = () =>
  useAcademicsMutation((code: string) => deleteRequest<CurriculumView>(`${A}/subjects/${code}`));

/* Bulk upload: download the template, check a filled-in file, then import the corrected rows. */

/** The Excel template (a raw file, not the JSON envelope), saved to the browser's downloads. */
export async function downloadSubjectTemplate() {
  const url = URL.createObjectURL(await getBlob(`${A}/subjects/template`));
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: 'edutrack-subjects-template.xlsx',
  });
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads and checks the file; nothing is saved. `content`: base64 for .xlsx, text for .csv. */
export const useSubjectImportPreviewMutation = () =>
  useMutation({
    mutationFn: (p: { fileName: string; content: string }) =>
      postRequest<SubjectImportPreview>(`${A}/subjects/import`, p),
  });

/** All rows or none: a 422 IMPORT_HAS_ISSUES carries `<row>.<field>` messages. */
export const useSubjectImportCommitMutation = () =>
  useAcademicsMutation((rows: SubjectImportRow[]) =>
    postRequest<{ imported: number }>(`${A}/subjects/import/commit`, { rows }),
  );

export const useSaveCurriculumMutation = () =>
  useAcademicsMutation((p: CurriculumInput) =>
    putRequest<CurriculumView & { cleared: number }>(`${A}/curriculum`, p),
  );

/* ---------------- Teacher assignments ---------------- */

export const useAssignmentsQuery = (branch: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.assignments(toValue(branch))),
    queryFn: () =>
      getRequest<AssignmentsView>(`${A}/assignments`, {
        params: cleanParams({ branch: toValue(branch) }),
      }),
  });

export const checkAssignment = (p: AssignmentInput) =>
  postRequest<AssignmentWarning[]>(`${A}/assignments/check`, p);

export const useSaveAssignmentMutation = () =>
  useAcademicsMutation((p: AssignmentInput) => postRequest<AssignmentsView>(`${A}/assignments`, p));

export const useDeleteAssignmentMutation = () =>
  useAcademicsMutation((id: string) => deleteRequest<AssignmentsView>(`${A}/assignments/${id}`));

export const useCopyAssignmentsMutation = () =>
  useAcademicsMutation(() =>
    postRequest<AssignmentsView & { copied: number }>(`${A}/assignments/copy-previous`),
  );

/* ---------------- Timetable ---------------- */

export const useTimetableArmsQuery = (
  term: MaybeRefOrGetter<string>,
  branch: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() => k.timetableArms(toValue(term), toValue(branch))),
    queryFn: () =>
      getRequest<TimetableArmOption[]>(`${A}/timetable/arms`, {
        params: cleanParams({ term: toValue(term), branch: toValue(branch) }),
      }),
  });

export const useTimetableQuery = (arm: MaybeRefOrGetter<string>, term: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.timetable(toValue(arm), toValue(term))),
    queryFn: () =>
      getRequest<TimetableView>(`${A}/timetable`, {
        params: { arm: toValue(arm), term: toValue(term) },
      }),
    enabled: computed(() => !!toValue(arm)),
  });

type GridPayload = { armId: string; termId: string; grid: Record<string, string> };

export const useSaveTimetableMutation = () =>
  useAcademicsMutation((p: GridPayload) => putRequest<TimetableView>(`${A}/timetable`, p));

export const useSuggestTimetableMutation = () =>
  useAcademicsMutation((p: GridPayload) => postRequest<TimetableView>(`${A}/timetable/suggest`, p));

export const useCopyTimetableMutation = () =>
  useAcademicsMutation((p: { armId: string; termId: string; fromTermId: string }) =>
    postRequest<TimetableView>(`${A}/timetable/copy`, p),
  );

export const useTimetableActionMutation = () =>
  useAcademicsMutation(
    ({
      action,
      ...p
    }: {
      action: 'review' | 'publish' | 'revise';
      armId: string;
      termId: string;
    }) => postRequest<TimetableView>(`${A}/timetable/${action}`, p),
  );

/* ---------------- Assessment & grading ---------------- */

export const useAssessmentQuery = () =>
  useQuery({
    queryKey: k.assessment,
    queryFn: () => getRequest<AssessmentView>(`${A}/assessment`),
  });

export const useSaveAssessmentMutation = () =>
  useAcademicsMutation((p: AssessmentConfig) => putRequest<AssessmentView>(`${A}/assessment`, p));

/* ---------------- Results ---------------- */

export const useResultsQuery = (
  params: MaybeRefOrGetter<{ section?: string; term?: string; branch?: string }>,
) =>
  useQuery({
    queryKey: computed(() => k.results(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<ResultsMatrix>(`${A}/results`, { params: cleanParams(toValue(params)) }),
  });

export const useResultSheetQuery = (
  armId: MaybeRefOrGetter<string>,
  subject: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() => k.sheet(toValue(armId), toValue(subject))),
    queryFn: () =>
      getRequest<ResultSheet>(`${A}/results/sheets/${toValue(armId)}/${toValue(subject)}`),
  });

export const useSheetActionMutation = () =>
  useAcademicsMutation(
    ({
      armId,
      subject,
      action,
      note,
    }: {
      armId: string;
      subject: string;
      action: 'approve' | 'return';
      note?: string;
    }) => postRequest<ResultSheet>(`${A}/results/sheets/${armId}/${subject}/${action}`, { note }),
  );

/** Reopens score entry on one sheet for some days after the term's result deadline. */
export const useReopenEntryMutation = () =>
  useAcademicsMutation(
    ({ armId, subject, days }: { armId: string; subject: string; days: number }) =>
      postRequest<ResultSheet>(`${A}/results/sheets/${armId}/${subject}/reopen`, { days }),
  );

export const getPublishCheck = (armId: string) =>
  getRequest<PublishCheck>(`${A}/results/publish/${armId}`);

export const usePublishResultsMutation = () =>
  useAcademicsMutation(({ armId, acknowledged }: { armId: string; acknowledged: boolean }) =>
    postRequest<PublishCheck>(`${A}/results/publish/${armId}`, { acknowledged }),
  );

export const useReportCardQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.reportCard(toValue(studentId))),
    queryFn: () => getRequest<ReportCard>(`${A}/results/report-card/${toValue(studentId)}`),
  });

/** Withholds a report card with a reason, or releases it (`action: 'release'`). */
export const useReportCardHoldMutation = () =>
  useAcademicsMutation(
    ({
      studentId,
      action,
      reason,
    }: {
      studentId: string;
      action: 'hold' | 'release';
      reason?: string;
    }) =>
      postRequest<unknown>(
        `${A}/results/report-card/${studentId}/${action}`,
        reason ? { reason } : {},
      ),
  );

export const useCorrectionsQuery = () =>
  useQuery({
    queryKey: k.corrections,
    queryFn: () => getRequest<Correction[]>(`${A}/results/corrections`),
  });

export const useCorrectionActionMutation = () =>
  useAcademicsMutation(
    ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note: string }) =>
      postRequest<Correction>(`${A}/results/corrections/${id}/${action}`, { note }),
  );

/* ---------------- Attendance (read-only) ---------------- */

export const useAttendanceQuery = (params: MaybeRefOrGetter<{ term?: string; branch?: string }>) =>
  useQuery({
    queryKey: computed(() => k.attendance(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<AttendanceOverview>(`${A}/attendance`, { params: cleanParams(toValue(params)) }),
  });

export const useAttendanceArmQuery = (
  armId: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<{ term?: string }>,
) =>
  useQuery({
    queryKey: computed(() => k.attendanceArm(toValue(armId), cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<AttendanceArmDetail>(`${A}/attendance/${toValue(armId)}`, {
        params: cleanParams(toValue(params)),
      }),
  });

/* ---------------- Promotion ---------------- */

export const usePromotionQuery = (classId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.promotion(toValue(classId))),
    queryFn: () =>
      getRequest<PromotionView>(`${A}/promotion`, {
        params: cleanParams({ class: toValue(classId) }),
      }),
  });

export const useSaveDecisionsMutation = () =>
  useAcademicsMutation(
    ({ classId, decisions }: { classId: string; decisions: PromotionDecisionInput[] }) =>
      putRequest<PromotionView>(`${A}/promotion/${classId}`, { decisions }),
  );

export const useApplyPromotionMutation = () =>
  useAcademicsMutation((classId: string) =>
    postRequest<PromotionView & { created: number }>(`${A}/promotion/${classId}/apply`),
  );
