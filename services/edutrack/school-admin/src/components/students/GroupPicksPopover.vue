<script setup lang="ts">
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronDownIcon } from '@lucide/vue';
import { computed } from 'vue';

import { picksIn, toggleElective } from '@/lib/subject-choices';
import type { SubjectGroup } from '@/types';

/** A compact picker for one elective group: the picks on a button, checkboxes in a popover. */
const props = defineProps<{
  group: SubjectGroup;
  /** Shown on the button instead of the picks (e.g. "Apply to all"). */
  label?: string;
  invalid?: boolean;
  ariaLabel?: string;
}>();
/** Every elective the student picked; only this group's are changed. */
const electives = defineModel<string[]>({ required: true });

const picks = computed(() => picksIn(props.group, electives.value));
const names = computed(() =>
  props.group.subjects.filter((s) => picks.value.includes(s.subjectId)).map((s) => s.name),
);
const full = computed(() => props.group.maxPicks > 1 && picks.value.length >= props.group.maxPicks);
const toggle = (id: string) => {
  electives.value = toggleElective(props.group, electives.value, id);
};
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button
        type="button"
        :aria-label="ariaLabel ?? group.name"
        :class="
          cn(
            'flex min-h-8 w-full items-center justify-between gap-1.5 rounded-md border bg-card px-2.5 py-1 text-left text-[13px] hover:bg-muted',
            invalid && 'border-warning-strong',
          )
        "
      >
        <span :class="cn('min-w-0 truncate', !label && !names.length && 'text-faint')">{{
          label ?? (names.join(', ') || 'Choose…')
        }}</span>
        <ChevronDownIcon class="size-3.5 shrink-0 text-faint" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="flex w-64 flex-col gap-2.5 text-[13px]">
      <p class="flex flex-col">
        <span class="font-semibold">{{ group.name }}</span>
        <span class="text-xs text-muted-foreground">{{ group.rule }}</span>
      </p>
      <label
        v-for="s in group.subjects"
        :key="s.subjectId"
        :class="
          cn(
            'flex items-center gap-2',
            full && !picks.includes(s.subjectId) && 'cursor-default text-faint',
          )
        "
      >
        <Checkbox
          :model-value="picks.includes(s.subjectId)"
          :disabled="full && !picks.includes(s.subjectId)"
          @update:model-value="toggle(s.subjectId)"
        />
        {{ s.name }}
      </label>
      <slot />
    </PopoverContent>
  </Popover>
</template>
