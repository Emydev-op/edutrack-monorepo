<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import type { LessonNoteSlotStatus } from '@/types';

import { NOTE_TONES } from './note-status';

/** A lesson note's status; `overdue` adds an Overdue badge beside it. */
defineProps<{ status: LessonNoteSlotStatus; overdue?: boolean }>();
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5">
    <StatusBadge :label="status" :tone="NOTE_TONES[status]" />
    <StatusBadge v-if="overdue" label="Overdue" tone="error" />
  </span>
</template>
