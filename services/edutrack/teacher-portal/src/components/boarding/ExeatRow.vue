<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { routesPath as r } from '@/router/routes-path';
import type { Exeat } from '@/types';

import { exeatBadge } from './boarding-format';

/** One exeat in a list: the boarder, kind, dates and status, with actions in the slot. */
const props = defineProps<{ exeat: Exeat; link?: boolean }>();
const badge = computed(() => exeatBadge(props.exeat));
const place = computed(() =>
  [props.exeat.student.hostel, props.exeat.student.room].filter(Boolean).join(' · '),
);
</script>

<template>
  <li class="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink
          v-if="link !== false"
          :to="{ name: r.boarding.exeat.name, params: { id: exeat.id } }"
          class="text-[14px] font-medium hover:underline"
          >{{ exeat.student.name }}</RouterLink
        >
        <span v-else class="text-[14px] font-medium">{{ exeat.student.name }}</span>
        <StatusBadge :label="badge.label" :tone="badge.tone" />
        <StatusBadge :label="exeat.kind" tone="neutral" :dot="false" />
      </div>
      <span class="text-xs text-muted-foreground"
        >{{ exeat.student.className }}{{ place ? ` · ${place}` : '' }}</span
      >
      <span class="text-[13px]"
        >{{ exeat.leaves }} → {{ exeat.returns }}
        <span v-if="exeat.collectedBy" class="text-xs text-muted-foreground">
          · collected by {{ exeat.collectedBy }}</span
        >
        <span v-else-if="exeat.pickup" class="text-xs text-muted-foreground">
          · pickup: {{ exeat.pickup.name }} ({{ exeat.pickup.relationship }})</span
        >
      </span>
      <span v-if="exeat.status === 'Requested'" class="text-xs text-faint"
        >Requested by {{ exeat.requestedByName ?? exeat.requestedBy
        }}{{ exeat.reason ? ` · “${exeat.reason}”` : '' }}</span
      >
    </div>
    <div v-if="$slots.default" class="flex shrink-0 flex-wrap gap-2">
      <slot />
    </div>
  </li>
</template>
