<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useFinanceOptionsQuery,
  usePlanDefaultMutation,
  usePlansQuery,
  usePlanToggleMutation,
} from '@/api/services/finance';
import type { PaymentPlan } from '@/types';

import { financeTone } from '../finance-tones';
import PlanDrawer from './PlanDrawer.vue';

const confirm = useConfirm();
const { data, isPending, isError } = usePlansQuery();
const { data: options } = useFinanceOptionsQuery();
const makeDefault = usePlanDefaultMutation();
const toggle = usePlanToggleMutation();
const rows = computed(() => data.value ?? []);
const term = computed(
  () => options.value?.terms.find((t) => t.id === options.value?.currentTermId) ?? null,
);

const drawer = ref(false);
const editing = ref<PaymentPlan | null>(null);
function edit(p: PaymentPlan | null) {
  editing.value = p;
  drawer.value = true;
}

const columns: Column[] = [
  { key: 'name', label: 'Plan', width: 'minmax(180px,1.2fr)' },
  { key: 'installments', label: 'Installments', align: 'right', width: '110px' },
  { key: 'schedule', label: 'Schedule this term', width: 'minmax(240px,2fr)' },
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'overdue', label: 'Overdue', align: 'right', width: '90px' },
  { key: 'status', label: 'Status', width: '100px' },
];

const actions = (p: PaymentPlan): RowAction[] => [
  { label: 'Edit', onSelect: () => edit(p) },
  ...(p.isDefault
    ? []
    : [
        {
          label: 'Make default',
          onSelect: () =>
            void confirm({
              title: `Make ${p.name} the default plan?`,
              description: 'New invoices use it unless a family is on another plan.',
              confirmLabel: 'Make default',
              action: async () => {
                await makeDefault.mutateAsync(p.id);
                toast.success(`${p.name} is now the default plan.`);
              },
            }),
        },
        {
          label: p.status === 'Active' ? 'Deactivate' : 'Activate',
          destructive: p.status === 'Active',
          onSelect: async () => {
            await toggle.mutateAsync(p.id);
            toast.success(`${p.name} ${p.status === 'Active' ? 'deactivated' : 'activated'}.`);
          },
        },
      ]),
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <InlineNotice
      v-if="isError"
      tone="error"
      title="Payment plans couldn’t load"
      description="Try again in a moment."
    />
    <DataTable
      title="Payment plans"
      description="Installment schedules families can be put on. Each installment has its own due date and overdue reminder."
      :columns="columns"
      :rows="rows"
      :loading="isPending"
      :row-key="(p) => p.id"
      :row-label="(p) => p.name"
      :actions="actions"
      min-width="820px"
      empty-text="No plans: parents pay the full amount by the due date."
    >
      <template #toolbar>
        <Button size="sm" @click="edit(null)"><PlusIcon class="size-4" /> New plan</Button>
      </template>
      <template #cell-name="{ row }">
        <span class="flex flex-wrap items-center gap-2 font-medium">
          {{ row.name }}
          <StatusBadge v-if="row.isDefault" label="Default" tone="brand" />
        </span>
      </template>
      <template #cell-installments="{ row }"
        ><span class="tabular-nums">{{ row.split.length }}</span></template
      >
      <template #cell-schedule="{ row }"
        ><span class="text-[13px]">{{ row.schedule }}</span></template
      >
      <template #cell-students="{ row }"
        ><span class="tabular-nums">{{ row.students.toLocaleString('en-NG') }}</span></template
      >
      <template #cell-overdue="{ row }">
        <span class="tabular-nums" :class="row.overdue > 0 && 'font-medium text-error-strong'">{{
          row.overdue || '—'
        }}</span>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
      </template>
    </DataTable>
    <PlanDrawer v-model:open="drawer" :plan="editing" :plans="rows" :term="term" />
  </div>
</template>
