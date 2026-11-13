<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';

import { useAssessmentQuery } from '@/api/services/assessments';
import AssessmentStatusBadge from '@/components/assessments/AssessmentStatusBadge.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.assessmentId));
const { data: a, isPending, error } = useAssessmentQuery(id);
watch(a, (x) => layout.setRecordLabel(x ? `${x.component} · ${x.arm}` : null), { immediate: true });
</script>

<template>
  <Skeleton v-if="isPending" class="h-80 w-full" />
  <AccessDenied
    v-else-if="isForbidden(error)"
    what="that assessment"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    :title="isNotFound(error) ? 'This assessment wasn’t found' : 'This assessment couldn’t load'"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <template v-else-if="a">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-2xl leading-tight font-semibold">
            {{ a.component }} · {{ a.arm }} · {{ a.subjectName }}
          </h1>
          <AssessmentStatusBadge :status="a.status" />
        </div>
        <p class="text-[13px] text-muted-foreground">
          {{ formatWeekday(a.date, { long: true }) }} · {{ a.branchName }} · out of {{ a.max }} ·
          {{ a.weight }}% of the total
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button v-if="a.canReschedule" as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.assessments.schedule.name, query: { id: a.id } }"
            >Reschedule</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink
            :to="{
              name: routesPath.results.sheet.name,
              params: { sheetId: a.sheetId },
              query: { focus: a.componentKey },
            }"
            >Open the score sheet · {{ a.component }}</RouterLink
          ></Button
        >
      </div>
    </header>

    <MetricGrid>
      <MetricCard label="Students" :value="a.students" />
      <MetricCard
        label="Scored"
        :value="a.scored"
        :hint="
          a.status === 'Scheduled'
            ? 'Not taken yet'
            : a.missing
              ? `${a.missing} still blank`
              : 'Everyone entered'
        "
        :hint-tone="
          a.status !== 'Scheduled' && a.missing ? 'warning' : a.missing ? 'neutral' : 'success'
        "
      />
      <MetricCard label="Absent (ABS)" :value="a.absent" />
      <MetricCard label="Exempt (EXM)" :value="a.exempt" />
    </MetricGrid>

    <KeyValueCard
      title="Details"
      :rows="[
        { label: 'Date', value: formatWeekday(a.date, { long: true }) },
        { label: 'Topics', value: a.topics },
        { label: 'Instructions', value: a.instructions || 'None' },
        { label: 'Students see it', value: 'In their portal, with these topics and instructions' },
      ]"
    />
    <ActivityTimeline title="History" :items="a.history" />
  </template>
</template>
