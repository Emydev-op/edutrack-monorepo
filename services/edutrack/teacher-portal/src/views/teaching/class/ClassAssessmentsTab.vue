<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { CalendarPlusIcon, ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useAssessmentsQuery } from '@/api/services/assessments';
import AssessmentStatusBadge from '@/components/assessments/AssessmentStatusBadge.vue';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { AssessmentSummary, TeachingClassDetail } from '@/types';

/**
 * The class page's Assessments tab: the school's scheme for this class's section, each component
 * with its scheduled date (or a link to schedule it) and how many students are scored.
 */
const props = defineProps<{ detail: TeachingClassDetail }>();
const c = computed(() => props.detail.class);
const { data, isPending, error, refetch } = useAssessmentsQuery(() => ({
  class: c.value.armId,
  subject: c.value.subject,
}));

const scheme = computed(() => data.value?.schemes.find((s) => s.section === c.value.section));
const rows = computed(() =>
  (scheme.value?.components ?? []).map((comp) => ({
    comp,
    scheduled: data.value?.rows.find((x) => x.componentKey === comp.key) ?? null,
  })),
);
const scoredText = (x: AssessmentSummary) =>
  x.status === 'Scheduled'
    ? `${x.students} students`
    : `${x.scored} of ${x.students} scored${x.absent ? ` · ${x.absent} absent` : ''}${x.exempt ? ` · ${x.exempt} exempt` : ''}`;
</script>

<template>
  <InlineNotice
    v-if="error"
    tone="error"
    title="Assessments couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action>
      <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
    </template>
  </InlineNotice>
  <Skeleton v-else-if="isPending" class="h-40 w-full" />
  <SectionCard
    v-else
    title="Assessments"
    :description="
      scheme
        ? `The school’s ${c.section} scheme (grades ${scheme.scaleName}). Weights are set by the academic office.`
        : undefined
    "
    flush
  >
    <p v-if="!rows.length" class="px-4 py-5 text-[13px] text-muted-foreground">
      The school hasn’t set an assessment scheme for {{ c.section }} yet.
    </p>
    <ul v-else class="flex flex-col divide-y divide-divider">
      <li
        v-for="{ comp, scheduled } in rows"
        :key="comp.key"
        class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]"
      >
        <span class="flex min-w-0 flex-col">
          <span class="font-medium"
            >{{ comp.name }}
            <span class="font-normal text-faint"
              >· out of {{ comp.max }} · {{ comp.weight }}%</span
            ></span
          >
          <span v-if="scheduled" class="truncate text-xs text-muted-foreground"
            >{{ formatWeekday(scheduled.date) }} · {{ scoredText(scheduled) }}</span
          >
          <span v-else class="text-xs text-faint">Not scheduled</span>
        </span>
        <RouterLink
          v-if="scheduled"
          :to="{ name: r.assessments.detail.name, params: { assessmentId: scheduled.id } }"
          class="flex items-center gap-1.5"
          :aria-label="`Open ${comp.name}`"
        >
          <AssessmentStatusBadge :status="scheduled.status" />
          <ChevronRightIcon class="size-4 text-faint" aria-hidden="true" />
        </RouterLink>
        <Button v-else-if="data?.editable" as-child variant="outline" size="sm"
          ><RouterLink
            :to="{
              name: r.assessments.schedule.name,
              query: { class: c.armId, subject: c.subject, component: comp.key },
            }"
            ><CalendarPlusIcon /> Schedule</RouterLink
          ></Button
        >
        <Button v-else variant="outline" size="sm" disabled :title="detail.lockReason ?? undefined"
          ><CalendarPlusIcon /> Schedule</Button
        >
      </li>
    </ul>
  </SectionCard>
</template>
