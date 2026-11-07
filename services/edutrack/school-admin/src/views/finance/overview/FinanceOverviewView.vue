<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import ColumnChart from '@edutrack/app-kit/components/common/ColumnChart.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useFinanceOverviewQuery } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { FinanceOverview } from '@/types';

import { compactNaira, financeTone, fmtDay } from '../finance-tones';

import IncomeExpenditureChart from './IncomeExpenditureChart.vue';

const r = routesPath.finance;
const context = useContextStore();
const { data, isPending } = useFinanceOverviewQuery(() => ({
  branch: context.current.branch,
  session: context.current.session,
  term: context.current.term,
}));

const billed = computed(() => data.value?.sections.reduce((n, s) => n + s.billed, 0) ?? 0);
const nothingBilled = computed(
  () => !!data.value && !billed.value && !data.value.recentPayments.length,
);

const weekly = computed(() =>
  (data.value?.weekly ?? []).map((w, i, all) => ({
    label: w.label,
    value: w.value,
    display: compactNaira(w.value),
    // The current week is still in progress.
    color: i === all.length - 1 ? 'var(--chart-3)' : undefined,
  })),
);

const sectionColumns: Column[] = [
  { key: 'section', label: 'Section', width: 'minmax(150px,1.4fr)' },
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'billed', label: 'Billed', align: 'right' },
  { key: 'collected', label: 'Collected', align: 'right' },
  { key: 'outstanding', label: 'Outstanding', align: 'right' },
  { key: 'overdue', label: 'Overdue', align: 'right' },
  { key: 'rate', label: 'Rate', align: 'right', width: '70px' },
];
type SectionRow = FinanceOverview['sections'][number];

