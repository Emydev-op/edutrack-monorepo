<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useDiscountsQuery } from '@/api/services/finance';
import type { Discount } from '@/types';

import { financeTone } from '../finance-tones';
import DiscountDrawer, { type DiscountPreset } from './DiscountDrawer.vue';

const { data, isPending, isError } = useDiscountsQuery();
const rows = computed(() => data.value ?? []);
const hasSibling = computed(() =>
  rows.value.some((d) => d.basis === 'Sibling' && d.status === 'Active'),
);

const drawer = ref(false);
const editing = ref<Discount | null>(null);
const preset = ref<DiscountPreset | null>(null);
function edit(d: Discount | null, p: DiscountPreset | null = null) {
  editing.value = d;
  preset.value = p;
  drawer.value = true;
}
const PRESETS: [string, DiscountPreset][] = [
  [
    'Sibling discount',
    {
      name: 'Sibling discount',
      basis: 'Sibling',
      kind: 'Percentage',
      value: 10,
      appliesTo: 'Tuition only',
      fromChild: 2,
    },
  ],
  [
    'Staff-child discount',
    {
      name: 'Staff child',
      basis: 'Staff child',
      kind: 'Percentage',
      value: 50,
      appliesTo: 'Tuition only',
      needsApproval: true,
    },
  ],
  [
    'Scholarship',
    {
      name: 'Scholarship',
      basis: 'Scholarship',
      kind: 'Percentage',
      value: 100,
      appliesTo: 'Tuition only',
      needsApproval: true,
    },
  ],
];

const columns: Column[] = [
  { key: 'name', label: 'Discount', width: 'minmax(220px,2fr)' },
  { key: 'basis', label: 'Type', width: '120px' },
  { key: 'value', label: 'Amount', width: '110px' },
  { key: 'approval', label: 'Approval', width: '120px' },
  { key: 'applied', label: 'Applied this session', align: 'right', width: 'minmax(150px,1fr)' },
  { key: 'status', label: 'Status', width: '100px' },
];
const valueOf = (d: Discount) => (d.kind === 'Percentage' ? `${d.value}%` : formatNaira(d.value));
</script>

<template>
  <div class="flex flex-col gap-4">
    <InlineNotice
      v-if="isError"
      tone="error"
      title="Discounts couldn’t load"
      description="Try again in a moment."
    />
    <DataTable
      title="Discounts"
      description="Sibling discounts apply automatically when invoices are created. Others are applied per student from the invoice."
      :columns="columns"
      :rows="rows"
      :loading="isPending"
      :row-key="(d) => d.id"
      :row-label="(d) => d.name"
      :actions="(d) => [{ label: 'Edit', onSelect: () => edit(d) }]"
      min-width="820px"
      empty-text="No discounts. Add a sibling rule, staff-child discount or scholarship."
    >
      <template #toolbar>
        <template v-for="[label, p] in PRESETS" :key="label">
          <Button
            v-if="p.basis !== 'Sibling' || !hasSibling"
            variant="outline"
            size="sm"
            @click="edit(null, p)"
            >Add {{ label.toLowerCase() }}</Button
          >
        </template>
        <Button size="sm" @click="edit(null)"><PlusIcon class="size-4" /> New discount</Button>
      </template>
      <template #cell-name="{ row }">
        <span class="flex flex-col">
          <span class="font-medium">{{ row.name }}</span>
          <span class="text-xs text-muted-foreground">{{ row.description }}</span>
        </span>
      </template>
      <template #cell-basis="{ row }">
        <StatusBadge
          :label="row.automatic ? 'Automatic' : 'Manual'"
          :tone="row.automatic ? 'brand' : 'neutral'"
        />
      </template>
      <template #cell-value="{ row }"
        ><span class="tabular-nums">{{ valueOf(row) }}</span></template
      >
      <template #cell-approval="{ row }">{{
        row.automatic ? 'Not needed' : row.needsApproval ? 'Recorded' : 'Not needed'
      }}</template>
      <template #cell-applied="{ row }">
        <span class="flex flex-col items-end tabular-nums">
          <span>{{ row.applied.toLocaleString('en-NG') }} invoices</span>
          <span class="text-xs text-muted-foreground">{{ formatNaira(row.given) }} off</span>
        </span>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
      </template>
    </DataTable>
    <DiscountDrawer v-model:open="drawer" :discount="editing" :preset="preset" :discounts="rows" />
  </div>
</template>
