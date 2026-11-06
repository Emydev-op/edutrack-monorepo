<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';

export interface KeyValueRow {
  label: string;
  value: string | number | null | undefined;
  /** Highlights a value that needs attention. */
  emphasis?: 'error' | 'strong' | 'success';
}

defineProps<{ title: string; rows: KeyValueRow[]; status?: string; footer?: string }>();
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-[15px] font-semibold">{{ title }}</h2>
      <StatusBadge v-if="status" :label="status" />
      <slot name="action" />
    </header>
    <dl class="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
      <template v-for="row in rows" :key="row.label">
        <dt class="text-faint truncate">{{ row.label }}</dt>
        <dd
          :class="
            cn(
              row.emphasis === 'error' && 'font-medium text-error-strong',
              row.emphasis === 'strong' && 'font-semibold',
              row.emphasis === 'success' && 'font-medium text-success-strong',
            )
          "
        >
          {{ row.value === null || row.value === undefined || row.value === '' ? '—' : row.value }}
        </dd>
      </template>
    </dl>
    <p v-if="footer" class="text-xs text-faint">{{ footer }}</p>
  </section>
</template>