const methodTotal = computed(() => data.value?.methods.reduce((n, m) => n + m.amount, 0) ?? 0);
const expenseTotal = computed(() => data.value?.topExpenses.reduce((n, e) => n + e.amount, 0) ?? 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const REPORTS = [
  {
    id: 'collection',
    title: 'Fee collection by class',
    text: 'Billed, collected and overdue per class.',
  },
  { id: 'outstanding', title: 'Outstanding balances', text: 'Who owes, aged by days overdue.' },
  {
    id: 'income-expenditure',
    title: 'Income vs expenditure',
    text: 'Money in and out each month.',
  },
  { id: 'cash-book', title: 'Cash book', text: 'Opening, in, out and closing per account.' },
];

const STEPS = [
  {
    title: 'Set up fees',
    text: 'Fee items and amounts per class, then publish the term.',
    to: { name: r.fees.name },
  },
  {
    title: 'Add the bank account parents pay into',
    text: 'Invoices and reminders show it with the transfer reference.',
    to: { name: r.accounts.name },
  },
  {
    title: 'Generate invoices',
    text: 'Every student is billed from the published structure.',
    to: { name: r.invoiceGenerate.name },
  },
];
</script>

<template>
  <PageHeader
    title="Finance overview"
    :description="`Finance · ${context.current.session} · ${context.current.term} · ${data?.branch ?? context.current.branch}`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: r.expenses.name, query: { new: '1' } }"
          >Record expense</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: r.paymentNew.name }">Record payment</RouterLink></Button
      >
    </template>
  </PageHeader>

  <MetricGrid v-if="isPending">
    <Skeleton v-for="n in 6" :key="n" class="h-[74px] rounded-lg" />
  </MetricGrid>

  <EmptyState
    v-else-if="nothingBilled"
    illustrated
    title="Nothing billed yet"
    description="EduTrack doesn’t collect money. Parents pay into your bank account and you record or verify each payment here. Three steps get you started:"
  >
    <ol class="mx-auto flex w-full max-w-xl flex-col gap-2 text-left">
      <li v-for="(s, i) in STEPS" :key="s.title">
        <RouterLink
          :to="s.to"
          class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:border-primary"
        >
          <span
            class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-xs font-semibold text-brand-strong"
            >{{ i + 1 }}</span
          >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-[13px] font-medium">{{ s.title }}</span>
            <span class="text-xs text-muted-foreground">{{ s.text }}</span>
          </span>
          <ChevronRightIcon class="size-4 text-faint" />
        </RouterLink>
      </li>
    </ol>
  </EmptyState>

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

    <MetricGrid>
      <MetricCard
        v-for="k in data.kpis"
        :key="k.label"
        :label="k.label"
        :value="k.value"
        :hint="k.hint"
        :hint-tone="k.tone"
      />
    </MetricGrid>

    <div class="grid gap-4 xl:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
      <SectionCard
        title="Income vs expenditure"
        description="Is the session covering its costs month by month?"
      >
        <IncomeExpenditureChart :months="data.monthly" />
      </SectionCard>
      <SectionCard title="Collections per week" description="Confirmed payments, last 8 weeks">
        <ColumnChart :bars="weekly" :height="120" label="Confirmed fee payments per week" />
      </SectionCard>
    </div>

    <DataTable
      title="Collection by section"
      :description="`${data.term.name} · ${data.branch}`"
      :columns="sectionColumns"
      :rows="data.sections"
      :row-key="(s: SectionRow) => s.section"
      min-width="720px"
      empty-text="No invoices issued this term yet."
    >
      <template #cell-students="{ row }">{{ row.students.toLocaleString('en-NG') }}</template>
      <template #cell-billed="{ row }">{{ formatNaira(row.billed) }}</template>
      <template #cell-collected="{ row }">{{ formatNaira(row.collected) }}</template>
      <template #cell-outstanding="{ row }">{{ formatNaira(row.outstanding) }}</template>
      <template #cell-overdue="{ row }"
        ><span :class="row.overdue ? 'text-error-strong' : 'text-faint'">{{
          formatNaira(row.overdue)
        }}</span></template
      >
      <template #cell-rate="{ row }"
        ><span class="font-semibold">{{ row.rate }}%</span></template
      >
    </DataTable>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      <SectionCard title="Payments by method" :description="`${data.term.name}, confirmed`">
        <div v-if="data.methods.length" class="flex flex-col gap-3">
          <MeterRow
            v-for="m in data.methods"
            :key="m.method"
            :label="`${m.method} · ${m.count.toLocaleString('en-NG')}`"
            :percent="pct(m.amount, methodTotal)"
            :value="compactNaira(m.amount)"
            color="var(--chart-1)"
            label-width="120px"
          />
        </div>
        <p v-else class="text-[13px] text-muted-foreground">No confirmed payments yet.</p>
      </SectionCard>
      <SectionCard title="Top expenses" :description="`${data.term.name}, paid`">
        <div v-if="data.topExpenses.length" class="flex flex-col gap-3">
          <MeterRow
            v-for="e in data.topExpenses"
            :key="e.category"
            :label="e.category"
            :percent="pct(e.amount, expenseTotal)"
            :value="compactNaira(e.amount)"
            color="var(--chart-3)"
            label-width="110px"
          />
        </div>
        <p v-else class="text-[13px] text-muted-foreground">No expenses paid this term.</p>
        <template #actions>
          <RouterLink
            :to="{ name: r.expenses.name }"
            class="text-[13px] font-medium text-primary hover:underline"
            >Expenses</RouterLink
          >
        </template>
      </SectionCard>
      <SectionCard title="Cash & bank" description="Balance now">
        <ul v-if="data.accounts.length" class="flex flex-col divide-y divide-divider text-[13px]">
          <li v-for="a in data.accounts" :key="a.id" class="flex justify-between gap-3 py-2">
            <RouterLink
              :to="{ name: r.accountDetail.name, params: { id: a.id } }"
              class="truncate hover:text-primary hover:underline"
              >{{ a.name }}</RouterLink
            >
            <span class="tabular-nums">{{ formatNaira(a.balance) }}</span>
          </li>
        </ul>
        <p v-else class="text-[13px] text-muted-foreground">
          No accounts yet.
          <RouterLink :to="{ name: r.accounts.name }" class="text-primary hover:underline"
            >Add one</RouterLink
          >
        </p>
      </SectionCard>
    </div>

    <div class="grid gap-4 xl:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
      <SectionCard title="Recent payments" flush>
        <template #actions>
          <RouterLink
            :to="{ name: r.payments.name }"
            class="text-[13px] font-medium text-primary hover:underline"
            >All payments</RouterLink
          >
        </template>
        <ul class="flex flex-col divide-y divide-divider">
          <li v-for="p in data.recentPayments" :key="p.id">
            <RouterLink
              :to="{ name: r.paymentDetail.name, params: { id: p.id } }"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-muted"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium">{{ p.student }}</span>
                <span class="text-xs text-faint"
                  >{{ p.no }} · {{ p.method }} · {{ fmtDay(p.date) }}</span
                >
              </span>
              <span class="tabular-nums">{{ formatNaira(p.amount) }}</span>
              <StatusBadge :label="p.status" :tone="financeTone(p.status)" />
            </RouterLink>
          </li>
        </ul>
        <p v-if="!data.recentPayments.length" class="px-4 py-6 text-[13px] text-muted-foreground">
          No payments recorded yet.
        </p>
      </SectionCard>
      <SectionCard title="Reports" description="Filter by term and branch, export or print">
        <ul class="flex flex-col gap-2">
          <li v-for="rep in REPORTS" :key="rep.id">
            <RouterLink
              :to="{ name: r.report.name, params: { id: rep.id } }"
              class="flex items-center gap-3 rounded-md border px-3 py-2.5 hover:border-primary"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="text-[13px] font-medium">{{ rep.title }}</span>
                <span class="text-xs text-muted-foreground">{{ rep.text }}</span>
              </span>
              <ChevronRightIcon class="size-4 text-faint" />
            </RouterLink>
          </li>
        </ul>
      </SectionCard>
    </div>
  </template>
</template>
