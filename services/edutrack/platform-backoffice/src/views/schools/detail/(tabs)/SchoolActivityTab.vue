<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import { useSchoolActivityQuery } from '@/api/services/schools';
import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import type { School } from '@/types';

const props = defineProps<{ school: School }>();
const { data: activity, isPending } = useSchoolActivityQuery(() => props.school.id);
</script>

<template>
  <Skeleton v-if="isPending" class="h-48" />
  <ActivityTimeline v-else :items="activity ?? []" />
</template>
