<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { cn } from '@edutrack/ui/lib/utils';
import { HeartPulseIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';

import type { BoarderOption } from './boarding-format';

/** How many matches to list before asking for a narrower search. */
const SHOWN = 25;

const props = defineProps<{
  options: BoarderOption[];
  label?: string;
  error?: string;
  loading?: boolean;
  /** Shown when there is nobody to pick. */
  emptyText?: string;
  /** Shows the picked student's medical notes (sick bay). */
  showMedical?: boolean;
}>();
const studentId = defineModel<string>({ required: true });
/** The search text, for callers that search the API as well. */
const search = defineModel<string>('search', { default: '' });

const picked = computed(() => props.options.find((o) => o.studentId === studentId.value));
const matches = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.options.filter(
    (o) =>
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.admissionNo.toLowerCase().includes(q) ||
      o.className.toLowerCase().includes(q),
  );
});
const open = ref(false);
const sub = (o: BoarderOption) => [o.admissionNo, o.className, o.place].filter(Boolean).join(' · ');
</script>

<template>
  <fieldset class="flex flex-col gap-1.5">
    <legend class="mb-1.5 text-sm font-medium">{{ label ?? 'Student' }}</legend>
    <div v-if="picked && !open" class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <span class="flex min-w-0 flex-col text-[13px]">
          <span class="truncate font-medium">{{ picked.name }}</span>
          <span class="truncate text-xs text-muted-foreground">{{ sub(picked) }}</span>
        </span>
        <Button type="button" variant="outline" size="sm" @click="open = true">Change</Button>
      </div>
      <p
        v-if="showMedical && picked.medicalNotes.trim()"
        class="flex items-start gap-1.5 rounded-md bg-error-subtle px-2.5 py-1.5 text-xs text-error-strong"
      >
        <HeartPulseIcon class="mt-px size-3.5 shrink-0" />
        <span><span class="font-medium">Medical:</span> {{ picked.medicalNotes }}</span>
      </p>
    </div>
    <template v-else>
      <SearchInput v-model="search" placeholder="Search by name, class or admission no." />
      <p v-if="loading" class="text-xs text-faint">Loading students…</p>
      <p v-else-if="!options.length" class="text-xs text-faint">
        {{ emptyText ?? 'No students to choose from.' }}
      </p>
      <p v-else-if="!matches.length" class="text-xs text-faint">
        No students match “{{ search }}”.
      </p>
      <div
        v-else
        role="listbox"
        :aria-label="label ?? 'Student'"
        class="flex max-h-60 flex-col divide-y divide-divider overflow-y-auto rounded-md border"
      >
        <button
          v-for="o in matches.slice(0, SHOWN)"
          :key="o.studentId"
          type="button"
          role="option"
          :aria-selected="o.studentId === studentId"
          :class="
            cn(
              'flex min-h-11 flex-col items-start px-3 py-2 text-left text-[13px] hover:bg-muted',
              o.studentId === studentId && 'bg-brand-subtle',
            )
          "
          @click="((studentId = o.studentId), (open = false))"
        >
          <span class="font-medium">{{ o.name }}</span>
          <span class="text-xs text-muted-foreground">{{ sub(o) }}</span>
        </button>
        <p v-if="matches.length > SHOWN" class="px-3 py-2 text-xs text-faint">
          {{ matches.length - SHOWN }} more: search to narrow the list.
        </p>
      </div>
    </template>
    <span v-if="error" role="alert" class="text-xs text-error-strong">{{ error }}</span>
  </fieldset>
</template>
