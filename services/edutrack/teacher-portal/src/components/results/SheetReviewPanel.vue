<script setup lang="ts">
import { CircleAlertIcon, CircleCheckIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import type { SheetStats } from '@/types';

import type { Blocker } from './useScoreEntry';

/**
 * A sheet's figures before it's submitted (or reviewed): counts, grade distribution, class
 * average / highest / lowest, and what still blocks submitting, by student, with "Fix" links.
 */
const props = defineProps<{
  stats: SheetStats;
  passMark: number;
  /** "WAEC (A1–F9)" */
  scaleName?: string;
  blockers?: Blocker[];
  /** Where each blocker's "Fix" goes; no links when omitted (read-only views). */
  fixTo?: (b: Blocker) => RouteLocationRaw;
}>();

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const graded = computed(() => props.stats.distribution.reduce((n, d) => n + d.count, 0));
const byStudent = computed(() => {
  const out = new Map<string, { name: string; items: Blocker[] }>();
  for (const b of props.blockers ?? []) {
    const row = out.get(b.studentId) ?? { name: b.name, items: [] };
    row.items.push(b);
    out.set(b.studentId, row);
  }
  return [...out.entries()].map(([id, v]) => ({ id, ...v }));
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <MetricGrid>
      <MetricCard label="Students" :value="stats.count" />
      <MetricCard
        label="Complete"
        :value="stats.complete"
        :hint="
          stats.count ? `${Math.round((stats.complete / stats.count) * 100)}% of the class` : ''
        "
        :hint-tone="stats.complete === stats.count ? 'success' : 'neutral'"
      />
      <MetricCard
        label="Missing"
        :value="stats.missing"
        :hint="stats.missing ? 'Blocks submitting' : 'None'"
        :hint-tone="stats.missing ? 'error' : 'success'"
      />
      <MetricCard
        label="Absent (ABS)"
        :value="stats.absent"
        :hint="stats.absent ? 'No total · make-up needed' : ''"
        :hint-tone="stats.absent ? 'warning' : undefined"
      />
      <MetricCard
        label="Exempt (EXM)"
        :value="stats.exempt"
        :hint="stats.exempt ? 'Weights re-spread' : ''"
      />
    </MetricGrid>

    <div class="grid gap-4 md:grid-cols-[1fr_1.4fr]">
      <SectionCard
        title="Class figures"
        description="From totals only: ABS and missing rows are left out."
      >
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
          <dt class="text-faint">Class average</dt>
          <dd class="font-semibold tabular-nums">{{ pct(stats.average) }}</dd>
          <dt class="text-faint">Highest</dt>
          <dd class="tabular-nums">{{ pct(stats.highest) }}</dd>
          <dt class="text-faint">Lowest</dt>
          <dd class="tabular-nums">{{ pct(stats.lowest) }}</dd>
          <dt class="text-faint">Passed (≥ {{ passMark }})</dt>
          <dd class="tabular-nums">{{ stats.passed }} of {{ graded }}</dd>
        </dl>
      </SectionCard>
      <SectionCard
        title="Grade distribution"
        :description="scaleName ? `${scaleName} · ${graded} with a total` : undefined"
      >
        <div class="flex flex-col gap-1.5">
          <MeterRow
            v-for="d in stats.distribution"
            :key="d.grade"
            :label="`${d.grade} · ${d.remark}`"
            label-width="minmax(0,120px)"
            value-width="40px"
            :percent="graded ? (d.count / graded) * 100 : 0"
            :value="String(d.count)"
            :color="d.count ? 'var(--primary)' : 'transparent'"
          />
        </div>
      </SectionCard>
    </div>

    <SectionCard
      v-if="blockers"
      title="Before you submit"
      :description="
        blockers.length
          ? `${byStudent.length} student${byStudent.length === 1 ? '' : 's'} to fix. A blank is missing, not zero: enter ABS for absent or EXM for exempt.`
          : undefined
      "
      flush
    >
      <p
        v-if="!blockers.length"
        class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-success-strong"
      >
        <CircleCheckIcon class="size-4" /> Every score is in. Nothing blocks submitting.
      </p>
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li
          v-for="s in byStudent"
          :key="s.id"
          class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]"
        >
          <span class="flex min-w-0 items-start gap-2">
            <CircleAlertIcon class="mt-0.5 size-4 shrink-0 text-error-strong" />
            <span class="flex min-w-0 flex-col">
              <span class="font-medium">{{ s.name }}</span>
              <span
                v-for="b in s.items"
                :key="b.focus + b.kind"
                class="text-xs text-error-strong"
                >{{ b.message }}</span
              >
            </span>
          </span>
          <RouterLink
            v-if="fixTo"
            :to="fixTo(s.items[0]!)"
            class="text-[13px] font-medium text-primary hover:underline"
            >Fix<span class="sr-only"> {{ s.name }}’s scores</span></RouterLink
          >
        </li>
      </ul>
    </SectionCard>
  </div>
</template>
