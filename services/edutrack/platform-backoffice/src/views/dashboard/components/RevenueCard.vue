<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { useRevenueQuery } from '@/api/services/dashboard';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { formatNairaMillions } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import type { RevenueRange } from '@/types';

const SERIES = [
  { key: 'renewals', label: 'Renewals', color: 'var(--chart-1)' },
  { key: 'newSchools', label: 'New schools', color: 'var(--chart-2)' },
  { key: 'upgrades', label: 'Upgrades & add-ons', color: 'var(--chart-3)' },
] as const;
const RANGES: { value: RevenueRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
];
const HEIGHT = 180;

const range = ref<RevenueRange>('30d');
const hovered = ref<number | null>(null);
const { data: report, isPending } = useRevenueQuery(range);

const delta = computed(() => {
  if (!report.value) return 0;
  return ((report.value.total - report.value.previousTotal) / report.value.previousTotal) * 100;
});

const chart = computed(() => {
  const points = report.value?.points ?? [];
  const totals = points.map((p) => p.renewals + p.newSchools + p.upgrades);
  const top = Math.max(1, ...totals, ...points.map((p) => p.previous)) * 1.15;
  const step = top > 40 ? 10 : top > 16 ? 5 : top > 6 ? 2 : 1;
  const max = Math.ceil(top / step) * step;
  const pct = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
  const average = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
  const bestIndex = totals.indexOf(Math.max(...totals));
  const mix = SERIES.map((s) => ({ ...s, value: points.reduce((sum, p) => sum + p[s.key], 0) }));
  const mixTotal = mix.reduce((a, m) => a + m.value, 0) || 1;
  return {
    pct,
    grid: Array.from({ length: Math.round(max / step) + 1 }, (_, k) => k * step).reverse(),
    average,
    best: points[bestIndex] ? { label: points[bestIndex]!.label, value: totals[bestIndex]! } : null,
    columns: points.map((p, i) => ({ ...p, total: totals[i]! })),
    mix: mix.map((m) => ({ ...m, share: (m.value / mixTotal) * 100 })),
  };
});

const tooltip = computed(() => {
  if (hovered.value === null) return null;
  const col = chart.value.columns[hovered.value];
  if (!col) return null;
  const change = ((col.total - col.previous) / col.previous) * 100;
  return {
    left: `${((hovered.value + 0.5) / chart.value.columns.length) * 100}%`,
    col,
    change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
  };
});

