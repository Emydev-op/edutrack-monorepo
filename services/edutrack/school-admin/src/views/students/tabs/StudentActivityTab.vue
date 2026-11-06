<script setup lang="ts">
import { computed } from 'vue';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';

import type { StudentDetail } from '@/types';

const props = defineProps<{ student: StudentDetail }>();
const items = computed(() => [...props.student.activity, ...props.student.payments].reverse());
</script>

<template>
  <ActivityTimeline title="Full activity" :items="items" />
</template>
