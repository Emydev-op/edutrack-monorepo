<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';

import { MODULE_GROUPS, PLAN_MODULES } from '@/config/plan-modules';
import { formatCount, formatNaira } from '@edutrack/app-kit/lib/format';
import type { PlanDefinition, PlanStatus, PlanVersion } from '@/types';

import { limitText, PLAN_LIMITS, PLAN_STATUS_TONE, priceText } from '../plan-format';

const props = defineProps<{
  plan: PlanDefinition;
  status: PlanStatus;
  warnings: string[];
  changes: [string, string][];
  history: PlanVersion[];
}>();

const lines = computed(() => {
  const p = props.plan;
  return [
    ['Price', priceText(p.pricing)],
    ...(p.trialDays ? [['Trial', `${p.trialDays} days`]] : []),
    ...(p.setupFee ? [['Setup fee', formatNaira(p.setupFee)]] : []),
    ...PLAN_LIMITS.map(({ key, label }) => [label, limitText(p, key)]),
    [
      'SMS credits',
      p.modules.includes('sms') ? `${formatCount(p.smsCreditsPerTerm)} / term` : 'Off',
    ],
    ['Support', p.support],
  ];
});

const moduleCounts = computed(() =>
  MODULE_GROUPS.filter((g) => g !== 'Coming soon').map((group) => {
    const list = PLAN_MODULES.filter((m) => m.group === group && !m.comingSoon);
    const on = list.filter((m) => m.core || props.plan.modules.includes(m.id)).length;
    return { group, count: `${on} / ${list.length}` };
  }),
);
</script>

<template>
  <aside class="flex flex-col gap-3 lg:sticky lg:top-[72px]" aria-label="Plan summary">
    <div class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
      <div class="flex items-start justify-between gap-2.5">
        <span class="min-w-0 text-base font-semibold break-words">{{
          plan.name || 'Untitled plan'
        }}</span>
        <StatusBadge :label="status" :tone="PLAN_STATUS_TONE[status]" class="shrink-0" />
      </div>
      <dl class="flex flex-col gap-1.5 text-[13px]">
        <div v-for="[label, value] in lines" :key="label" class="flex justify-between gap-3">
          <dt class="text-faint">{{ label }}</dt>
          <dd class="text-right font-medium">{{ value }}</dd>
        </div>
      </dl>
      <div class="flex flex-col gap-1.5 border-t border-divider pt-2.5 text-[13px]">
        <span class="text-xs font-semibold text-muted-foreground">Modules</span>
        <div v-for="m in moduleCounts" :key="m.group" class="flex justify-between">
          <span>{{ m.group }}</span>
          <span class="text-body tabular-nums">{{ m.count }}</span>
        </div>
      </div>
      <ul v-if="warnings.length" class="flex flex-col gap-1.5" aria-label="Warnings">
        <li
          v-for="w in warnings"
          :key="w"
          class="flex gap-2 rounded-md bg-warning-subtle px-2.5 py-2 text-xs text-warning-strong"
        >
          <TriangleAlertIcon class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ w }}
        </li>
      </ul>
      <div
        v-if="changes.length"
        class="flex flex-col gap-1.5 border-t border-divider pt-2.5 text-xs"
        aria-live="polite"
      >
        <span class="font-semibold text-muted-foreground">Unsaved changes</span>
        <span v-for="[label, value] in changes" :key="label"
          ><span class="text-faint">{{ label }}: </span>{{ value }}</span
        >
      </div>
      <div class="flex flex-col gap-2 pt-1"><slot name="actions" /></div>
    </div>

    <div
      v-if="history.length"
      class="flex flex-col gap-2 rounded-lg border bg-card px-4.5 py-3.5 text-xs"
    >
      <span class="font-semibold text-muted-foreground">Version history</span>
      <div
        v-for="h in history.slice(0, 4)"
        :key="`${h.version}-${h.summary}`"
        class="flex flex-col"
      >
        <span class="text-faint">v{{ h.version }} · {{ h.at }}</span>
        <span>{{ h.summary }} · {{ h.by }}</span>
      </div>
    </div>
  </aside>
</template>
