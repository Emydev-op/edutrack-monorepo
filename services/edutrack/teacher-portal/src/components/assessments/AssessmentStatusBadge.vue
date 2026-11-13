<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import type { AssessmentStatus } from '@/types';

/** Scheduled (still to come) · Done (taken, scores to enter) · Scored (every student entered). */
defineProps<{ status: AssessmentStatus }>();
const TONES = { Scheduled: 'info', Done: 'warning', Scored: 'success' } as const;
</script>

<template>
  <StatusBadge :label="status" :tone="TONES[status]" />
</template>
