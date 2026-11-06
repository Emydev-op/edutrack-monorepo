<script setup lang="ts">
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { cn } from '@edutrack/ui/lib/utils';
import { CheckIcon, MinusIcon } from '@lucide/vue';

import {
  PERMISSION_AREAS,
  PERMISSIONS,
  type Permission,
  type PermissionArea,
  type PermissionSet,
} from '@/types';

const props = defineProps<{ readonly?: boolean }>();
const model = defineModel<PermissionSet>({ required: true });

const has = (area: PermissionArea, p: Permission) => (model.value[area] ?? []).includes(p);
function toggle(area: PermissionArea, p: Permission) {
  if (props.readonly) return;
  const current = model.value[area] ?? [];
  model.value = {
    ...model.value,
    [area]: has(area, p) ? current.filter((x) => x !== p) : [...current, p],
  };
}

/**
 * One grid for the whole table (rows use `display: contents`), so each column is as wide as its
 * widest cell — never narrower than its heading — and every row lines up. When the space is
 * narrower than that, the table scrolls sideways instead of overlapping.
 */
const grid = {
  gridTemplateColumns: `minmax(max-content, 1.4fr) repeat(${PERMISSIONS.length}, minmax(max-content, 1fr))`,
};
const cell = (col: number, extra?: string) =>
  cn('px-1 py-2', col === 0 && 'pl-4', col === PERMISSIONS.length && 'pr-4', extra);
</script>

<template>
  <div class="overflow-x-auto rounded-lg border bg-card">
    <div role="table" aria-label="Permissions" class="grid min-w-full" :style="grid">
      <div role="row" class="contents text-xs font-medium whitespace-nowrap text-muted-foreground">
        <span role="columnheader" :class="cell(0, 'bg-muted')">Area</span>
        <span
          v-for="(p, i) in PERMISSIONS"
          :key="p"
          role="columnheader"
          :class="cell(i + 1, 'bg-muted text-center')"
          >{{ p }}</span
        >
      </div>
      <div v-for="area in PERMISSION_AREAS" :key="area" role="row" class="contents text-[13px]">
        <span
          role="rowheader"
          :class="
            cell(0, 'flex items-center border-t border-divider font-medium whitespace-nowrap')
          "
          >{{ area }}</span
        >
        <span
          v-for="(p, i) in PERMISSIONS"
          :key="p"
          role="cell"
          :class="cell(i + 1, 'flex items-center justify-center border-t border-divider')"
        >
          <template v-if="readonly">
            <CheckIcon
              v-if="has(area, p)"
              class="size-4 text-success-strong"
              :stroke-width="2.6"
              :aria-label="`${area} ${p}: allowed`"
            />
            <MinusIcon
              v-else
              class="size-4 text-[#B8B2A9]"
              :aria-label="`${area} ${p}: not allowed`"
            />
          </template>
          <Checkbox
            v-else
            :model-value="has(area, p)"
            :aria-label="`${area} ${p}`"
            @update:model-value="toggle(area, p)"
          />
        </span>
      </div>
    </div>
  </div>
</template>
