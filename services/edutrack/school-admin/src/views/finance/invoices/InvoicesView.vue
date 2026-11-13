<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { EyeIcon, ReceiptIcon, SendIcon, WalletIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import FilterMenu from '@edutrack/app-kit/components/common/FilterMenu.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import type { RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useSelection } from '@edutrack/app-kit/composables/useSelection';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useApplyLateFeesMutation,
  useFinanceSettingsQuery,
  useInvoicesQuery,
  useIssueInvoicesMutation,
  useRemindPreviewMutation,
  useSendRemindersMutation,
  type RemindResult,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { InvoiceRow, InvoiceStatus } from '@/types';

import { compactNaira, financeTone } from '../finance-tones';

const r = routesPath.finance;
const confirm = useConfirm();
const context = useContextStore();
const remindPreview = useRemindPreviewMutation();
const sendReminders = useSendRemindersMutation();
const lateFees = useApplyLateFeesMutation();
const issue = useIssueInvoicesMutation();
const { data: settings } = useFinanceSettingsQuery();

const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const term = useRouteQuery<string>('term', '');
const status = useRouteQuery<string>('status', '');
const level = useRouteQuery<string>('level', '');
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, () => (page.value = '1'));

const branch = computed(() => context.current.branch);
const { data, isPending } = useInvoicesQuery(() => ({
  term: term.value || undefined,
  session: term.value ? undefined : context.current.session,
  status: (status.value || undefined) as InvoiceStatus | 'Open' | undefined,
  level: level.value || undefined,
  search: debounced.value,
  branch: branch.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const rows = computed(() => data.value?.data ?? []);
const selection = useSelection(rows, (i) => i.id);
const summary = computed(() => data.value?.summary);

/** The term the list shows: the one picked, else the working context's term. */
const termLabel = computed(() => {
  if (term.value === 'all') return 'All terms';
  const t = data.value?.terms.find((x) => x.id === term.value);
  return t ? `${t.session} · ${t.name}` : `${context.current.session} · ${context.current.term}`;
});
const termId = computed(
  () =>
    (term.value && term.value !== 'all' ? term.value : undefined) ??
    data.value?.terms.find(
      (t) => t.name === context.current.term && t.session === context.current.session,
    )?.id,
);
const termOptions = computed(() => [
  ...(data.value?.terms ?? []).map((t) => `${t.session} · ${t.name}`),
  'All terms',
]);
const termFilter = computed({
  get: () => (term.value ? termLabel.value : ''),
  set: (label: string) => {
    if (!label) term.value = '';
    else if (label === 'All terms') term.value = 'all';
    else term.value = data.value?.terms.find((t) => `${t.session} · ${t.name}` === label)?.id ?? '';
  },
});

const STATUSES = ['', 'Open', 'Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'];
const chipCount = (s: string) => {
  const c = summary.value?.counts;
  if (!c) return undefined;
  if (!s) return c.All;
  if (s === 'Open') return undefined;
  return c[s as InvoiceStatus];
};

const invoiceLink = (i: InvoiceRow) => ({ name: r.invoiceDetail.name, params: { id: i.id } });
const accountLink = (i: InvoiceRow) => ({
  name: r.studentAccount.name,
  params: { key: i.studentKey },
});
const actions = (i: InvoiceRow): RowAction[] => [
  { label: 'View invoice', icon: EyeIcon, to: invoiceLink(i) },
  { label: 'Student account', icon: WalletIcon, to: accountLink(i) },
  ...(i.balance > 0 && i.status !== 'Draft'
    ? [
        {
          label: 'Record payment',
          icon: ReceiptIcon,
          to: { name: r.paymentNew.name, query: { student: i.studentKey, invoice: i.id } },
        },
        { label: 'Send reminder', icon: SendIcon, onSelect: () => remind([i.id]) },
      ]
    : []),
];

async function remind(ids?: string[]) {
  const body = ids ? { ids } : { overdue: true, termId: termId.value, branch: branch.value };
  let preview: RemindResult;
  try {
    preview = await remindPreview.mutateAsync(body);
  } catch (e) {
    return void toast.error((e as Error).message);
  }
  if (!preview.invoices)
    return void toast.info(
      ids ? 'Nothing is owed on the selected invoices.' : 'No overdue invoices to remind.',
    );
  void confirm({
    title: ids
      ? `Send reminders for ${preview.invoices} invoice${preview.invoices === 1 ? '' : 's'}?`
      : `Send reminders for ${preview.invoices} overdue invoice${preview.invoices === 1 ? '' : 's'}?`,
    details: [
      ['Recipients', `${preview.recipients} fee payer${preview.recipients === 1 ? '' : 's'}`],
      ...(preview.skipped
        ? ([['Skipped', `${preview.skipped} with no guardian linked`]] as [string, string][])
        : []),
      ['Owed', formatNaira(preview.total)],
      ['Channels', 'SMS · Email, with the bank details and transfer reference'],
      ['Cost', `${formatNaira(preview.cost)} SMS credit`],
    ],
    confirmLabel: 'Send reminders',
    action: async () => {
      const res = await sendReminders.mutateAsync(body);
      toast.success(
        `Reminders sent to ${res.recipients} fee payer${res.recipients === 1 ? '' : 's'}.`,
      );
      selection.clear();
    },
  });
}

function applyLateFees() {
  const fee = settings.value?.lateFee;
  const n = data.value?.lateFeeCandidates ?? 0;
  void confirm({
    title: `Add a late fee to ${n} overdue invoice${n === 1 ? '' : 's'}?`,
    details: [
      [
        'Late fee',
        fee?.kind === 'Percentage' ? `${fee.value}% of each balance` : formatNaira(fee?.value ?? 0),
      ],
      ['Applies to', 'Overdue invoices that don’t have a late fee yet'],
      ['Reversible', 'Yes, remove the line from an invoice'],
    ],
    confirmLabel: 'Add late fees',
    action: async () => {
      const res = await lateFees.mutateAsync({ termId: termId.value, branch: branch.value });
      toast.success(`Late fee added to ${res.applied} invoices · ${formatNaira(res.total)}.`);
    },
  });
}

function issueSelected() {
  const drafts = selection.selectedRows().filter((i) => i.status === 'Draft');
  if (!drafts.length) return void toast.error('Select draft invoices to issue.');
  void confirm({
    title: `Issue ${drafts.length} draft invoice${drafts.length === 1 ? '' : 's'}?`,
    details: [
      ['Total', formatNaira(drafts.reduce((n, i) => n + i.total, 0))],
      ['Notified', `${drafts.filter((i) => i.payer).length} fee payers by SMS and email`],
      ['Reversible', 'Issued invoices can be cancelled, not deleted'],
    ],
    confirmLabel: 'Issue invoices',
    action: async () => {
      const res = await issue.mutateAsync(drafts.map((i) => i.id));
      toast.success(`${res.issued} invoice${res.issued === 1 ? '' : 's'} issued.`);
      selection.clear();
    },
  });
}

function exportRows(list: InvoiceRow[], name: string) {
  downloadCsv(
    name,
    [
      'Invoice',
      'Student',
      'Admission no.',
      'Class',
      'Fee payer',
      'Session',
      'Term',
      'Total',
      'Paid',
      'Balance',
      'Status',
      'Due',
    ],
    list.map((i) => [
      i.no,
      i.student,
      i.admissionNo,
      i.className,
      i.payer ?? '',
      i.session,
      i.term,
      i.total,
      i.paid,
      i.balance,
      i.status,
      i.dueOn,
    ]),
  );
  toast.success(`Exported ${list.length} invoice${list.length === 1 ? '' : 's'}.`);
}

const columns: Column[] = [
  { key: 'no', label: 'Invoice', width: 'minmax(130px,0.9fr)' },
  { key: 'student', label: 'Student', width: 'minmax(190px,1.5fr)' },
  { key: 'payer', label: 'Fee payer', width: 'minmax(170px,1.3fr)' },
  { key: 'term', label: 'Session · term', width: 'minmax(150px,1fr)' },
  { key: 'total', label: 'Total', align: 'right', width: '110px' },
  { key: 'balance', label: 'Balance', align: 'right', width: '120px' },
  { key: 'status', label: 'Status', width: 'minmax(160px,1fr)' },
];
</script>

<template>
  <PageHeader title="Invoices" :description="`${termLabel} · ${context.current.branch}`">
    <template #actions>
      <Button variant="outline" :disabled="remindPreview.isPending.value" @click="remind()">
        Send overdue reminders
      </Button>
      <Button v-if="data?.lateFeeCandidates" variant="outline" @click="applyLateFees">
        Apply late fees · {{ data.lateFeeCandidates }}
      </Button>
      <Button as-child
        ><RouterLink :to="{ name: r.invoiceGenerate.name, query: termId ? { term: termId } : {} }"
          >Generate invoices</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <MetricGrid v-if="summary">
    <MetricCard
      label="Billed"
      :value="compactNaira(summary.billed)"
      :hint="`${summary.counts.All - summary.counts.Draft - summary.counts.Cancelled} invoices`"
    />
    <MetricCard
      label="Collected"
      :value="compactNaira(summary.collected)"
      :hint="`${summary.rate}% collection`"
      :hint-tone="summary.rate >= 70 ? 'success' : 'warning'"
    />
    <MetricCard
      label="Outstanding"
      :value="compactNaira(summary.outstanding)"
      hint="Issued invoices with a balance"
    />
    <MetricCard
      label="Overdue"
      :value="compactNaira(summary.overdue)"
      :hint="`${summary.overdueCount} invoices`"
      :hint-tone="summary.overdueCount ? 'error' : 'neutral'"
    />
  </MetricGrid>

  <InlineNotice
    v-for="n in data?.notices ?? []"
    :key="n.title"
    :tone="n.tone"
    :title="n.title"
    :description="n.description"
  >
    <template v-if="n.action" #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="n.action.to">{{ n.action.label }}</RouterLink></Button
      >
    </template>
  </InlineNotice>

  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
    <button
      v-for="s in STATUSES"
      :key="s || 'all'"
      type="button"
      :class="
        cn(
          'rounded-full border px-3 py-1 text-[13px] transition-colors',
          status === s
            ? 'border-primary bg-accent font-medium text-accent-foreground'
            : 'bg-card hover:border-primary',
        )
      "
      :aria-pressed="status === s"
      @click="status = s"
    >
      {{ s || 'All'
      }}<span v-if="chipCount(s) !== undefined" class="ml-1 text-faint tabular-nums">{{
        chipCount(s)
      }}</span>
    </button>
  </div>

  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(i) => i.id"
    :row-label="(i) => i.no"
    :actions="actions"
    :selection="selection"
    :loading="isPending"
    :meta="data?.meta"
    min-width="1100px"
    :empty-text="
      status || level || debounced
        ? 'No invoices match your filters.'
        : 'No invoices for this term yet. Generate them from the fee structure.'
    "
    @update:page="page = String($event)"
    @update:page-size="pageSize = String($event)"
  >
    <template #search
      ><SearchInput v-model="search" placeholder="Search invoice, student or payer"
    /></template>
    <template #filters>
      <FilterMenu v-model="termFilter" label="Term" :options="termOptions" />
      <FilterMenu v-model="level" label="Class" :options="data?.levels ?? []" />
    </template>
    <template #toolbar>
      <Button
        variant="outline"
        class="h-9"
        :disabled="!rows.length"
        @click="exportRows(rows, 'invoices.csv')"
        >Export</Button
      >
    </template>
    <template #bulk>
      <Button size="sm" variant="outline" @click="issueSelected">Issue drafts</Button>
      <Button size="sm" variant="outline" @click="remind(selection.selectedRows().map((i) => i.id))"
        >Send reminder</Button
      >
      <Button
        size="sm"
        variant="outline"
        @click="exportRows(selection.selectedRows(), 'selected-invoices.csv')"
        >Export</Button
      >
    </template>
    <template #cell-no="{ row }"><CellLink :to="invoiceLink(row)" :label="row.no" /></template>
    <template #cell-student="{ row }">
      <CellLink :to="accountLink(row)" :label="row.student" />
      <span class="text-xs text-faint">{{ row.className }}</span>
    </template>
    <template #cell-payer="{ row }">
      <span v-if="row.payer">{{ row.payer }}</span>
      <span v-else class="text-error-strong">No guardian linked</span>
    </template>
    <template #cell-term="{ row }">{{ row.session }} · {{ row.term }}</template>
    <template #cell-total="{ row }"
      ><span class="tabular-nums">{{ formatNaira(row.total) }}</span></template
    >
    <template #cell-balance="{ row }">
      <span :class="cn('tabular-nums', row.balance ? 'font-semibold' : 'text-faint')">{{
        formatNaira(row.balance)
      }}</span>
      <span v-if="row.pending" class="text-xs text-warning-strong"
        >{{ formatNaira(row.pending) }} pending</span
      >
    </template>
    <template #cell-status="{ row }">
      <StatusBadge :label="row.status" :tone="financeTone(row.status)" />
      <span v-if="row.dueNote" class="text-xs text-faint">{{ row.dueNote }}</span>
    </template>
  </DataTable>
</template>
