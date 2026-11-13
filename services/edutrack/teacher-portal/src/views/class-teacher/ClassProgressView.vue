<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { BellIcon, CheckIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';

import { useClassProgressQuery, useRemindTeacherMutation } from '@/api/services/class-teacher';
import AccessDenied from '@/components/common/AccessDenied.vue';
import SheetCompletion from '@/components/results/SheetCompletion.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDeadline } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { ClassProgressSubject, SheetStatus } from '@/types';

const confirm = useConfirm();
const { data, isPending, error, refetch } = useClassProgressQuery();
const remind = useRemindTeacherMutation();
const filter = useRouteQuery<'all' | 'waiting' | 'done'>('show', 'all');

const WAITING: SheetStatus[] = ['Not started', 'Draft', 'Returned'];
const DONE: SheetStatus[] = ['Submitted', 'Under review', 'Approved', 'Published'];
const shown = computed(() =>
  (data.value?.subjects ?? []).filter((s) =>
    filter.value === 'waiting'
      ? WAITING.includes(s.status)
      : filter.value === 'done'
        ? DONE.includes(s.status)
        : true,
  ),
);
const waitingCount = computed(
  () => (data.value?.subjects ?? []).filter((s) => WAITING.includes(s.status)).length,
);
const submittedCount = computed(
  () => (data.value?.subjects ?? []).filter((s) => DONE.includes(s.status)).length,
);

function sendReminder(s: ClassProgressSubject) {
  const d = data.value!;
  void confirm({
    title: `Remind ${s.teacherName}?`,
    description: `An in-app notification about ${d.arm} · ${s.subjectName}. You can remind each teacher once a day.`,
    details: [
      [
        'Sheet',
        `${s.status}${s.completion.missing ? ` · ${s.completion.missing} student${s.completion.missing === 1 ? '' : 's'} missing scores` : ''}`,
      ],
      ['Deadline', d.deadline ? formatDeadline(d.deadline) : '—'],
      ['Notifies', s.teacherName],
    ],
    confirmLabel: 'Send reminder',
    action: async () => {
      try {
        await remind.mutateAsync(s.sheetId);
      } catch (e) {
        void refetch();
        throw e;
      }
      toast.success(`Reminder sent to ${s.teacherName}.`);
    },
  });
}

const remindedLabel = (at: string) => `Reminded today ${at.slice(11, 16)}`;
</script>

<template>
  <PageHeader
    :title="data ? `Class progress · ${data.arm}` : 'Class progress'"
    :description="
      data?.deadline
        ? `Every subject’s result sheet for your class. Result entry closes ${formatDeadline(data.deadline)}.`
        : 'Every subject’s result sheet for your class.'
    "
  />
  <AccessDenied v-if="isForbidden(error)" what="My class" :reason="getApiErrorMessage(error)" />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Class progress couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton class="h-20 w-full" />
    <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !data.subjects.length"
    title="No subjects yet"
    description="Sheets appear here once the academic office assigns teachers to your class."
  />
  <template v-else-if="data">
    <MetricGrid>
      <MetricCard
        label="Submitted"
        :value="`${submittedCount} of ${data.subjects.length}`"
        hint="Sent for review or beyond"
      />
      <MetricCard
        label="Not started"
        :value="data.summary['Not started']"
        :hint-tone="data.summary['Not started'] ? 'warning' : 'success'"
        hint="No scores yet"
      />
      <MetricCard label="Draft" :value="data.summary.Draft" hint="Being entered" />
      <MetricCard
        label="Returned"
        :value="data.summary.Returned"
        :hint-tone="data.summary.Returned ? 'error' : 'neutral'"
        hint="Sent back to the teacher"
      />
      <MetricCard
        label="With reviewers"
        :value="data.summary.Submitted + data.summary['Under review']"
        hint="HOD or academic office"
      />
      <MetricCard
        label="Approved"
        :value="data.summary.Approved + data.summary.Published"
        :hint="
          data.summary.Published ? `${data.summary.Published} published` : 'Ready for report cards'
        "
        hint-tone="success"
      />
    </MetricGrid>

    <SegmentedControl
      v-model="filter"
      label="Show"
      :options="[
        { value: 'all', label: `All · ${data.subjects.length}` },
        { value: 'waiting', label: `Not submitted · ${waitingCount}` },
        { value: 'done', label: `Submitted · ${submittedCount}` },
      ]"
    />

    <p
      v-if="!shown.length"
      class="rounded-lg border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground"
    >
      Nothing here.
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="s in shown"
        :key="s.sheetId"
        class="grid grid-cols-[minmax(0,1.6fr)_minmax(130px,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 max-md:grid-cols-[minmax(0,1fr)_auto]"
      >
        <span class="flex min-w-0 flex-col gap-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ s.subjectName }}</span>
            <SheetStatusBadge :status="s.status" :with-hod="s.withHod" />
          </span>
          <span class="text-xs text-muted-foreground"
            >{{ s.isMine ? 'You' : s.teacherName
            }}<template v-if="s.average !== null"> · average {{ s.average }}%</template></span
          >
        </span>
        <SheetCompletion :completion="s.completion" class="max-md:col-span-2 max-md:row-start-2" />
        <span class="flex justify-end max-md:col-start-2 max-md:row-start-1">
          <Button v-if="s.isMine" as-child variant="outline" size="sm"
            ><RouterLink :to="{ name: r.results.sheet.name, params: { sheetId: s.sheetId } }"
              >Your sheet</RouterLink
            ></Button
          >
          <span
            v-else-if="s.remindedAt"
            class="flex items-center gap-1 text-xs whitespace-nowrap text-success-strong"
            ><CheckIcon class="size-3.5" /> {{ remindedLabel(s.remindedAt) }}</span
          >
          <Button
            v-else-if="s.canRemind"
            variant="outline"
            size="sm"
            :disabled="remind.isPending.value"
            @click="sendReminder(s)"
            ><BellIcon class="size-4" /> Remind teacher</Button
          >
        </span>
      </li>
    </ul>
  </template>
</template>
