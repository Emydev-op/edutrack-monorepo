<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import type { SubmissionStatus } from '@/types';

import { SUBMISSION_TONE } from './assignment-format';

/** A submission's status in its one colour (Not submitted · Submitted · Late · Graded · Returned · Excused). */
defineProps<{ status: SubmissionStatus; late?: boolean }>();
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5">
    <StatusBadge :label="status" :tone="SUBMISSION_TONE[status]" />
    <span
      v-if="late && status !== 'Late'"
      class="text-[11px] font-medium text-warning-strong"
      title="Handed in after the due time"
      >Late</span
    >
  </span>
</template>
