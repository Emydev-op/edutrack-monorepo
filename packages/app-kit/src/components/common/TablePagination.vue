<script setup lang="ts">
import type { PaginationMeta } from '@edutrack/shared';
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { computed, useId } from 'vue';

const PAGE_SIZES = [10, 20, 50] as const;

const props = defineProps<{ meta: PaginationMeta }>();
const emit = defineEmits<{ 'update:page': [page: number]; 'update:pageSize': [size: number] }>();

const sizeId = useId();

const range = computed(() => {
  const { page, pageSize, total } = props.meta;
  if (!total) return 'No results';
  return `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`;
});

/** Page numbers to show, with null for a gap: 1 … 4 5 6 … 12. */
const pages = computed<(number | null)[]>(() => {
  const { page, totalPages } = props.meta;
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const window = [page - 1, page, page + 1].filter((p) => p > 1 && p < totalPages);
  return [
    1,
    ...(window[0]! > 2 ? [null] : []),
    ...window,
    ...(window[window.length - 1]! < totalPages - 1 ? [null] : []),
    totalPages,
  ];
});

const go = (page: number) =>
  page >= 1 &&
  page <= props.meta.totalPages &&
  page !== props.meta.page &&
  emit('update:page', page);
</script>

<template>
  <nav
    aria-label="Pagination"
    class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground"
  >
    <div class="flex items-center gap-4">
      <span aria-live="polite">{{ range }}</span>
      <label :for="sizeId" class="flex items-center gap-2">
        Rows per page
        <NativeSelect
          :id="sizeId"
          :model-value="String(meta.pageSize)"
          class="h-8 w-[72px] bg-card py-0 pr-7 pl-2.5 text-xs text-foreground"
          @update:model-value="emit('update:pageSize', Number($event))"
        >
          <NativeSelectOption v-for="size in PAGE_SIZES" :key="size" :value="String(size)">{{
            size
          }}</NativeSelectOption>
        </NativeSelect>
      </label>
    </div>
    <div class="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        :disabled="meta.page <= 1"
        @click="go(meta.page - 1)"
      >
        <ChevronLeftIcon />
      </Button>
      <template v-for="(p, i) in pages" :key="p ?? `gap-${i}`">
        <span v-if="p === null" class="px-1 text-faint" aria-hidden="true">…</span>
        <Button
          v-else
          :variant="p === meta.page ? 'default' : 'ghost'"
          size="icon-sm"
          :aria-label="`Page ${p}`"
          :aria-current="p === meta.page ? 'page' : undefined"
          :class="cn('text-xs tabular-nums', p !== meta.page && 'text-foreground')"
          @click="go(p)"
        >
          {{ p }}
        </Button>
      </template>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        :disabled="meta.page >= meta.totalPages"
        @click="go(meta.page + 1)"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  </nav>
</template>
