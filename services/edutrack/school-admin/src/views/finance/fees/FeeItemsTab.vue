<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PlusIcon } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useRemoveFeeItemMutation, useRestoreFeeItemMutation } from '@/api/services/finance';
import type { FeeItem } from '@/types';

import { financeTone } from '../finance-tones';
import FeeItemDrawer from './FeeItemDrawer.vue';

defineProps<{ items: FeeItem[] }>();
const confirm = useConfirm();
const remove = useRemoveFeeItemMutation();
const restore = useRestoreFeeItemMutation();

const drawer = ref(false);
const editing = ref<FeeItem | null>(null);
function edit(item: FeeItem | null) {
  editing.value = item;
  drawer.value = true;
}

const columns: Column[] = [
  { key: 'name', label: 'Fee item', width: 'minmax(200px,1.6fr)' },
  { key: 'category', label: 'Category', width: '120px' },
  { key: 'charged', label: 'Charged', width: 'minmax(150px,1fr)' },
  { key: 'type', label: 'Type', width: '110px' },
  { key: 'invoiceLines', label: 'On invoices', align: 'right', width: '110px' },
  { key: 'status', label: 'Status', width: '100px' },
];

function removeItem(item: FeeItem) {
  void confirm({
    title: `Remove ${item.name}?`,
    description: item.invoiceLines
      ? 'It is already on invoices, so it is archived instead: issued invoices keep it, and new invoices won’t include it.'
      : 'Its amounts for every class and term are removed too.',
    confirmLabel: item.invoiceLines ? 'Archive item' : 'Remove item',
    tone: 'destructive',
    action: async () => {
      const r = await remove.mutateAsync(item.id);
      toast.success(
        r.archived ? `${item.name} archived. Issued invoices keep it.` : `${item.name} removed.`,
      );
    },
  });
}

const actions = (item: FeeItem): RowAction[] =>
  item.status === 'Archived'
    ? [
        {
          label: 'Restore',
          onSelect: async () => {
            await restore.mutateAsync(item.id);
            toast.success(`${item.name} restored.`);
          },
        },
      ]
    : [
        { label: 'Edit', onSelect: () => edit(item) },
        {
          label: item.invoiceLines ? 'Archive' : 'Remove',
          destructive: true,
          onSelect: () => removeItem(item),
        },
      ];
</script>

<template>
  <DataTable
    title="Fee items"
    description="Everything the school charges. Compulsory items go on every invoice; optional ones (bus, uniforms) are added per student."
    :columns="columns"
    :rows="items"
    :row-key="(i) => i.id"
    :row-label="(i) => i.name"
    :actions="actions"
    min-width="760px"
    empty-text="No fee items yet."
  >
    <template #toolbar>
      <Button size="sm" @click="edit(null)"><PlusIcon class="size-4" /> Add fee item</Button>
    </template>
    <template #cell-name="{ row }">
      <span class="flex flex-col">
        <span class="flex items-center gap-2 font-medium">
          <span
            class="size-2 shrink-0 rounded-full"
            :class="row.type === 'Compulsory' ? 'bg-primary' : 'bg-faint'"
          />
          {{ row.name }}
        </span>
        <span v-if="row.description" class="text-xs text-muted-foreground">{{
          row.description
        }}</span>
      </span>
    </template>
    <template #cell-invoiceLines="{ row }">
      <span class="tabular-nums">{{
        row.invoiceLines ? row.invoiceLines.toLocaleString('en-NG') : '—'
      }}</span>
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
    </template>
  </DataTable>
  <FeeItemDrawer v-model:open="drawer" :item="editing" :items="items" />
</template>
