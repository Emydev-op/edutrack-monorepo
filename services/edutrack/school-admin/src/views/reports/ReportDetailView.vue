<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  PrinterIcon,
  RotateCcwIcon,
} from '@lucide/vue';
import { isAxiosError } from 'axios';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TablePagination from '@edutrack/app-kit/components/common/TablePagination.vue';
import { downloadCsv } from '@edutrack/app-kit/lib/csv';

import { useReportCatalogQuery, useSchoolReportQuery } from '@/api/services/reports';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { useLayoutStore } from '@/stores/layout';
import type { ReportColumn, ReportFilter, ReportFilterKey, ReportRow } from '@/types';

import { compareCells, csvCell, fileNameFor, showCell } from './report-groups';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const context = useContextStore();
const layout = useLayoutStore();

const FILTER_KEYS: ReportFilterKey[] = ['term', 'section', 'status', 'from', 'to'];
const id = computed(() => String(route.params.id));
const queryValue = (key: string) => {
  const raw = route.query[key];
  return String((Array.isArray(raw) ? raw[0] : raw) ?? '');
};

const params = computed(() => ({
  branch: context.current.branch,
  session: context.current.session,
  term: queryValue('term') || context.current.term,
  section: queryValue('section'),
  status: queryValue('status'),
  from: queryValue('from'),
  to: queryValue('to'),
}));

const { data: catalog } = useReportCatalogQuery();
const { data, error, isPending, isFetching, refetch } = useSchoolReportQuery(id, params);

const notFound = computed(() => isAxiosError(error.value) && error.value.response?.status === 404);
const badFilter = computed(() =>
  isAxiosError(error.value) && error.value.response?.status === 422 ? error.value.message : '',
);
/** Shown while the last good report stays on screen (e.g. a date filter that isn't valid). */
const report = computed(() => (data.value?.id === id.value ? data.value : undefined));
watch(report, (r) => layout.setRecordLabel(r?.title ?? null), { immediate: true });

function setFilter(key: ReportFilterKey, value: string) {
  void router.replace({ query: { ...route.query, [key]: value || undefined } });
}
const hasFilters = computed(() => FILTER_KEYS.some((k) => queryValue(k)));
function resetFilters() {
  const query = { ...route.query };
  for (const k of FILTER_KEYS) delete query[k];
  void router.replace({ query });
}

/* ---------------- Sorting and paging (on screen; CSV and print use every row) ---------------- */

const sort = ref<{ key: string; dir: 'asc' | 'desc' } | null>(null);
const page = ref(1);
const pageSize = ref(20);
watch([id, params], () => {
  page.value = 1;
});
watch(id, () => {
  sort.value = null;
});

function toggleSort(col: ReportColumn) {
  const cur = sort.value;
  sort.value =
    cur?.key !== col.key
      ? { key: col.key, dir: col.align === 'right' ? 'desc' : 'asc' }
      : cur.dir === (col.align === 'right' ? 'desc' : 'asc')
        ? { key: col.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : null;
  page.value = 1;
}
const sortLabel = (col: ReportColumn) =>
  sort.value?.key !== col.key ? 'none' : sort.value.dir === 'asc' ? 'ascending' : 'descending';

const sortedRows = computed<ReportRow[]>(() => {
  const rows = report.value?.rows ?? [];
  const s = sort.value;
  if (!s) return rows;
  const dir = s.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const c = compareCells(a.cells[s.key], b.cells[s.key]);
    // Empty values stay last whichever way the column is sorted.
    const emptyA = a.cells[s.key] === null || a.cells[s.key] === '';
    const emptyB = b.cells[s.key] === null || b.cells[s.key] === '';
    return emptyA || emptyB ? c : c * dir;
  });
});
const meta = computed(() => {
  const total = sortedRows.value.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize.value));
  return { page: Math.min(page.value, totalPages), pageSize: pageSize.value, total, totalPages };
});
const pageRows = computed(() =>
  sortedRows.value.slice((meta.value.page - 1) * pageSize.value, meta.value.page * pageSize.value),
);
function setPageSize(size: number) {
  pageSize.value = size;
  page.value = 1;
}

const gridCols = computed(() =>
  (report.value?.columns ?? [])
    .map((c) => (c.align === 'right' ? 'minmax(84px,0.8fr)' : 'minmax(140px,1.5fr)'))
    .join(' '),
);
const minWidth = computed(() => `${Math.max(640, (report.value?.columns.length ?? 0) * 110)}px`);
const negative = (col: ReportColumn, value: unknown) =>
  !!col.money && typeof value === 'number' && value < 0;

