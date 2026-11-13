<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ChevronRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useTeachingSubjectsQuery } from '@/api/services/teaching';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';

const { term } = useTermContext();
const { data, isPending, error, refetch } = useTeachingSubjectsQuery();
</script>

<template>
  <PageHeader title="My subjects" :description="term?.label" />
  <EmptyState
    v-if="error"
    title="Your subjects couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>
  <CardGrid v-else-if="isPending" min="280px">
    <Skeleton v-for="i in 2" :key="i" class="h-44 w-full" />
  </CardGrid>
  <EmptyState
    v-else-if="!data?.subjects.length"
    illustrated
    title="No subjects assigned yet"
    description="The academic office assigns classes and subjects to teachers. They appear here as soon as they do."
  />
  <CardGrid v-else min="280px">
    <RouterLink
      v-for="s in data.subjects"
      :key="s.code"
      :to="{ name: routesPath.teaching.subject.name, params: { subject: s.code } }"
      class="group flex min-w-0 flex-col gap-3 rounded-lg border bg-card px-4.5 py-4 hover:border-[#D9D5CD] hover:bg-surface-warm"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[15px] font-semibold text-foreground">{{ s.name }}</span>
          <span class="text-[13px] text-muted-foreground"
            >{{ s.department.name }} · HOD {{ s.department.hod ?? 'none' }}</span
          >
        </div>
        <ChevronRightIcon
          class="mt-0.5 size-4 shrink-0 text-faint group-hover:text-foreground"
          aria-hidden="true"
        />
      </div>
      <ul class="flex flex-wrap gap-1.5">
        <li
          v-for="c in s.classes"
          :key="c.armId"
          class="rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {{ c.armName
          }}<span v-if="data.multiCampus" class="text-faint"> · {{ c.branchShort }}</span>
        </li>
      </ul>
      <dl class="grid grid-cols-3 gap-2 border-t border-divider pt-3 text-[13px]">
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Classes</dt>
          <dd class="font-semibold text-foreground tabular-nums">{{ s.classes.length }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Students</dt>
          <dd class="font-semibold text-foreground tabular-nums">{{ s.students }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-xs text-faint">Periods / week</dt>
          <dd class="font-semibold text-foreground tabular-nums">{{ s.periodsPerWeek }}</dd>
        </div>
      </dl>
    </RouterLink>
  </CardGrid>
</template>
