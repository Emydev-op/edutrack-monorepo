<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, watch } from 'vue';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useAssignmentsQuery } from '@/api/services/assignments';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import type { AssignmentList } from '@/types';

import { ASSIGNMENT_TONE, dueLabel } from './assignment-format';

/**
 * My assignments for the selected term as a table: title, class · subject, due, submitted /
 * class size, to grade, status. Used by the Assignments page and the class page's Assignments
 * tab (`<AssignmentsTable arm-id="mc-jss2b" subject="MTH" />`, which hides the class column).
 */
const props = withDefaults(
  defineProps<{
    armId?: string;
    subject?: string;
    /** Draft, Published, Closed or "To grade". */
    status?: string;
    search?: string;
    title?: string;
    description?: string;
    emptyText?: string;
  }>(),
  { emptyText: undefined },
);
const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 10 });
const emit = defineEmits<{ loaded: [list: AssignmentList] }>();

const { now } = useTermContext();
const { data, isPending, error, refetch } = useAssignmentsQuery(() => ({
  class: props.armId,
  subject: props.subject,
  status: props.status,
  search: props.search,
  page: page.value,
  pageSize: pageSize.value,
}));

const oneClass = computed(() => Boolean(props.armId && props.subject));
const columns = computed<Column[]>(() => [
  { key: 'title', label: 'Assignment', width: 'minmax(220px,2fr)' },
  ...(oneClass.value
    ? []
    : [{ key: 'classLabel', label: 'Class · subject', width: 'minmax(170px,1.2fr)' }]),
  { key: 'due', label: 'Due', width: 'minmax(140px,1fr)' },
  { key: 'submitted', label: 'Submitted', width: '96px', align: 'right' as const },
  { key: 'toGrade', label: 'To grade', width: '84px', align: 'right' as const },
  { key: 'status', label: 'Status', width: '110px' },
]);

const empty = computed(() => {
  if (props.emptyText) return props.emptyText;
  if (props.search) return 'No assignments match your search.';
  if (props.status) return `No ${props.status.toLowerCase()} assignments.`;
  return 'No assignments yet. Create one to set work for a class.';
});

defineExpose({ data, refetch });
// Lets the parent show counts (tabs, metrics) without a second request.
watch(data, (d) => d && emit('loaded', d), { immediate: true });
watch(pageSize, () => page.value !== 1 && (page.value = 1));
</script>

<template>
  <AccessDenied
    v-if="isForbidden(error)"
    what="these assignments"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
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
    :description="description"
    :columns="columns"
    :rows="data?.data ?? []"
    :row-key="(r) => r.id"
    :row-label="(r) => r.title"
    :loading="isPending"
    :meta="data?.meta"
    :empty-text="empty"
    min-width="720px"
    @update:page="page = $event"
    @update:page-size="pageSize = $event"
  >
    <template v-if="$slots.search" #search><slot name="search" /></template>
    <template v-if="$slots.filters" #filters><slot name="filters" /></template>
    <template v-if="$slots.toolbar" #toolbar><slot name="toolbar" /></template>
    <template #cell-title="{ row }">
      <CellLink
        :to="{ name: routesPath.assignments.detail.name, params: { assignmentId: row.id } }"
        :label="row.title"
      />
      <span v-if="row.allowLate && row.status !== 'Draft'" class="text-[11px] text-faint"
        >Late work allowed</span
      >
    </template>
    <template #cell-due="{ row }">
      <span>{{ dueLabel(row.dueAt, now).text }}</span>
      <span
        v-if="row.status !== 'Draft' && row.dueAt"
        class="text-[11px]"
        :class="row.dueSoon ? 'font-medium text-warning-strong' : 'text-faint'"
        >{{ dueLabel(row.dueAt, now).hint }}</span
      >
    </template>
    <template #cell-submitted="{ row }">
      <span v-if="row.status === 'Draft'" class="text-faint">—</span>
      <span v-else>{{ row.submitted }} / {{ row.students }}</span>
    </template>
    <template #cell-toGrade="{ row }">
      <span v-if="row.toGrade" class="font-semibold text-warning-strong">{{ row.toGrade }}</span>
      <span v-else class="text-faint">0</span>
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" :tone="ASSIGNMENT_TONE[row.status]" />
    </template>
  </DataTable>
</template>
