<script setup lang="ts">
import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';

import type { BranchDetail } from '@/types';

defineProps<{ branch: BranchDetail }>();
</script>

<template>
  <ActivityTimeline
    title="Activity"
    :items="branch.history"
    empty-text="Nothing has happened at this branch yet."
  />
</template>
