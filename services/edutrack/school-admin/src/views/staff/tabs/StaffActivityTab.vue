<script setup lang="ts">
import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';

import type { StaffDetail } from '@/types';

defineProps<{ staff: StaffDetail }>();
</script>

<template>
  <ActivityTimeline
    title="Activity"
    :items="staff.history"
    empty-text="No changes recorded for this staff member yet."
  />
</template>
