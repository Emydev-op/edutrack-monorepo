<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { CalendarPlusIcon, ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useAssessmentsQuery } from '@/api/services/assessments';
import { useMyScopeQuery } from '@/api/services/shell';
import AssessmentStatusBadge from '@/components/assessments/AssessmentStatusBadge.vue';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import type { AssessmentSummary } from '@/types';

const armFilter = useRouteQuery<string>('class', '');
const subjectFilter = useRouteQuery<string>('subject', '');
const { data, isPending, error } = useAssessmentsQuery(() => ({
  class: armFilter.value || undefined,
  subject: subjectFilter.value || undefined,
}));
const { data: scope } = useMyScopeQuery();

const classes = computed(() =>
  (scope.value?.assignments ?? []).map((a) => ({
    key: `${a.armId}|${a.subject}`,
    label: `${a.armName}${scope.value?.multiCampus ? ` (${a.branchName.split(' ')[0]})` : ''} · ${a.subjectName}`,
    armId: a.armId,
    subject: a.subject,
  })),
);
const classKey = computed({
  get: () =>
    armFilter.value && subjectFilter.value ? `${armFilter.value}|${subjectFilter.value}` : '',
  set: (v: string) => {
    const [arm = '', subject = ''] = v.split('|');
    armFilter.value = arm;
    subjectFilter.value = subject;
  },
});
const groups = computed(() => {
  const out = new Map<
    string,
    { title: string; armId: string; subject: string; rows: AssessmentSummary[] }
  >();
  for (const r of data.value?.rows ?? []) {
    const key = `${r.armId}|${r.subject}`;
    const g = out.get(key) ?? {
      title: `${r.arm}${scope.value?.multiCampus ? ` (${r.branchName.split(' ')[0]})` : ''} · ${r.subjectName}`,
      armId: r.armId,
      subject: r.subject,
      rows: [],
    };
    g.rows.push(r);
    out.set(key, g);
  }
  for (const g of out.values()) g.rows.sort((a, b) => a.date.localeCompare(b.date));
  return [...out.values()];
});
const scoredText = (r: AssessmentSummary) =>
  r.status === 'Scheduled'
    ? `${r.students} students`
    : `${r.scored} of ${r.students} scored${r.absent ? ` · ${r.absent} absent` : ''}${r.exempt ? ` · ${r.exempt} exempt` : ''}`;
</script>

<template>
  <PageHeader
    title="Assessments"
    description="When each part of the school’s scheme happens for your classes. Students see the dates in their portal."
  >
    <template v-if="data?.editable" #actions>
      <Button as-child
        ><RouterLink
          :to="{
            name: routesPath.assessments.schedule.name,
            query: armFilter && subjectFilter ? { class: armFilter, subject: subjectFilter } : {},
          }"
          ><CalendarPlusIcon /> Schedule an assessment</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Assessments couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <template v-else>
    <SectionCard
      title="The school’s scheme"
      description="Set by the academic office in School Admin. Read-only here."
    >
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p v-else-if="!data?.schemes.length" class="text-[13px] text-muted-foreground">
        No classes this term.
      </p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <div v-for="s in data.schemes" :key="s.section" class="rounded-md border px-3.5 py-3">
          <p class="text-[13px] font-semibold">
            {{ s.section === 'JSS' ? 'Junior secondary' : 'Senior secondary' }}
            <span class="font-normal text-faint">· grades {{ s.scaleName }}</span>
          </p>
          <ul class="mt-1.5 flex flex-col gap-1 text-[13px]">
            <li v-for="c in s.components" :key="c.key" class="flex justify-between gap-3">
              <span>{{ c.name }}</span>
              <span class="text-muted-foreground tabular-nums"
                >out of {{ c.max }} · {{ c.weight }}% of the total</span
              >
            </li>
          </ul>
        </div>
      </div>
    </SectionCard>

    <div class="flex flex-wrap items-center gap-2">
      <NativeSelect v-model="classKey" aria-label="Class and subject" class="min-w-56">
        <NativeSelectOption value="">All classes</NativeSelectOption>
        <NativeSelectOption v-for="c in classes" :key="c.key" :value="c.key">{{
          c.label
        }}</NativeSelectOption>
      </NativeSelect>
    </div>

    <div v-if="isPending" class="flex flex-col gap-2">
      <Skeleton v-for="i in 3" :key="i" class="h-28 w-full" />
    </div>
    <EmptyState
      v-else-if="!groups.length"
      :title="classKey ? 'Nothing scheduled for this class' : 'Nothing scheduled yet'"
      description="Schedule CA tests and the examination from the school’s scheme so students know when they are."
    />
    <SectionCard v-for="g in groups" :key="g.title" :title="g.title" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li v-for="r in g.rows" :key="r.id">
          <RouterLink
            :to="{ name: routesPath.assessments.detail.name, params: { assessmentId: r.id } }"
            class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-surface-warm max-sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <span class="flex min-w-0 flex-col">
              <span class="font-medium"
                >{{ r.component }}
                <span class="font-normal text-faint">· {{ formatWeekday(r.date) }}</span></span
              >
              <span class="truncate text-xs text-muted-foreground">{{ r.topics }}</span>
            </span>
            <span
              class="text-xs text-muted-foreground tabular-nums max-sm:col-span-2 max-sm:row-start-2"
              >{{ scoredText(r) }}</span
            >
            <span class="flex items-center gap-1.5 max-sm:col-start-2 max-sm:row-start-1">
              <AssessmentStatusBadge :status="r.status" />
              <ChevronRightIcon class="size-4 text-faint" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </template>
</template>