function exportCsv() {
  const rep = report.value;
  if (!rep) return;
  const rows = [...sortedRows.value.map((r) => r.cells), ...(rep.totals ? [rep.totals] : [])].map(
    (cells) => rep.columns.map((c) => csvCell(cells[c.key])),
  );
  downloadCsv(
    fileNameFor(rep.title, rep.scope),
    rep.columns.map((c) => (c.money ? `${c.label} (NGN)` : c.percent ? `${c.label} (%)` : c.label)),
    rows,
  );
}
const printReport = () => window.print();

const others = computed(() =>
  (catalog.value?.groups ?? []).map((g) => ({
    name: g.name,
    reports: g.reports.map((r) => ({ ...r, active: r.id === id.value })),
  })),
);
const filterId = (f: ReportFilter) => `report-filter-${f.key}`;
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[220px_1fr] [&>*]:min-w-0">
    <nav aria-label="Reports" class="hidden flex-col gap-4 lg:flex print:hidden">
      <div v-for="g in others" :key="g.name" class="flex flex-col gap-1">
        <span class="px-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">{{
          g.name
        }}</span>
        <RouterLink
          v-for="r in g.reports"
          :key="r.id"
          :to="{ name: routesPath.reportDetail.name, params: { id: r.id } }"
          :aria-current="r.active ? 'page' : undefined"
          :class="
            cn(
              'rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted',
              r.active && 'bg-brand-subtle font-medium text-brand-strong hover:bg-brand-subtle',
            )
          "
          >{{ r.title }}</RouterLink
        >
      </div>
    </nav>

    <div class="flex min-w-0 flex-col gap-4">
      <div v-if="notFound" class="flex flex-col items-start gap-3">
        <EmptyState
          title="This report doesn’t exist"
          description="It may have been renamed. Pick a report from the list."
        />
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: routesPath.reports.name }">All reports</RouterLink>
        </Button>
      </div>

      <template v-else>
        <PageHeader
          :title="report?.title ?? 'Report'"
          :description="report?.description"
          class="print:hidden"
        >
          <template #actions>
            <Button
              variant="outline"
              :disabled="!report || !!report.blocked || !report.rows.length"
              @click="exportCsv"
              ><DownloadIcon class="size-4" /> Export CSV</Button
            >
            <Button variant="outline" :disabled="!report || !!report.blocked" @click="printReport"
              ><PrinterIcon class="size-4" /> Print / PDF</Button
            >
          </template>
        </PageHeader>

        <!-- Print heading: school, report, scope and when it was produced. -->
        <header v-if="report" class="hidden flex-col gap-0.5 print:flex">
          <span class="text-xs text-muted-foreground">{{ auth.school?.name }}</span>
          <h1 class="text-xl font-semibold">{{ report.title }}</h1>
          <span class="text-xs">{{ report.scope }} · Generated {{ report.generatedAt }}</span>
        </header>

        <InlineNotice
          v-if="error && !notFound && !badFilter"
          tone="error"
          title="This report couldn’t load"
          description="Your records are safe. Check your connection and try again."
        >
          <template #action>
            <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
          </template>
        </InlineNotice>

        <InlineNotice
          v-if="badFilter && !report"
          tone="warning"
          title="These filters can’t be used"
          :description="badFilter"
        >
          <template #action>
            <Button variant="outline" size="sm" @click="resetFilters">Reset filters</Button>
          </template>
        </InlineNotice>

        <Skeleton v-if="isPending && !report && !error" class="h-80 rounded-lg" />

        <template v-else-if="report">
          <div v-if="report.blocked" class="flex flex-col items-start gap-3">
            <EmptyState :title="report.blocked.title" :description="report.blocked.message" />
            <Button as-child
              ><RouterLink :to="report.blocked.action.to">{{
                report.blocked.action.label
              }}</RouterLink></Button
            >
          </div>

          <template v-else>
            <div
              v-if="report.filters.length"
              class="flex flex-wrap items-end gap-3 rounded-lg border bg-card px-4 py-3 print:hidden"
              role="group"
              aria-label="Report filters"
            >
              <label
                v-for="f in report.filters"
                :key="f.key"
                :for="filterId(f)"
                class="flex flex-col gap-1 text-xs text-muted-foreground"
              >
                {{ f.label }}
                <select
                  v-if="f.kind === 'select'"
                  :id="filterId(f)"
                  :value="f.value"
                  class="h-9 min-w-40 rounded-md border bg-card px-2.5 text-sm text-foreground"
                  @change="setFilter(f.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="o in f.options" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
                <input
                  v-else
                  :id="filterId(f)"
                  type="date"
                  :value="queryValue(f.key) || f.value"
                  class="h-9 rounded-md border bg-card px-2.5 text-sm text-foreground"
                  @change="setFilter(f.key, ($event.target as HTMLInputElement).value)"
                />
              </label>
              <Button
                v-if="hasFilters"
                variant="ghost"
                size="sm"
                class="mb-0.5"
                @click="resetFilters"
                ><RotateCcwIcon class="size-3.5" /> Reset</Button
              >
            </div>
            <p v-if="badFilter" role="alert" class="text-[13px] text-error-strong print:hidden">
              {{ badFilter }} Showing the last valid results.
            </p>

            <p class="text-xs text-muted-foreground print:hidden" aria-live="polite">
              {{ report.scope }} · Generated {{ report.generatedAt }}
              <span v-if="isFetching"> · Updating…</span>
            </p>

            <MetricGrid v-if="report.metrics.length">
              <MetricCard
                v-for="m in report.metrics"
                :key="m.label"
                :label="m.label"
                :value="m.value"
                :hint="m.hint"
                :hint-tone="m.hintTone"
              />
            </MetricGrid>

            <div class="overflow-hidden rounded-lg border bg-card print:overflow-visible">
              <div class="overflow-x-auto print:overflow-visible">
                <div
                  role="table"
                  :aria-label="report.title"
                  :aria-rowcount="report.rows.length + 1"
                  class="text-[13px] print:min-w-0!"
                  :style="{ minWidth }"
                >
                  <div
                    role="row"
                    class="grid gap-x-3 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"
                    :style="{ gridTemplateColumns: gridCols }"
                  >
                    <span
                      v-for="c in report.columns"
                      :key="c.key"
                      role="columnheader"
                      :aria-sort="sortLabel(c)"
                      :class="c.align === 'right' && 'text-right'"
                    >
                      <button
                        type="button"
                        :class="
                          cn(
                            'inline-flex items-center gap-1 hover:text-foreground print:pointer-events-none',
                            c.align === 'right' && 'flex-row-reverse',
                          )
                        "
                        @click="toggleSort(c)"
                      >
                        {{ c.label }}
                        <ArrowUpIcon
                          v-if="sort?.key === c.key && sort.dir === 'asc'"
                          class="size-3 print:hidden"
                        />
                        <ArrowDownIcon
                          v-else-if="sort?.key === c.key"
                          class="size-3 print:hidden"
                        />
                        <ChevronsUpDownIcon v-else class="size-3 opacity-40 print:hidden" />
                      </button>
                    </span>
                  </div>

                  <!-- On screen: one page of rows. In print: every row. -->
                  <template v-for="(set, si) in [pageRows, sortedRows]" :key="si">
                    <div :class="si === 0 ? 'print:hidden' : 'hidden print:block'">
                      <div
                        v-for="(row, i) in set"
                        :key="i"
                        role="row"
                        class="grid gap-x-3 border-t border-divider px-4 py-2.5 break-inside-avoid"
                        :style="{ gridTemplateColumns: gridCols }"
                      >
                        <span
                          v-for="(c, ci) in report.columns"
                          :key="c.key"
                          role="cell"
                          :class="
                            cn(
                              'min-w-0 break-words',
                              c.align === 'right' && 'text-right tabular-nums',
                              negative(c, row.cells[c.key]) && 'text-error-strong',
                            )
                          "
                        >
                          <RouterLink
                            v-if="ci === 0 && row.to"
                            :to="row.to"
                            class="font-medium text-primary hover:underline print:text-foreground print:no-underline"
                            >{{ showCell(c, row.cells[c.key]) }}</RouterLink
                          >
                          <template v-else>{{ showCell(c, row.cells[c.key]) }}</template>
                        </span>
                      </div>
                    </div>
                  </template>

                  <p v-if="!report.rows.length" class="border-t px-4 py-7 text-muted-foreground">
                    {{ report.emptyText }}
                  </p>

                  <div
                    v-if="report.totals && report.rows.length"
                    role="row"
                    class="grid gap-x-3 border-t-2 bg-muted px-4 py-2.5 font-semibold"
                    :style="{ gridTemplateColumns: gridCols }"
                  >
                    <span
                      v-for="c in report.columns"
                      :key="c.key"
                      role="cell"
                      :class="
                        cn(
                          'min-w-0',
                          c.align === 'right' && 'text-right tabular-nums',
                          negative(c, report.totals[c.key]) && 'text-error-strong',
                        )
                      "
                      >{{
                        report.totals[c.key] === '' ? '' : showCell(c, report.totals[c.key])
                      }}</span
                    >
                  </div>
                </div>
              </div>
              <div v-if="meta.total > 10" class="border-t border-divider print:hidden">
                <TablePagination
                  :meta="meta"
                  @update:page="page = $event"
                  @update:page-size="setPageSize"
                />
              </div>
            </div>

            <p v-if="report.note" class="text-xs text-muted-foreground">{{ report.note }}</p>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>