const stats = computed(() => {
  const s = report.value?.stats;
  if (!s) return [];
  const to = (status?: string) => ({
    name: routesPath.subscriptions.name,
    query: status ? { status } : {},
  });
  return [
    { label: 'Active subscriptions', value: String(s.activeSubscriptions), to: to('Active') },
    { label: 'Renewals in period', value: String(s.renewals), to: to() },
    { label: 'Overdue', value: `${s.overdue} · ${s.overdueAmount}`, to: to('Grace period') },
    { label: 'Expiring in 30 days', value: String(s.expiringSoon), to: to('Expiring') },
  ];
});
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col">
        <h2 class="text-[15px] font-semibold">Subscription revenue</h2>
        <p class="text-xs text-muted-foreground">
          {{ report?.label ?? 'Loading' }} · collected, VAT exclusive
        </p>
      </div>
      <SegmentedControl v-model="range" :options="RANGES" label="Revenue range" />
    </div>

    <Skeleton v-if="isPending" class="h-[300px] w-full" />
    <template v-else-if="report">
      <div class="flex items-baseline gap-3">
        <span class="text-[28px] font-semibold">{{ formatNairaMillions(report.total) }}</span>
        <span
          class="text-[13px] font-semibold"
          :class="delta >= 0 ? 'text-success-strong' : 'text-error-strong'"
        >
          {{ delta >= 0 ? '+' : '' }}{{ delta.toFixed(1) }}%
        </span>
        <span class="text-xs text-faint"
          >vs {{ formatNairaMillions(report.previousTotal) }} previous period</span
        >
      </div>

      <ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li v-for="s in SERIES" :key="s.key" class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-[2px]" :style="{ background: s.color }" />{{ s.label }}
        </li>
        <li class="flex items-center gap-1.5">
          <span class="w-3.5 border-t-2 border-dashed border-foreground" />Previous period
        </li>
        <li class="flex items-center gap-1.5">
          <span class="w-3.5 border-t border-dashed border-info" />Period average
        </li>
      </ul>

      <div class="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
        <div class="relative" :style="{ height: `${HEIGHT}px` }" aria-hidden="true">
          <span
            v-for="g in chart.grid"
            :key="g"
            class="absolute right-0 translate-y-1/2 text-[10px] whitespace-nowrap text-faint"
            :style="{ bottom: chart.pct(g) }"
          >
            ₦{{ g }}M
          </span>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5">
          <div
            class="relative"
            :style="{ height: `${HEIGHT}px` }"
            role="img"
            :aria-label="`Revenue by period, ${report.label}. Best ${chart.best?.label}: ${formatNairaMillions(chart.best?.value ?? 0)}.`"
            @mouseleave="hovered = null"
          >
            <div
              v-for="g in chart.grid"
              :key="g"
              class="absolute inset-x-0 border-t border-divider"
              :style="{ bottom: chart.pct(g) }"
            />
            <div
              class="absolute inset-x-0 border-t border-dashed border-info"
              :style="{ bottom: chart.pct(chart.average) }"
            >
              <span class="absolute -top-4 right-0 bg-card px-1 text-[10px] text-info-strong"
                >Avg {{ formatNairaMillions(chart.average) }}</span
              >
            </div>
            <div class="absolute inset-0 flex items-end gap-1.5">
              <div
                v-for="(col, i) in chart.columns"
                :key="col.label"
                class="relative flex h-full flex-1 items-end justify-center transition-opacity"
                :style="{ opacity: hovered === null || hovered === i ? 1 : 0.45 }"
                @mouseenter="hovered = i"
              >
                <div class="flex h-full w-full max-w-10 flex-col-reverse">
                  <div :style="{ height: chart.pct(col.renewals), background: 'var(--chart-1)' }" />
                  <div
                    :style="{ height: chart.pct(col.newSchools), background: 'var(--chart-2)' }"
                  />
                  <div
                    class="rounded-t-[2px]"
                    :style="{ height: chart.pct(col.upgrades), background: 'var(--chart-3)' }"
                  />
                </div>
                <div
                  class="absolute inset-x-[8%] border-t-2 border-dashed border-foreground"
                  :style="{ bottom: chart.pct(col.previous) }"
                />
              </div>
            </div>
            <div
              v-if="tooltip"
              role="tooltip"
              class="pointer-events-none absolute top-0 z-10 flex w-[200px] -translate-x-1/2 flex-col gap-1.5 rounded-md bg-foreground px-3 py-2.5 text-xs text-white shadow-lg"
              :style="{ left: tooltip.left }"
            >
              <span class="flex justify-between font-semibold"
                ><span>{{ tooltip.col.label }}</span
                ><span>{{ formatNairaMillions(tooltip.col.total) }}</span></span
              >
              <span
                v-for="s in SERIES"
                :key="s.key"
                class="flex justify-between gap-2 text-[#E7E3DC]"
              >
                <span class="flex items-center gap-1.5"
                  ><span class="size-2 rounded-[2px]" :style="{ background: s.color }" />{{
                    s.label
                  }}</span
                >
                <span>{{ formatNairaMillions(tooltip.col[s.key]) }}</span>
              </span>
              <span class="flex justify-between border-t border-body pt-1.5 text-[#C9C3BA]">
                <span>Previous period {{ formatNairaMillions(tooltip.col.previous) }}</span>
                <span class="font-semibold text-[#9FD8BC]">{{ tooltip.change }}</span>
              </span>
            </div>
          </div>
          <div class="flex gap-1.5" aria-hidden="true">
            <span
              v-for="col in chart.columns"
              :key="col.label"
              class="flex-1 overflow-hidden text-center text-[10px] whitespace-nowrap text-faint"
              >{{ col.label }}</span
            >
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 border-t border-divider pt-2.5">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span class="font-semibold text-foreground">Revenue mix</span>
          <span v-if="chart.best"
            >Best: {{ chart.best.label }} · {{ formatNairaMillions(chart.best.value) }}</span
          >
        </div>
        <div class="flex h-2 overflow-hidden rounded">
          <div
            v-for="m in chart.mix"
            :key="m.key"
            :style="{ width: `${m.share}%`, background: m.color }"
          />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="m in chart.mix" :key="m.key" class="flex flex-col gap-0.5">
            <span class="text-xs text-muted-foreground">{{ m.label }}</span>
            <span class="text-sm font-semibold">
              {{ formatNairaMillions(m.value) }}
              <span class="text-xs font-normal text-faint">{{ Math.round(m.share) }}%</span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </section>

  <div class="flex flex-col gap-3">
    <nav aria-label="Subscription figures" class="flex flex-col rounded-lg border bg-card">
      <RouterLink
        v-for="s in stats"
        :key="s.label"
        :to="s.to"
        class="flex justify-between border-b border-divider px-4 py-2.75 text-[13px] last:border-b-0 hover:bg-surface-warm"
      >
        <span class="text-muted-foreground">{{ s.label }}</span>
        <span class="font-semibold">{{ s.value }}</span>
      </RouterLink>
    </nav>
    <slot name="aside" />
  </div>
</template>
