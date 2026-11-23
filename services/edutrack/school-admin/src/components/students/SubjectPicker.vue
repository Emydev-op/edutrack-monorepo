<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';
import { CheckIcon } from '@lucide/vue';
import { computed } from 'vue';

import { groupKey, picksIn, toggleElective } from '@/lib/subject-choices';
import type { SubjectGroup, SubjectRef } from '@/types';

/**
 * The religious subject (choose 1) and each elective group with its rule: radio chips when a
 * group allows one pick, toggle chips otherwise (never more than the group's maximum).
 */
const props = defineProps<{
  religiousOptions: SubjectRef[];
  groups: SubjectGroup[];
  /** Subject ids with no teacher this term. */
  unstaffed?: string[];
  /** Messages keyed `religious` or by group key. */
  errors?: Record<string, string>;
  /** Shown in the "has no teacher yet" note. */
  session?: string;
}>();
const religiousId = defineModel<string | null>('religious', { required: true });
const electives = defineModel<string[]>('electives', { required: true });

const chip = (on: boolean, disabled = false) =>
  cn(
    'flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-left text-[13px] transition-colors',
    on
      ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
      : disabled
        ? 'cursor-default bg-muted text-faint'
        : 'bg-card hover:bg-muted',
  );

const unstaffedChosen = computed(() => {
  const ids = new Set(props.unstaffed ?? []);
  const all = [...props.religiousOptions, ...props.groups.flatMap((g) => g.subjects)];
  return all.filter(
    (s) =>
      ids.has(s.subjectId) &&
      (s.subjectId === religiousId.value || electives.value.includes(s.subjectId)),
  );
});
const atMax = (g: SubjectGroup) =>
  g.maxPicks > 1 && picksIn(g, electives.value).length >= g.maxPicks;
const toggle = (g: SubjectGroup, id: string) => {
  electives.value = toggleElective(g, electives.value, id);
};
</script>

<template>
  <div class="flex flex-col gap-4.5">
    <div v-if="religiousOptions.length" class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium">Religious studies · choose 1</span>
      <div role="radiogroup" aria-label="Religious studies" class="flex flex-wrap gap-2">
        <button
          v-for="r in religiousOptions"
          :key="r.subjectId"
          type="button"
          role="radio"
          :aria-checked="religiousId === r.subjectId"
          :class="chip(religiousId === r.subjectId)"
          @click="religiousId = r.subjectId"
        >
          {{ r.name }}
        </button>
      </div>
      <p v-if="errors?.religious" role="alert" class="text-xs text-destructive">
        {{ errors.religious }}
      </p>
    </div>

    <div v-for="g in groups" :key="groupKey(g)" class="flex flex-col gap-1.5">
      <span class="text-[13px] font-medium"
        >{{ g.name }} · {{ g.rule
        }}<span v-if="g.minPicks > 0" class="text-destructive"> *</span></span
      >
      <span v-if="g.note" class="text-xs text-muted-foreground">{{ g.note }}</span>
      <div
        v-if="g.maxPicks === 1"
        role="radiogroup"
        :aria-label="g.name"
        class="flex flex-wrap gap-2"
      >
        <button
          v-for="s in g.subjects"
          :key="s.subjectId"
          type="button"
          role="radio"
          :aria-checked="electives.includes(s.subjectId)"
          :class="chip(electives.includes(s.subjectId))"
          @click="toggle(g, s.subjectId)"
        >
          {{ s.name }}
        </button>
      </div>
      <div v-else role="group" :aria-label="g.name" class="flex flex-wrap gap-2">
        <button
          v-for="s in g.subjects"
          :key="s.subjectId"
          type="button"
          :aria-pressed="electives.includes(s.subjectId)"
          :disabled="!electives.includes(s.subjectId) && atMax(g)"
          :class="chip(electives.includes(s.subjectId), atMax(g))"
          @click="toggle(g, s.subjectId)"
        >
          <CheckIcon v-if="electives.includes(s.subjectId)" class="size-3.5" aria-hidden="true" />
          {{ s.name }}
        </button>
      </div>
      <p v-if="errors?.[groupKey(g)]" role="alert" class="text-xs text-destructive">
        {{ errors[groupKey(g)] }}
      </p>
    </div>

    <p v-for="s in unstaffedChosen" :key="s.subjectId" class="text-xs text-warning-strong">
      {{ s.name }} has no teacher{{ session ? ` for ${session}` : '' }} yet. The student can still
      enroll; lessons start when a teacher is assigned.
    </p>
  </div>
</template>
