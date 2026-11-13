<script setup lang="ts">
import { cn } from '@edutrack/ui/lib/utils';

import type { AttendanceMark } from '@/types';

import { MARK_SELECTED, MARKS } from './attendance';

/** Present / Absent / Late / Excused as four big tap targets (a radio group). */
defineProps<{ label: string; disabled?: boolean; invalid?: boolean }>();
const model = defineModel<AttendanceMark | null>({ required: true });
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    class="grid grid-cols-4 gap-1.5"
  >
    <button
      v-for="m in MARKS"
      :key="m"
      type="button"
      role="radio"
      :aria-checked="model === m"
      :aria-label="`${m}`"
      :disabled="disabled"
      :class="
        cn(
          'h-10 min-w-0 rounded-md border px-1 text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
          model === m ? MARK_SELECTED[m] : 'bg-card text-muted-foreground hover:bg-muted',
          invalid && model !== m && 'border-error',
          disabled && model !== m && 'opacity-60',
        )
      "
      @click="model = m"
    >
      <span class="sm:hidden">{{ m === 'Excused' ? 'Exc.' : m }}</span>
      <span class="max-sm:hidden">{{ m }}</span>
    </button>
  </div>
</template>
