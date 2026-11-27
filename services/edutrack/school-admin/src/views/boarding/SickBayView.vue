<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { messageOf } from '@edutrack/web-core/http';
import { PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useDischargeMutation, useSickBayQuery } from '@/api/services/boarding-house';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';
import type { SickBayVisit } from '@/types';

import { OUTCOME_TONE } from './house-format';
import SickVisitDialog from './SickVisitDialog.vue';

/** The sick bay: who is in it now (discharge them) and recent visits. */
const confirm = useConfirm();
const can = useCan();
const days = useRouteQuery<string>('days', '14');
const { data, isPending, isError, refetch } = useSickBayQuery(() => ({ days: Number(days.value) }));
const discharge = useDischargeMutation();

const recordOpen = ref(false);
const inBay = computed(() => data.value?.inSickBay ?? []);
const visits = computed(() => data.value?.visits ?? []);

function dischargeVisit(v: SickBayVisit) {
  void confirm({
    title: `Discharge ${v.student.name}?`,
    description: 'They go back to class and their hostel. Their parents are told.',
    details: [
      ['Seen', v.seen],
      ['Complaint', v.complaint],
    ],
    input: { label: 'Note', placeholder: 'Optional, e.g. Fever down, continue medication' },
    confirmLabel: 'Discharge',
    action: async ({ text }) => {
      const r = await discharge.mutateAsync({ id: v.id, note: text.trim() || undefined });
      toast.success(messageOf(r, `${v.student.name} discharged from the sick bay.`));
    },
  });
}

const studentLink = (v: SickBayVisit) => ({
  name: routesPath.students.detail.name,
  params: { id: v.student.id },
});

const columns: Column[] = [
  { key: 'student', label: 'Student', width: 'minmax(190px,1.3fr)' },
  { key: 'seen', label: 'Seen', width: 'minmax(130px,0.8fr)' },
  { key: 'complaint', label: 'Complaint', width: 'minmax(180px,1.4fr)' },
  { key: 'treatment', label: 'Treatment', width: 'minmax(180px,1.4fr)' },
  { key: 'outcome', label: 'Outcome', width: '160px' },
];
</script>

<template>
  <PageHeader title="Sick bay" description="Visits to the school nurse, and who is admitted now.">
    <template v-if="can('boarding.health')" #actions>
      <Button @click="recordOpen = true"><PlusIcon />Record visit</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="The sick bay couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <SectionCard
    title="In the sick bay now"
    :description="inBay.length ? `${inBay.length} admitted` : undefined"
    flush
  >
    <Skeleton v-if="isPending" class="m-4 h-16" />
    <p v-else-if="!inBay.length" class="px-4 py-6 text-[13px] text-muted-foreground">
      Nobody is admitted.
    </p>
    <ul v-else>
      <li
        v-for="v in inBay"
        :key="v.id"
        class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 last:border-b-0"
      >
        <span class="flex min-w-0 flex-col text-[13px]">
          <span class="font-medium"
            >{{ v.student.name }}
            <span class="font-normal text-muted-foreground"
              >· {{ v.student.className }}{{ v.student.boarder ? ' · Boarder' : '' }}</span
            ></span
          >
          <span class="text-xs text-muted-foreground"
            >{{ v.complaint }}{{ v.medication ? ` · ${v.medication}` : '' }}</span
          >
          <span class="text-xs text-faint">Since {{ v.seen }}</span>
          <span v-if="v.student.medicalNotes" class="text-xs text-warning-strong"
            >Medical notes: {{ v.student.medicalNotes }}</span
          >
        </span>
        <Button v-if="can('boarding.health')" size="sm" variant="outline" @click="dischargeVisit(v)"
          >Discharge</Button
        >
      </li>
    </ul>
  </SectionCard>

  <DataTable
    title="Recent visits"
    :columns="columns"
    :rows="visits"
    :row-key="(r) => r.id"
    :loading="isPending"
    min-width="900px"
    :empty-text="`No sick bay visits in the last ${days} days.`"
  >
    <template #filters>
      <SegmentedControl
        v-model="days"
        :options="[
          { value: '7', label: '7 days' },
          { value: '14', label: '14 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
        ]"
        label="Visits from the last"
      />
    </template>
    <template #cell-student="{ row }">
      <CellLink :to="studentLink(row)" :label="row.student.name" />
      <span class="text-xs text-faint"
        >{{ row.student.className }} · {{ row.student.admissionNo }}</span
      >
    </template>
    <template #cell-seen="{ row }">
      <span class="tabular-nums">{{ row.seen }}</span>
      <span v-if="row.recordedBy" class="text-xs text-faint">{{ row.recordedBy }}</span>
    </template>
    <template #cell-complaint="{ row }">
      <span>{{ row.complaint }}</span>
      <span v-if="row.assessment" class="text-xs text-faint">{{ row.assessment }}</span>
    </template>
    <template #cell-treatment="{ row }">
      <span>{{ row.treatment || '—' }}</span>
      <span v-if="row.medication" class="text-xs text-faint">{{ row.medication }}</span>
    </template>
    <template #cell-outcome="{ row }">
      <StatusBadge :label="row.outcome" :tone="OUTCOME_TONE[row.outcome]" />
      <span v-if="row.inSickBay" class="text-xs text-warning-strong">Still in sick bay</span>
    </template>
  </DataTable>

  <SickVisitDialog v-model:open="recordOpen" />
</template>
