<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useStudentAssignmentsQuery } from '@/api/services/assignments';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';

import { ASSIGNMENT_TONE, dueLabel } from './assignment-format';
import SubmissionStatusBadge from './SubmissionStatusBadge.vue';

/**
 * One student's assignments from me in the selected term, with their submission status and
 * score. For the student page: `<StudentAssignmentsTable :student-id="studentId" />`.
 */
const props = defineProps<{ studentId: string; title?: string }>();
const { now } = useTermContext();
const { data, isPending, error, refetch } = useStudentAssignmentsQuery(() => props.studentId);

const columns: Column[] = [
  { key: 'title', label: 'Assignment', width: 'minmax(200px,1.8fr)' },
  { key: 'due', label: 'Due', width: 'minmax(130px,1fr)' },
  { key: 'status', label: 'Submission', width: 'minmax(120px,1fr)' },
  { key: 'score', label: 'Score', width: '80px', align: 'right' },
];
</script>

<template>
  <InlineNotice
    v-if="error"
    tone="error"
    title="Assignments couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action>
      <button type="button" class="text-[13px] font-medium underline" @click="refetch()">
        Try again
      </button>
    </template>
  </InlineNotice>
  <DataTable
    v-else
    :title="title"
    :columns="columns"
    :rows="data ?? []"
    :row-key="(x) => x.assignmentId"
    :row-label="(x) => x.title"
    :loading="isPending"
    min-width="560px"
    empty-text="No assignments for this student in your subjects this term."
  >
    <template #cell-title="{ row }">
      <CellLink
        :to="
          row.submissionId
            ? {
                name: r.assignments.submission.name,
                params: { assignmentId: row.assignmentId, submissionId: row.submissionId },
              }
            : { name: r.assignments.detail.name, params: { assignmentId: row.assignmentId } }
        "
        :label="row.title"
        :detail="row.classLabel"
      />
    </template>
    <template #cell-due="{ row }">
      <span>{{ dueLabel(row.dueAt, now).text }}</span>
      <StatusBadge
        v-if="row.assignmentStatus === 'Closed'"
        label="Closed"
        :tone="ASSIGNMENT_TONE.Closed"
        :dot="false"
      />
    </template>
    <template #cell-status="{ row }"><SubmissionStatusBadge :status="row.status" /></template>
    <template #cell-score="{ row }">
      <span v-if="row.score !== null">{{ row.score }} / {{ row.maxScore }}</span>
      <span v-else class="text-faint">—</span>
    </template>
  </DataTable>
</template>
