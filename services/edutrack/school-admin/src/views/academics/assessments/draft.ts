import { computed, inject, provide, ref, watch, type InjectionKey, type Ref } from 'vue';

import type { AssessmentConfig, AssessmentScheme, AssessmentView } from '@/types';

import { schemeErrors, startingScheme } from './constants';

/** Deep copy that also works on Vue's reactive proxies (structuredClone doesn't). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * One editable copy of the school's assessment configuration, shared by the Scheme and Grading
 * tabs so switching tabs never loses edits. Saved together from the layout's save bar.
 */
export function createAssessmentDraft(view: Ref<AssessmentView | undefined>) {
  const draft = ref<AssessmentConfig | null>(null);
  const original = ref('');
  const selected = ref('');

  const toConfig = (v: AssessmentView): AssessmentConfig => ({
    same: v.same,
    schemes: clone(v.schemes),
    showPosition: v.showPosition,
    rounding: v.rounding,
    passMark: v.passMark,
  });
  const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== original.value);

  function reset() {
    if (!view.value) return;
    draft.value = toConfig(view.value);
    original.value = JSON.stringify(draft.value);
    if (!view.value.sections.some((s) => s.name === selected.value))
      selected.value =
        view.value.missing.find((m) => m !== 'All sections') ?? view.value.sections[0]?.name ?? '';
  }
  watch(view, () => !dirty.value && reset(), { immediate: true });

  const sections = computed(() => view.value?.sections ?? []);
  /** The scheme being edited: "*" when one scheme applies everywhere. */
  const key = computed(() => (draft.value?.same ? '*' : selected.value));
  const label = (k: string) => (k === '*' ? 'All sections' : k);
  const codeOf = (k: string) => sections.value.find((s) => s.name === k)?.code ?? '';
  const scheme = computed<AssessmentScheme | null>(() => draft.value?.schemes[key.value] ?? null);

  function setSame(same: boolean) {
    const d = draft.value!;
    if (same && !d.schemes['*']) {
      const first = sections.value.map((s) => d.schemes[s.name]).find(Boolean);
      d.schemes['*'] = clone(first ?? startingScheme('JSS'));
    }
    if (!same)
      for (const s of sections.value)
        if (!d.schemes[s.name]) d.schemes[s.name] = clone(d.schemes['*'] ?? startingScheme(s.code));
    d.same = same;
  }

  /** Creates a starting scheme for the current section when it has none yet. */
  function ensureScheme(k = key.value) {
    const d = draft.value!;
    if (!d.schemes[k]) d.schemes[k] = startingScheme(k === '*' ? 'JSS' : codeOf(k));
    return d.schemes[k]!;
  }

  const keys = computed(() => (draft.value?.same ? ['*'] : sections.value.map((s) => s.name)));
  const errors = computed(() =>
    !draft.value
      ? []
      : keys.value.flatMap((k) => {
          const s = draft.value!.schemes[k];
          return s ? schemeErrors(label(k), s) : [];
        }),
  );
  const missing = computed(() => keys.value.filter((k) => !draft.value?.schemes[k]).map(label));
  const errorsFor = (k: string) => {
    const s = draft.value?.schemes[k];
    return s ? schemeErrors(label(k), s) : [];
  };

  const api = {
    view,
    draft,
    dirty,
    reset,
    selected,
    sections,
    key,
    label,
    scheme,
    setSame,
    ensureScheme,
    keys,
    errors,
    errorsFor,
    missing,
  };
  provide(KEY, api);
  return api;
}

type Draft = ReturnType<typeof createAssessmentDraft>;
const KEY: InjectionKey<Draft> = Symbol('assessment-draft');

export function useAssessmentDraft(): Draft {
  const d = inject(KEY);
  if (!d) throw new Error('useAssessmentDraft must be used inside AssessmentsLayout');
  return d;
}
