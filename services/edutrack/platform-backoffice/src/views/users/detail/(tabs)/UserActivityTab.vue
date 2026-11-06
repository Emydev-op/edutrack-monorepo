<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';

import { useUserActivityQuery } from '@/api/services/users';
import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import type { PlatformUser } from '@/types';

const props = defineProps<{ user: PlatformUser }>();
const { data: activity, isPending } = useUserActivityQuery(() => props.user.id);
</script>

<template>
  <Skeleton v-if="isPending" class="h-48" />
  <ActivityTimeline v-else :items="activity ?? []" />
</template>
