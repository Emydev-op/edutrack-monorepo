<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';

import { useBulkReturnMutation, useSubmissionsQuery } from '@/api/services/assignments';
import { dueLabel, when } from '@/components/assignments/assignment-format';
import SubmissionStatusBadge from '@/components/assignments/SubmissionStatusBadge.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import { SUBMISSION_STATUSES, type SubmissionRow, type SubmissionStatus } from '@/types';

const route = useRoute();
const confirm = useConfirm();
const layout = useLayoutStore();
const { now } = useTermContext();

const id = computed(() => String(route.params.assignmentId ?? ''));
const status = useRouteQuery<string>('status', '');
const page = useRouteQuery<string>('page', '1');
const search = ref('');
const debounced = refDebounced(search, 250);
watch(debounced, () => page.value !== '1' && (page.value = '1'));

const safeStatus = computed(() =>
  (SUBMISSION_STATUSES as readonly string[]).includes(status.value) ? status.value : '',
);
const { data, isPending, error, refetch } = useSubmissionsQuery(id, () => ({
  status: safeStatus.value || undefined,
  search: debounced.value || undefined,
  page: Number(page.value) || 1,
  pageSize: 50,
}));
const bulk = useBulkReturnMutation();
const a = computed(() => data.value?.assignment);
watch(a, (x) => layout.setRecordLabel(x?.title ?? null), { immediate: true });

const rows = computed(() => data.value?.rows ?? []);
const selection = useSelection(rows, (s: SubmissionRow) => s.id);
const canGrade = computed(() => a.value?.permissions.grade ?? false);

const tabs = computed(() =>
  (['', ...SUBMISSION_STATUSES] as const).map((key) => ({
    label: key || 'All',
    to: { query: { ...route.query, status: key || undefined, page: undefined } },
    active: safeStatus.value === key,
    count: key ? data.value?.counts[key as SubmissionStatus] : data.value?.counts.All,
  })),
);

const columns: Column[] = [
  { key: 'student', label: 'Student', width: 'minmax(200px,1.6fr)' },
  { key: 'status', label: 'Status', width: 'minmax(130px,1fr)' },
  { key: 'submittedAt', label: 'Handed in', width: 'minmax(140px,1fr)' },
  { key: 'files', label: 'Files', width: '60px', align: 'right' },
  { key: 'score', label: 'Score', width: '80px', align: 'right' },
];

const subTo = (s: SubmissionRow) => ({
  name: r.assignments.submission.name,
  params: { assignmentId: id.value, submissionId: s.id },
});

async function returnSelected() {
  const picked = selection.selectedRows();
  const ready = picked.filter((s) => s.status === 'Graded');
  const skipped = picked.length - ready.length;
  if (!ready.length) {
    toast.info('Only graded work can be returned. Grade the selected submissions first.');
    return;
  }
  await confirm({
    title: `Return ${ready.length} graded submission${ready.length === 1 ? '' : 's'}?`,
    description:
      'Scores and feedback become visible to each student and their guardian. You can still regrade while the term is on.',
    details: [
      ['Returning', `${ready.length} graded`],
      ...(skipped
        ? ([['Skipped', `${skipped} not graded, excused or already returned`]] as [
            string,
            string,
          ][])
        : []),
    ],
    confirmLabel: `Return ${ready.length}`,
    action: async () => {
      const result = await bulk.mutateAsync({
        assignmentId: id.value,
        ids: picked.map((s) => s.id),
      });
      selection.clear();
      toast.success(
        `Returned ${result.returned}.${result.skipped.length ? ` Skipped ${result.skipped.length}: ${summarise(result.skipped)}.` : ''}`,
      );
    },
  });
}
const summarise = (skipped: { reason: string }[]) => {
  const by = new Map<string, number>();
  for (const s of skipped) by.set(s.reason, (by.get(s.reason) ?? 0) + 1);
  return [...by.entries()].map(([reason, n]) => `${n} ${reason.toLowerCase()}`).join(', ');
};
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="this assignment"
    :reason="getApiErrorMessage(error)"
  />
  <EmptyState
    v-else-if="isNotFound(error)"
    title="Assignment not found"
    description="It may have been deleted, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.assignments.list.name }">Back to assignments</RouterLink></Button
    >
  </EmptyState>
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="Submissions couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>
  <template v-else-if="!a">
    <Skeleton class="h-16 w-full" />
    <Skeleton class="h-80 w-full" />
  </template>
  <template v-else>
    <PageHeader
      :title="`Submissions · ${a.title}`"
      :status="a.status"
      :description="`${a.classLabel} · due ${dueLabel(a.dueAt, now).text} · out of ${a.maxScore ?? '—'}`"
    >
      <template #actions>
        <Button as-child variant="outline">
          <RouterLink :to="{ name: r.assignments.detail.name, params: { assignmentId: a.id } }"
            >Assignment details</RouterLink
          >
        </Button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="a.permissions.lockReason"
      tone="info"
      title="Read-only"
      :description="a.permissions.lockReason"
    />
    <EmptyState
      v-if="a.status === 'Draft'"
      title="No submissions yet"
      description="This assignment is a draft. Publish it to start collecting work."
    >
      <Button as-child
        ><RouterLink :to="{ name: r.assignments.edit.name, params: { assignmentId: a.id } }"
          >Edit and publish</RouterLink
        ></Button
      >
    </EmptyState>
    <template v-else>
      <MetricGrid>
        <MetricCard label="Students" :value="data?.counts.All" />
        <MetricCard
          label="To grade"
          :value="(data?.counts.Submitted ?? 0) + (data?.counts.Late ?? 0)"
          :hint="data?.counts.Late ? `${data.counts.Late} late` : undefined"
          hint-tone="warning"
        />
        <MetricCard label="Not submitted" :value="data?.counts['Not submitted']" />
        <MetricCard
          label="Graded"
          :value="data?.counts.Graded"
          hint="Ready to return"
          hint-tone="neutral"
        />
        <MetricCard label="Returned" :value="data?.counts.Returned" />
      </MetricGrid>

      <TabNav :tabs="tabs" label="Submission status" />

      <DataTable
        :columns="columns"
        :rows="rows"
        :row-key="(s) => s.id"
        :row-label="(s) => s.studentName"
        :loading="isPending"
        :meta="data?.meta"
        :selection="canGrade ? selection : undefined"
        min-width="640px"
        :empty-text="
          debounced
            ? 'No students match your search.'
            : safeStatus
              ? `No submissions are ${safeStatus.toLowerCase()}.`
              : 'No students in this class.'
        "
        @update:page="page = String($event)"
      >
        <template #search><SearchInput v-model="search" placeholder="Search students" /></template>
        <template #bulk>
          <Button size="sm" :disabled="bulk.isPending.value" @click="returnSelected">
            Return graded
          </Button>
          <span class="text-xs text-muted-foreground">Only graded work is returned.</span>
        </template>
        <template #cell-student="{ row }">
          <CellLink :to="subTo(row)" :label="row.studentName" :detail="row.admissionNo" />
        </template>
        <template #cell-status="{ row }">
          <SubmissionStatusBadge :status="row.status" :late="row.late" />
        </template>
        <template #cell-submittedAt="{ row }">
          <span :class="!row.submittedAt && 'text-faint'">{{ when(row.submittedAt) }}</span>
        </template>
        <template #cell-score="{ row }">
          <span v-if="row.score !== null" class="font-medium"
            >{{ row.score }} / {{ a.maxScore }}</span
          >
          <span v-else class="text-faint">—</span>
        </template>
      </DataTable>
    </template>
  </template>
</template>
