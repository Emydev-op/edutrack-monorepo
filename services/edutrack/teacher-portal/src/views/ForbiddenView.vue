<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AccessDenied from '@/components/common/AccessDenied.vue';
import type { NavRequirement } from '@/config/navigation';

/** Where the role guards send teachers who open a page their roles don't unlock. */
const route = useRoute();
const what = computed(() => String(route.query.what ?? 'this page'));
const REASONS: Record<NavRequirement, string> = {
  classTeacher:
    'My class is for class teachers, and you aren’t the class teacher of an arm this term.',
  reviewer: 'Reviews are for heads of department and the Academic Head.',
  sheetReviewer: 'Result sheet reviews are for heads of department.',
  noteReviewer: 'Lesson note reviews are for heads of department and the Academic Head.',
};
const reason = computed(() => REASONS[route.query.need as NavRequirement] as string | undefined);
</script>

<template>
  <AccessDenied :what="what" :reason="reason" />
</template>
