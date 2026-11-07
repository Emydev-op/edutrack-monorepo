<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useToggleVendorMutation, useVendorQuery, useVendorsQuery } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';

import ExpenseDrawer from '../expenses/ExpenseDrawer.vue';
import { compactNaira, financeTone, fmtDay } from '../finance-tones';
import VendorDrawer from './VendorDrawer.vue';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: v, isPending, error } = useVendorQuery(id);
const { data: list } = useVendorsQuery({});
const toggle = useToggleVendorMutation();
const confirm = useConfirm();

const editOpen = ref(false);
const expenseOpen = ref(false);

const contactRows = computed(() =>
  v.value
    ? [
        { label: 'Supplies', value: v.value.category },
        { label: 'Contact', value: v.value.contactName },
        { label: 'Phone', value: v.value.phone },
        { label: 'Email', value: v.value.email },
        { label: 'Address', value: v.value.address },
        { label: 'Notes', value: v.value.notes },
      ]
    : [],
);
const bankRows = computed(() =>
  v.value
    ? v.value.bank === 'Direct debit'
      ? [{ label: 'Payment', value: 'Direct debit' }]
      : [
          { label: 'Bank', value: v.value.bank },
          { label: 'Account number', value: v.value.accountNumber },
          { label: 'Account name', value: v.value.accountName },
        ]
    : [],
);

const columns: Column[] = [
  { key: 'description', label: 'Expense', width: 'minmax(220px,2fr)' },
  { key: 'category', label: 'Category', width: 'minmax(110px,1fr)' },
  { key: 'date', label: 'Date', width: '110px' },
  { key: 'amount', label: 'Amount', align: 'right', width: '120px' },
  { key: 'status', label: 'Status', width: 'minmax(140px,1fr)' },
];

function doToggle() {
  const x = v.value!;
  const deactivate = x.status === 'Active';
  void confirm({
    title: deactivate ? `Deactivate ${x.name}?` : `Reactivate ${x.name}?`,
    description: deactivate
      ? 'They won’t be offered for new expenses. Past expenses keep their link.'
      : 'They can be chosen for new expenses again.',
    confirmLabel: deactivate ? 'Deactivate' : 'Reactivate',
    tone: deactivate ? 'destructive' : 'primary',
    action: async () => {
      await toggle.mutateAsync(x.id);
      toast.success(`${x.name} ${deactivate ? 'deactivated' : 'reactivated'}.`);
    },
  });
}
</script>

<template>
  <EmptyState
    v-if="error"
    title="Vendor not found"
    description="It may have been removed, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.finance.vendors.name }"
        >Back to vendors</RouterLink
      ></Button
    >
  </EmptyState>
  <p v-else-if="isPending || !v" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader :title="v.name" :description="v.category" :status="v.status">
      <template #actions>
        <Button variant="outline" @click="doToggle">{{
          v.status === 'Active' ? 'Deactivate' : 'Reactivate'
        }}</Button>
        <Button variant="outline" @click="editOpen = true">Edit</Button>
        <Button v-if="v.status === 'Active'" @click="expenseOpen = true">New expense</Button>
      </template>
    </PageHeader>

    <MetricGrid>
      <MetricCard label="Paid this session" :value="compactNaira(v.paid)" />
      <MetricCard
        label="Outstanding"
        :value="compactNaira(v.outstanding)"
        :hint="v.outstanding ? 'Submitted or approved, not yet paid' : 'Nothing owed'"
        :hint-tone="v.outstanding ? 'warning' : 'neutral'"
      />
      <MetricCard
        label="Expenses"
        :value="v.expenses"
        :hint="v.lastExpense ? `Last on ${fmtDay(v.lastExpense)}` : 'None yet'"
      />
    </MetricGrid>

    <div class="grid items-start gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <KeyValueCard title="Contact" :rows="contactRows" />
      <KeyValueCard
        title="Bank details"
        :rows="bankRows.length ? bankRows : [{ label: 'Bank', value: 'Not set' }]"
        footer="Changes to bank details are recorded in the history below."
      />
    </div>

    <DataTable
      title="Expenses"
      :columns="columns"
      :rows="v.rows"
      :row-key="(e) => e.id"
      :row-label="(e) => e.description"
      min-width="700px"
      empty-text="No expenses with this vendor yet."
    >
      <template #cell-description="{ row }">
        <CellLink
          :to="{ name: routesPath.finance.expenseDetail.name, params: { id: row.id } }"
          :label="row.description"
          :detail="row.no"
        />
      </template>
      <template #cell-date="{ row }">{{ fmtDay(row.date) }}</template>
      <template #cell-amount="{ row }"
        ><span class="tabular-nums">{{ formatNaira(row.amount) }}</span></template
      >
      <template #cell-status="{ row }">
        <span class="flex flex-col gap-0.5">
          <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
          <span v-if="row.waitingOn" class="text-xs text-faint"
            >Waiting for {{ row.waitingOn }}</span
          >
        </span>
      </template>
    </DataTable>

    <ActivityTimeline title="History" :items="v.history" />

    <VendorDrawer v-model:open="editOpen" :vendor="v" :categories="list?.categories" />
    <ExpenseDrawer v-model:open="expenseOpen" :vendor-id="v.id" />
  </template>
</template>
