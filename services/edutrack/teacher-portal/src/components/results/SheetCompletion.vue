<script setup lang="ts">
import { computed } from 'vue';

import type { SheetCompletion } from '@/types';

/** Scores entered on a sheet: a bar and "41 of 42 · 1 student missing". */
const props = defineProps<{ completion: SheetCompletion; compact?: boolean }>();
const percent = computed(() =>
  props.completion.total ? Math.round((props.completion.scored / props.completion.total) * 100) : 0,
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <div
      class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-valuenow="percent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${percent}% of scores entered`"
    >
      <span
        class="block h-full rounded-full"
        :class="completion.missing ? 'bg-warning' : 'bg-success'"
        :style="{ width: `${percent}%` }"
      />
    </div>
    <span class="text-xs text-muted-foreground tabular-nums">
      {{ completion.scored }} of {{ completion.total }}
      <template v-if="!compact && completion.missing">
        ·
        <span class="text-warning-strong"
          >{{ completion.missing }} student{{ completion.missing === 1 ? '' : 's' }} missing</span
        >
      </template>
    </span>
  </div>
</template>
