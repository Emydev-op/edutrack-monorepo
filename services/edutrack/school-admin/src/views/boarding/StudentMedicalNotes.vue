<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useStudentQuery } from '@/api/services/students';

/** A student’s medical notes (allergies, conditions) from their record, for the nurse. */
const props = defineProps<{ studentId: string }>();
const { data, isPending, isError } = useStudentQuery(() => props.studentId);
</script>

<template>
  <Skeleton v-if="isPending" class="h-12" />
  <InlineNotice
    v-else-if="!isError && data?.medicalNotes"
    tone="warning"
    title="Medical notes"
    :description="data.medicalNotes"
  />
  <p v-else-if="!isError && data" class="text-xs text-muted-foreground">
    {{
      data.medicalNotes === null
        ? 'You can’t see this student’s medical notes.'
        : 'No medical notes on their record.'
    }}
  </p>
</template>
