<script setup lang="ts" generic="T">
import type { PaginationMeta } from '@edutrack/shared';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { computed } from 'vue';

import type { useSelection } from '@edutrack/app-kit/composables/useSelection';

import RowActions, { type RowAction } from './RowActions.vue';
import TablePagination from './TablePagination.vue';

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** CSS grid track, e.g. `minmax(220px,1.8fr)` or `120px`. Defaults to an equal share. */
  width?: string;
}

const props = withDefaults(
  defineProps<{
    columns: Column[];
    rows: T[];
    rowKey: (row: T) => string;
    title?: string;
    description?: string;
    loading?: boolean;
    emptyText?: string;
    selection?: ReturnType<typeof useSelection<T>>;
    meta?: PaginationMeta;
    /** Lower bound for the table's width; the columns' own minimums usually decide it. */
    minWidth?: string;
    /** Per-row actions, shown in a trailing Action column as a ⋯ menu. */
    actions?: (row: T) => RowAction[];
    /** Accessible name of a row, used to label its action menu. Defaults to the row key. */
    rowLabel?: (row: T) => string;
  }>(),
  { emptyText: 'No records match your search.', minWidth: '0px' },
);

const emit = defineEmits<{ 'update:page': [page: number]; 'update:pageSize': [size: number] }>();

defineSlots<
  { [K in `cell-${string}`]?: (props: { row: T }) => unknown } & {
    /** Search field, placed first in the toolbar. */
    search?: () => unknown;
    /** Filter menus, placed after the search. */
    filters?: () => unknown;
    /** Toolbar buttons such as Export, placed last. */
    toolbar?: () => unknown;
    bulk?: () => unknown;
  }
>();

/** Columns never shrink below this, so content wraps between words instead of being crushed. */
const DEFAULT_COLUMN = 'minmax(120px,1fr)';
const ACTION_TRACK = '72px';
const SELECT_TRACK = '20px';
const GAP = 14;
const PADDING = 32;

const tracks = computed(() => [
  ...(props.selection ? [SELECT_TRACK] : []),
  ...props.columns.map((c) => c.width ?? DEFAULT_COLUMN),
  ...(props.actions ? [ACTION_TRACK] : []),
]);
const grid = computed(() => tracks.value.join(' '));

/** Smallest width the columns fit in. Below it the table scrolls horizontally. */
const tableMinWidth = computed(() => {
  const minOf = (track: string) => Number(/^(?:minmax\()?(\d+)px/.exec(track)?.[1] ?? 120);
  const columnsWidth =
    tracks.value.reduce((sum, t) => sum + minOf(t), 0) + GAP * (tracks.value.length - 1) + PADDING;
  return `max(${columnsWidth}px, ${props.minWidth})`;
});
const valueOf = (row: T, key: string) => {
  const value = (row as Record<string, unknown>)[key];
  return value === null || value === undefined || value === '' ? '—' : String(value);
};
</script>

<template>
  <div class="overflow-hidden rounded-lg border bg-card">
    <div
      v-if="title || $slots.search || $slots.filters || $slots.toolbar"
      class="flex flex-wrap items-center gap-2 border-b px-4 py-3"
    >
      <div v-if="title" class="mr-auto flex min-w-0 flex-col">
        <h2 class="text-[15px] font-semibold">{{ title }}</h2>
        <p v-if="description" class="text-xs text-muted-foreground">{{ description }}</p>
      </div>
      <slot name="search" />
      <div
        v-if="$slots.filters || $slots.toolbar"
        :class="cn('flex flex-wrap items-center gap-2', !title && 'ml-auto')"
      >
        <slot name="filters" />
        <slot name="toolbar" />
      </div>
    </div>

    <div
      v-if="selection && selection.count.value > 0"
      class="flex flex-wrap items-center gap-2.5 bg-brand-subtle px-4 py-2 text-[13px]"
    >
      <span class="font-medium text-brand-strong">{{ selection.count.value }} selected</span>
      <slot name="bulk" />
      <button
        type="button"
        class="ml-auto text-brand-strong hover:underline"
        @click="selection.clear()"
      >
        Clear selection
      </button>
    </div>

    <div class="overflow-x-auto">
      <div
        role="table"
        :aria-label="title"
        :aria-busy="loading"
        :style="{ minWidth: tableMinWidth }"
      >
        <div
          role="row"
          class="grid gap-x-3.5 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"
          :style="{ gridTemplateColumns: grid }"
        >
          <span v-if="selection" role="columnheader">
            <Checkbox
              :model-value="
                selection.allSelected.value
                  ? true
                  : selection.someSelected.value
                    ? 'indeterminate'
                    : false
              "
              aria-label="Select all rows"
              @update:model-value="selection.toggleAll()"
            />
          </span>
          <span
            v-for="column in columns"
            :key="column.key"
            role="columnheader"
            :class="column.align === 'right' && 'text-right'"
          >
            {{ column.label }}
          </span>
          <span v-if="actions" role="columnheader" class="text-center">Action</span>
        </div>

        <template v-if="loading">
          <div
            v-for="n in 6"
            :key="n"
            class="grid gap-x-3.5 border-t border-divider px-4 py-3"
            :style="{ gridTemplateColumns: grid }"
          >
            <span v-if="selection" />
            <Skeleton v-for="column in columns" :key="column.key" class="h-3 w-3/4" />
            <span v-if="actions" />
          </div>
        </template>

        <template v-else>
          <div
            v-for="row in rows"
            :key="rowKey(row)"
            role="row"
            :class="
              cn(
                'grid items-center gap-x-3.5 border-t border-divider px-4 py-2.5 text-[13px] transition-colors hover:bg-surface-warm',
                selection?.isSelected(row) && 'bg-brand-tint',
              )
            "
            :style="{ gridTemplateColumns: grid }"
          >
            <span v-if="selection" role="cell" class="flex">
              <Checkbox
                :model-value="selection.isSelected(row)"
                aria-label="Select row"
                @update:model-value="selection.toggle(row)"
              />
            </span>
            <div
              v-for="column in columns"
              :key="column.key"
              role="cell"
              :class="
                cn(
                  'flex min-w-0 flex-col gap-0.5 break-words',
                  column.align === 'right' ? 'items-end text-right tabular-nums' : 'items-start',
                )
              "
            >
              <slot :name="`cell-${column.key}`" :row="row">{{ valueOf(row, column.key) }}</slot>
            </div>
            <div v-if="actions" role="cell" class="-my-1 flex justify-center">
              <RowActions :actions="actions(row)" :label="rowLabel?.(row) ?? rowKey(row)" />
            </div>
          </div>
        </template>
      </div>
    </div>

    <p v-if="!loading && !rows.length" class="px-4 py-7 text-[13px] text-muted-foreground">
      {{ emptyText }}
    </p>

    <TablePagination
      v-if="meta"
      :meta="meta"
      @update:page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
    <div v-else class="border-t px-4 py-2.5 text-xs text-muted-foreground">
      Showing {{ rows.length }} {{ rows.length === 1 ? 'record' : 'records' }}
    </div>
  </div>
</template>
