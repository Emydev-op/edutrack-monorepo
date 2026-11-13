import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type { LessonNote, LessonNotePayload, LessonNotesList, NewLessonNotePayload } from '@/types';

import { getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.lessonNotes;
const noteKey = (id: string) => k.key('note', id);

/** My weeks, subjects × levels and every expected note for the selected term. */
export function useLessonNotesQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('list', termId.value)),
    queryFn: () =>
      getRequest<LessonNotesList>('/v1/lesson-notes', { params: { term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
  });
}

export const useLessonNoteQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => noteKey(toValue(id))),
    queryFn: () => getRequest<LessonNote>(`/v1/lesson-notes/${encodeURIComponent(toValue(id))}`),
    enabled: computed(() => Boolean(toValue(id))),
    retry: false,
  });

/** Creates a note (`id` empty) or saves an existing one; `submit` sends it to the reviewer. */
export function useSaveLessonNoteMutation() {
  const qc = useQueryClient();
  const { termId } = useTermContext();
  return useMutation({
    mutationFn: (input: { id?: string; payload: LessonNotePayload | NewLessonNotePayload }) =>
      input.id
        ? putRequest<LessonNote>(`/v1/lesson-notes/${encodeURIComponent(input.id)}`, input.payload)
        : postRequest<LessonNote>('/v1/lesson-notes', input.payload, {
            params: { term: termId.value },
          }),
    onSuccess: (note) => {
      qc.setQueryData(noteKey(note.id), note);
      void qc.invalidateQueries({ queryKey: k.key('list') });
      void qc.invalidateQueries({ queryKey: queryKeys.navCounts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void qc.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}
