<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowLeftRightIcon, EyeIcon, PencilIcon, PowerIcon, UploadIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAccountsQuery,
  useFinanceOptionsQuery,
  useToggleAccountMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { BankAccountRow } from '@/types';

import { compactNaira, financeTone, fmtDay } from '../finance-tones';

import AccountDrawer from './AccountDrawer.vue';
import TransferDrawer from './TransferDrawer.vue';

const r = routesPath.finance;
const confirm = useConfirm();
const { data, isPending } = useAccountsQuery();
const { data: options } = useFinanceOptionsQuery();
const toggle = useToggleAccountMutation();

const rows = computed(() => data.value?.rows ?? []);
const multiBranch = computed(() => (options.value?.branches.length ?? 0) > 1);

const drawer = ref(false);
const editing = ref<BankAccountRow | null>(null);
const moving = ref(false);
const moveFrom = ref<string | undefined>();
function add() {
  editing.value = null;
  drawer.value = true;
}
function edit(a: BankAccountRow) {
  editing.value = a;
  drawer.value = true;
}
function move(fromId?: string) {
  moveFrom.value = fromId;
  moving.value = true;
}

const detail = (a: BankAccountRow) => ({ name: r.accountDetail.name, params: { id: a.id } });

function setActive(a: BankAccountRow) {
  const off = a.status === 'Active';
  void confirm({
    title: off ? `Deactivate ${a.name}?` : `Reactivate ${a.name}?`,
    description: off
      ? 'It stops appearing when recording payments and expenses. Its history is kept.'
      : 'It can be used for payments and expenses again.',
    details: off
      ? [
          ['Balance', formatNaira(a.balance)],
          ['Shown to parents', a.showToParents ? 'Yes, will stop' : 'No'],
        ]
      : undefined,
    confirmLabel: off ? 'Deactivate' : 'Reactivate',
    tone: off ? 'destructive' : 'primary',
    action: async () => {
      try {
        await toggle.mutateAsync(a.id);
        toast.success(off ? `${a.name} deactivated.` : `${a.name} reactivated.`);
      } catch (e) {
        throw new Error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
      }
    },
  });
}

const actions = (a: BankAccountRow): RowAction[] => [
  { label: 'View transactions', icon: EyeIcon, to: detail(a) },
  { label: 'Edit', icon: PencilIcon, onSelect: () => edit(a) },
  ...(a.kind === 'Bank' && a.status === 'Active'
    ? [
        {
          label: 'Upload statement',
          icon: UploadIcon,
          to: { ...detail(a), query: { upload: '1' } },
        },
      ]
    : []),
  ...(a.status === 'Active'
    ? [{ label: 'Move money from here', icon: ArrowLeftRightIcon, onSelect: () => move(a.id) }]
    : []),
  {
    label: a.status === 'Active' ? 'Deactivate' : 'Reactivate',
    icon: PowerIcon,
    destructive: a.status === 'Active',
    onSelect: () => setActive(a),
  },
];

const columns = computed<Column[]>(() => [
  { key: 'name', label: 'Account', width: 'minmax(230px,1.8fr)' },
  ...(multiBranch.value ? [{ key: 'branch', label: 'Branch', width: 'minmax(120px,1fr)' }] : []),
  { key: 'balance', label: 'Balance', align: 'right', width: 'minmax(120px,1fr)' },
  { key: 'month', label: 'This month', align: 'right', width: 'minmax(130px,1fr)' },
  { key: 'pending', label: 'Pending', align: 'right', width: '110px' },
  { key: 'statement', label: 'Last statement', width: '120px' },
  { key: 'status', label: 'Status', width: '100px' },
]);
</script>

<template>
  <PageHeader
    title="Bank & Cash Accounts"
    description="Where fees are paid in and expenses paid from. Balances are worked out from what’s recorded."
  >
    <template #actions>
      <Button v-if="rows.length > 1" variant="outline" @click="move()"
        ><ArrowLeftRightIcon class="size-4" /> Move money</Button
      >
      <Button @click="add">Add account</Button>
    </template>
  </PageHeader>

  <MetricGrid v-if="isPending">
    <Skeleton v-for="n in 4" :key="n" class="h-[74px] rounded-lg" />
  </MetricGrid>

  <template v-else-if="data">
    <InlineNotice
      v-for="n in data.notices"
      :key="n.title"
      :tone="n.tone"
      :title="n.title"
      :description="n.description"
    >
      <template v-if="n.action" #action>
        <Button as-child variant="outline" size="sm" class="shrink-0"
          ><RouterLink :to="n.action.to">{{ n.action.label }}</RouterLink></Button
        >
      </template>
    </InlineNotice>

    <EmptyState
      v-if="!rows.length"
      illustrated
      title="Add the account parents pay into"
      description="EduTrack never holds money. Invoices show your bank details and each student’s transfer reference; you then verify transfers against your statement."
    >
      <Button @click="add">Add bank account</Button>
    </EmptyState>

    <template v-else>
      <MetricGrid>
        <MetricCard
          label="Cash & bank"
          :value="compactNaira(data.total)"
          hint="All active accounts"
        />
        <MetricCard label="In banks" :value="compactNaira(data.bankTotal)" />
        <MetricCard label="Cash on hand" :value="compactNaira(data.cashTotal)" />
        <MetricCard
          label="Pending verification"
          :value="compactNaira(data.pending)"
          :hint="data.pending ? 'Not in balances yet' : 'Nothing waiting'"
          :hint-tone="data.pending ? 'warning' : 'neutral'"
          :to="data.pending ? { name: r.payments.name, query: { tab: 'pending' } } : undefined"
        />
      </MetricGrid>

      <DataTable
        :columns="columns"
        :rows="rows"
        :row-key="(a) => a.id"
        :row-label="(a) => a.name"
        :actions="actions"
        min-width="940px"
      >
        <template #cell-name="{ row }">
          <span class="flex flex-wrap items-center gap-1.5">
            <CellLink :to="detail(row)" :label="row.name" />
            <StatusBadge v-if="row.showToParents" label="Shown to parents" tone="brand" />
          </span>
          <span class="text-xs text-faint">{{
            row.kind === 'Bank' ? `${row.bank} · ${row.accountNumber}` : 'Cash'
          }}</span>
        </template>
        <template #cell-balance="{ row }"
          ><span :class="['font-semibold', row.balance < 0 && 'text-error-strong']">{{
            formatNaira(row.balance)
          }}</span></template
        >
        <template #cell-month="{ row }">
          <span class="text-success-strong">+{{ compactNaira(row.moneyIn) }}</span>
          <span class="text-xs text-muted-foreground">−{{ compactNaira(row.moneyOut) }}</span>
        </template>
        <template #cell-pending="{ row }"
          ><span :class="row.pending ? 'text-warning-strong' : 'text-faint'">{{
            row.pending ? compactNaira(row.pending) : '—'
          }}</span></template
        >
        <template #cell-statement="{ row }">
          <span v-if="row.kind === 'Cash'" class="text-faint">—</span>
          <span v-else :class="!row.lastStatement && 'text-faint'">{{
            row.lastStatement ? fmtDay(row.lastStatement) : 'None yet'
          }}</span>
        </template>
        <template #cell-status="{ row }"
          ><StatusBadge :label="row.status" :tone="financeTone(row.status)"
        /></template>
      </DataTable>
    </template>
  </template>

  <AccountDrawer
    v-model:open="drawer"
    :account="editing"
    :banks="data?.banks ?? []"
    :branches="options?.branches ?? []"
  />
  <TransferDrawer v-model:open="moving" :accounts="rows" :from-id="moveFrom" />
</template>
