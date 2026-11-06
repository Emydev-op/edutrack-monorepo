<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ArrowRightLeftIcon, EyeIcon, MessageSquareIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAdmissionOptionsQuery,
  useAssignArmMutation,
  useStudentsQuery,
} from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import type { StudentRow } from '@/types';

import { tone } from './student-tones';

const router = useRouter();
const confirm = useConfirm();
const auth = useAuthStore();
const context = useContextStore();
const assignArm = useAssignArmMutation();
const { data: options } = useAdmissionOptionsQuery();

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '10');
const search = ref('');
const debounced = refDebounced(search, 300);
const status = ref('');
const className = ref('');
const gender = ref('');
watch([debounced, status, className, gender], () => (page.value = '1'));

const { data, isPending } = useStudentsQuery(() => ({
  search: debounced.value,
  status: status.value || undefined,
  className: className.value || undefined,
  gender: gender.value || undefined,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const rows = computed(() => data.value?.data ?? []);
const selection = useSelection(rows, (s) => s.id);
const filtered = computed(() => [debounced, status, className, gender].some((f) => !!f.value));
const classOptions = computed(() => Object.keys(options.value?.arms ?? {}));

const studentLink = (s: StudentRow) => ({
  name: routesPath.students.detail.name,
  params: { id: s.id },
});
const actions = (s: StudentRow): RowAction[] => [
  { label: 'View student', icon: EyeIcon, to: studentLink(s) },
  {
    label: 'Message guardian',
    icon: MessageSquareIcon,
    to: { name: routesPath.communication.announcements.name },
  },
  ...(['Active', 'Incomplete profile'].includes(s.status)
    ? [
        {
          label: 'Transfer or withdraw',
          icon: ArrowRightLeftIcon,
          to: { name: routesPath.students.transfer.name, params: { id: s.id } },
        },
      ]
    : []),
];

/** Bulk "Assign arm" works within one class level. */
function moveArm() {
  const picked = selection.selectedRows();
  const levels = new Set(picked.map((s) => s.className.replace(/[A-Z]$/, '').trim()));
  if (levels.size !== 1 || picked.some((s) => !s.className))
    return void toast.error('Choose students from one class level to move them to another arm.');
  const level = [...levels][0]!;
  const arms = options.value?.arms[level] ?? [];
  void confirm({
    title: `Move ${picked.length} student${picked.length > 1 ? 's' : ''} to another ${level} arm?`,
    details: [
      [
        'Affects',
        `${picked.length} current enrollment${picked.length > 1 ? 's' : ''} · ${context.current.session}`,
      ],
      [
        'What happens',
        'Their arm changes from today. The previous arm stays in each student’s enrollment history.',
      ],
      ['Reversible', 'Yes, by moving them back. Each change is logged.'],
      ['Authorised by', `${auth.fullName} · students.edit · School scope`],
    ],
    options: arms.map((a) => ({
      value: a.arm,
      label: `${level}${a.arm}`,
      description: `${a.used} of ${a.capacity} places used${a.used >= a.capacity ? ' · full' : ''}`,
    })),
    confirmLabel: 'Move students',
    action: async ({ option }) => {
      const { moved } = await assignArm.mutateAsync({
        studentIds: picked.map((s) => s.id),
        arm: option,
      });
      toast.success(`${moved} student${moved === 1 ? '' : 's'} moved to ${level}${option}.`);
      selection.clear();
    },
  });
}

function exportRows(list: StudentRow[], name: string) {
  downloadCsv(
    name,
    ['Name', 'Admission no.', 'Class', 'Gender', 'Guardian', 'Balance', 'Status'],
    list.map((s) => [
      s.name,
      s.admissionNo,
      s.className,
      s.gender,
      s.guardianName ?? '',
      s.balance,
      s.status,
    ]),
  );
  toast.success(`Exported ${list.length} student${list.length === 1 ? '' : 's'}.`);
}

const columns: Column[] = [
  { key: 'name', label: 'Student', width: 'minmax(200px,1.6fr)' },
  {
    key: 'className',
    label: `Enrollment · ${context.current.session}`,
    width: 'minmax(150px,1fr)',
  },
  { key: 'gender', label: 'Gender', width: '80px' },
  { key: 'guardianName', label: 'Guardian', width: 'minmax(170px,1.4fr)' },
  { key: 'balance', label: 'Balance', align: 'right', width: '110px' },
  { key: 'status', label: 'Status', width: '150px' },
];
</script>

<template>
  <PageHeader
    title="Students"
    :description="`${context.current.session} · ${context.current.term} · ${context.current.branch}${data ? ` · ${data.meta.total} students` : ''}`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.import.name }"
          >Import students</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: routesPath.students.admit.name }"
          >Admit student</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(s) => s.id"
    :row-label="(s) => s.name"
    :actions="actions"
    :selection="selection"
    :loading="isPending"
    :meta="data?.meta"
    min-width="1000px"
    :empty-text="
      filtered
        ? 'No students match your filters. Try clearing a filter.'
        : 'No students yet. Admit a student or import a class list.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search name, admission number or guardian"
    /></template>
    <template #filters>
      <FilterMenu v-model="className" label="Class" :options="classOptions" />
      <FilterMenu v-model="gender" label="Gender" :options="['Female', 'Male']" />
      <FilterMenu
        v-model="status"
        label="Status"
        :options="['Active', 'Incomplete profile', 'Transferred', 'Withdrawn']"
      />
    </template>
    <template #toolbar>
      <Button
        variant="outline"
        class="h-9"
        :disabled="!rows.length"
        @click="exportRows(rows, `students-${context.current.session.replace('/', '-')}.csv`)"
        >Export</Button
      >
    </template>
    <template #bulk>
      <Button size="sm" variant="outline" @click="moveArm">Assign arm</Button>
      <Button
        size="sm"
        variant="outline"
        @click="router.push({ name: routesPath.academics.promotion.name })"
        >Promote</Button
      >
      <Button
        size="sm"
        variant="outline"
        @click="router.push({ name: routesPath.communication.announcements.name })"
        >Message guardians</Button
      >
      <Button
        size="sm"
        variant="outline"
        @click="exportRows(selection.selectedRows(), 'selected-students.csv')"
        >Export</Button
      >
    </template>
    <template #cell-name="{ row }">
      <CellLink :to="studentLink(row)" :label="row.name" />
      <span class="text-xs text-faint"
        >{{ row.admissionNo }}{{ row.admittedToday ? ' · admitted today' : '' }}</span
      >
    </template>
    <template #cell-className="{ row }">
      <span v-if="row.awaitingEnrollment" class="text-warning-strong">Awaiting arm</span>
      <template v-else>{{ row.className }}</template>
    </template>
    <template #cell-guardianName="{ row }">
      <span :class="!row.guardianName && 'text-error-strong'">{{
        row.guardianName ?? 'No guardian linked'
      }}</span>
    </template>
    <template #cell-balance="{ row }">
      <span :class="!row.balance && 'text-faint'">{{ formatNaira(row.balance) }}</span>
    </template>
    <template #cell-status="{ row }"
      ><StatusBadge :label="row.status" :tone="tone(row.status)"
    /></template>
  </DataTable>
</template>
