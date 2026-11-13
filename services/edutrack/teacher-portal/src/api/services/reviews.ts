import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  ResultSheet,
  ReviewNote,
  ReviewNotesList,
  ReviewSheet,
  ReviewSheetsList,
} from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/* ---------- Result sheets ---------- */

const reviewSheetKey = (id: string) => queryKeys.reviews.key('sheet', id);

/** Sheets waiting on me (HOD) for the selected term, and the ones I decided recently. */
export function useReviewSheetsQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.reviews.key('sheets', termId.value)),
    queryFn: () =>
      getRequest<ReviewSheetsList>('/v1/reviews/sheets', { params: { term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
  });
}

export const useReviewSheetQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => reviewSheetKey(toValue(id))),
    queryFn: () => getRequest<ReviewSheet>(`/v1/reviews/sheets/${encodeURIComponent(toValue(id))}`),
    retry: false,
  });

export function useSheetDecisionMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: 'forward' } | { action: 'return'; comment: string }) =>
      postRequest<ResultSheet>(
        `/v1/reviews/sheets/${encodeURIComponent(toValue(id))}/${input.action}`,
        input.action === 'return' ? { comment: input.comment } : undefined,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.reviews.all });
      void qc.invalidateQueries({ queryKey: queryKeys.navCounts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void qc.invalidateQueries({ queryKey: queryKeys.results.all });
      void qc.invalidateQueries({ queryKey: queryKeys.teaching.all });
    },
  });
}

/* ---------- Lesson notes ---------- */

const reviewNoteKey = (id: string) => queryKeys.reviews.key('note', id);

/** Lesson notes waiting on me (HOD / Academic Head) for the selected term, and recent decisions. */
export function useReviewNotesQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.reviews.key('notes', termId.value)),
    queryFn: () =>
      getRequest<ReviewNotesList>('/v1/reviews/notes', { params: { term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
  });
}

export const useReviewNoteQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => reviewNoteKey(toValue(id))),
    queryFn: () => getRequest<ReviewNote>(`/v1/reviews/notes/${encodeURIComponent(toValue(id))}`),
    retry: false,
  });

export function useNoteDecisionMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: 'approve' } | { action: 'return'; comment: string }) =>
      postRequest<ReviewNote>(
        `/v1/reviews/notes/${encodeURIComponent(toValue(id))}/${input.action}`,
        input.action === 'return' ? { comment: input.comment } : undefined,
      ),
    onSuccess: (note) => {
      qc.setQueryData(reviewNoteKey(note.id), note);
      void qc.invalidateQueries({ queryKey: queryKeys.reviews.key('notes') });
      void qc.invalidateQueries({ queryKey: queryKeys.navCounts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void qc.invalidateQueries({ queryKey: queryKeys.lessonNotes.all });
    },
  });
}
