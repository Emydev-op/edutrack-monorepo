<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useRolesQuery } from '@/api/services/school';
import { ACTION_LABELS, PERMISSION_MODULES } from '@/config/permissions';

/** The roles most schools compare, in the design's order. */
const COLUMNS = [
  'School Admin',
  'Principal',
  'Academic Head',
  'HOD',
  'Teacher',
  'Bursar',
  'Inventory Officer',
];

const { data: roles, isPending } = useRolesQuery();
const shown = computed(() =>
  COLUMNS.map((n) => roles.value?.find((r) => r.name === n)).filter((r) => !!r),
);
const grid = computed(() => ({
  gridTemplateColumns: `minmax(180px,1.4fr) repeat(${shown.value.length}, minmax(112px,1fr))`,
}));
</script>

<template>
  <InlineNotice
    tone="info"
    title="No role can delete students"
    description="Students are archived, transferred, withdrawn or graduated, so their records are kept. Each cell shows where a role applies the permission."
  />
  <Skeleton v-if="isPending" class="h-96" />
  <div v-else class="overflow-x-auto rounded-lg border bg-card">
    <div role="table" aria-label="Permissions by role" class="grid min-w-full" :style="grid">
      <div role="row" class="contents text-xs font-medium text-muted-foreground">
        <span role="columnheader" class="bg-muted px-4 py-2">Permission</span>
        <span
          v-for="r in shown"
          :key="r.id"
          role="columnheader"
          class="bg-muted px-1.5 py-2 text-center"
          >{{ r.name }}</span
        >
      </div>
      <template v-for="m in PERMISSION_MODULES" :key="m.key">
        <div role="row" class="contents">
          <span
            role="rowheader"
            class="col-span-full border-t bg-surface-warm px-4 py-1.5 text-xs font-semibold"
            >{{ m.label }}</span
          >
        </div>
        <div v-for="a in m.actions" :key="a" role="row" class="contents text-[13px]">
          <span role="rowheader" class="border-t border-divider px-4 py-1.5">{{
            ACTION_LABELS[a]
          }}</span>
          <span
            v-for="r in shown"
            :key="r.id"
            role="cell"
            class="flex items-center justify-center border-t border-divider px-1.5 py-1.5"
          >
            <span
              v-if="r.permissions[m.key]?.includes(a)"
              class="rounded-sm bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-brand-strong"
              >{{ r.scope }}</span
            >
            <span v-else class="text-[#B8B2A9]" :aria-label="`${r.name}: not allowed`">—</span>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
