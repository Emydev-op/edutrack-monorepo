<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';

import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useTeachingClassesQuery } from '@/api/services/teaching';
import ClassCard from '@/components/teaching/ClassCard.vue';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';

const { term } = useTermContext();
const { data, isPending, error, refetch } = useTeachingClassesQuery();

const description = computed(() => {
  const list = data.value?.classes ?? [];
  if (!list.length) return term.value?.label ?? '';
  const students = list.reduce((sum, c) => sum + c.students, 0);
  const periods = list.reduce((sum, c) => sum + c.periodsPerWeek, 0);
  return `${term.value?.label} · ${list.length} class${list.length === 1 ? '' : 'es'} · ${periods} periods a week · ${students} student places`;
});
</script>

<template>
  <PageHeader title="My classes" :description="description" />
  <EmptyState
    v-if="error"
    title="Your classes couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>
  <CardGrid v-else-if="isPending" min="260px">
    <Skeleton v-for="i in 4" :key="i" class="h-40 w-full" />
  </CardGrid>
  <EmptyState
    v-else-if="!data?.classes.length"
    illustrated
    title="No classes assigned yet"
    :description="
      data?.readOnly
        ? `You had no classes in ${term?.label ?? 'this term'}.`
        : 'The academic office assigns classes and subjects to teachers. Your classes appear here as soon as they do; speak to them if you expected some.'
    "
  />
  <CardGrid v-else min="260px">
    <ClassCard v-for="c in data.classes" :key="c.id" :item="c" :show-campus="data.multiCampus" />
  </CardGrid>
</template>
