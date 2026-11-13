<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { DownloadIcon, PrinterIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';
import { formatNaira } from '@edutrack/app-kit/lib/format';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useFinanceOptionsQuery, useFinanceReportQuery } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ReportId, ReportView } from '@/types';

const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'collection', label: 'Collection by class' },
  { id: 'outstanding', label: 'Outstanding balances' },
  { id: 'income-expenditure', label: 'Income vs expenditure' },
  { id: 'cash-book', label: 'Cash book' },
];

const route = useRoute();
const context = useContextStore();
const id = computed(() => String(route.params.id) as ReportId);
const term = useRouteQuery<string>('term', '');
const { data: options } = useFinanceOptionsQuery();
const { data, isPending, isError } = useFinanceReportQuery(id, () => ({
  branch: context.current.branch,
  ...(term.value
    ? { term: term.value }
    : { term: context.current.term, session: context.current.session }),
}));

/** Term filter matters for the class and cash-book reports; the others span the session. */
const usesTerm = computed(() => id.value === 'collection' || id.value === 'cash-book');
const termOptions = computed(() =>
  (options.value?.terms ?? []).map((t) => ({ value: t.id, label: `${t.session} · ${t.name}` })),
);
const selectedTerm = computed({
  get: () =>
    term.value ||
    options.value?.terms.find(
      (t) => t.name === context.current.term && t.session === context.current.session,
    )?.id ||
    '',
  set: (v: string) => (term.value = v),
});

const tabs = computed(() =>
  REPORTS.map((rep) => ({
    label: rep.label,
    to: { name: routesPath.finance.report.name, params: { id: rep.id }, query: route.query },
    active: rep.id === id.value,
  })),
);

type Col = ReportView['columns'][number];
const show = (col: Col, value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—';
  if (col.money && typeof value === 'number') return formatNaira(value);
  if (col.percent && typeof value === 'number') return `${value}%`;
  return typeof value === 'number' ? value.toLocaleString('en-NG') : value;
};
const negative = (col: Col, value: unknown) => col.money && typeof value === 'number' && value < 0;
const gridCols = computed(() =>
  (data.value?.columns ?? [])
    .map((c) => (c.align === 'right' ? 'minmax(100px,1fr)' : 'minmax(140px,1.4fr)'))
    .join(' '),
);

const printReport = () => window.print();

function exportCsv() {
  const rep = data.value;
  if (!rep) return;
  const rows = [...rep.rows, ...(rep.totals ? [rep.totals] : [])].map((row) =>
    rep.columns.map((c) => row[c.key] ?? ''),
  );
  downloadCsv(
    `${rep.id}-${rep.filters.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
    rep.columns.map((c) => c.label),
    rows as (string | number)[][],
  );
}
</script>

<template>
  <PageHeader
    :title="data?.title ?? 'Report'"
    :description="data ? `${data.description} ${data.filters}` : undefined"
  >
    <template #actions>
      <Button variant="outline" class="print:hidden" :disabled="!data" @click="exportCsv"
        ><DownloadIcon class="size-4" /> Export CSV</Button
      >
      <Button variant="outline" class="print:hidden" :disabled="!data" @click="printReport"
        ><PrinterIcon class="size-4" /> Print</Button
      >
    </template>
  </PageHeader>

  <div class="flex flex-wrap items-center gap-3 print:hidden">
    <TabNav :tabs="tabs" label="Finance reports" class="min-w-0 flex-1" />
    <label v-if="usesTerm" class="flex items-center gap-2 text-[13px]">
      <span class="text-muted-foreground">Term</span>
      <select v-model="selectedTerm" class="h-9 rounded-md border bg-card px-2.5 text-sm">
        <option v-for="t in termOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </label>
  </div>

  <p v-if="isError" class="text-[13px] text-error-strong">This report couldn’t load. Try again.</p>
  <Skeleton v-else-if="isPending" class="h-72 rounded-lg" />
  <div v-else-if="data" class="overflow-hidden rounded-lg border bg-card">
    <div class="overflow-x-auto">
      <div role="table" :aria-label="data.title" class="min-w-[720px] text-[13px]">
        <div
          role="row"
          class="grid gap-x-3.5 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"
          :style="{ gridTemplateColumns: gridCols }"
        >
          <span
            v-for="c in data.columns"
            :key="c.key"
            role="columnheader"
            :class="c.align === 'right' && 'text-right'"
            >{{ c.label }}</span
          >
        </div>
        <div
          v-for="(row, i) in data.rows"
          :key="i"
          role="row"
          class="grid gap-x-3.5 border-t border-divider px-4 py-2.5"
          :style="{ gridTemplateColumns: gridCols }"
        >
          <span
            v-for="c in data.columns"
            :key="c.key"
            role="cell"
            :class="
              cn(
                'min-w-0 break-words',
                c.align === 'right' && 'text-right tabular-nums',
                c.percent && 'font-semibold',
                negative(c, row[c.key]) && 'text-error-strong',
              )
            "
            >{{ show(c, row[c.key]) }}</span
          >
        </div>
        <p v-if="!data.rows.length" class="border-t px-4 py-7 text-muted-foreground">
          Nothing to report for these filters.
        </p>
        <div
          v-if="data.totals && data.rows.length"
          role="row"
          class="grid gap-x-3.5 border-t-2 bg-muted px-4 py-2.5 font-semibold"
          :style="{ gridTemplateColumns: gridCols }"
        >
          <span
            v-for="c in data.columns"
            :key="c.key"
            role="cell"
            :class="
              cn(
                'min-w-0',
                c.align === 'right' && 'text-right tabular-nums',
                negative(c, data.totals[c.key]) && 'text-error-strong',
              )
            "
            >{{ data.totals[c.key] === '' ? '' : show(c, data.totals[c.key]) }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
