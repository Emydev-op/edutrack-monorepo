<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { CheckIcon, ChevronDownIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import { naira } from '@/lib/money';
import type { ChildSummary } from '@/types';

/** The bar under the header: whose information the screens show, and switching child. */
const props = defineProps<{ children: ChildSummary[]; selected: ChildSummary; term: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const open = ref(false);

const feeText = (c: ChildSummary) =>
  c.fees.outstanding > 0 ? `${naira(c.fees.outstanding)} due` : 'Fees paid';
const feeClass = (c: ChildSummary) =>
  c.fees.outstanding > 0 ? 'text-error-strong' : 'text-success-strong';
const many = computed(() => props.children.length > 1);

function pick(id: string) {
  open.value = false;
  emit('select', id);
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child :disabled="!many">
      <button
        type="button"
        class="flex min-h-13 w-full items-center gap-2.5 rounded-lg border bg-muted px-3 py-2 text-left disabled:cursor-default"
        :aria-label="many ? `Switch child. Showing ${selected.name}` : undefined"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
          aria-hidden="true"
          >{{ selected.initials }}</span
        >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[15px] font-semibold">{{ selected.name }}</span>
          <span class="truncate text-xs text-muted-foreground"
            >{{ selected.className || 'No class yet' }} · {{ term }}</span
          >
        </span>
        <span class="text-xs font-medium whitespace-nowrap" :class="feeClass(selected)">{{
          feeText(selected)
        }}</span>
        <span v-if="many" class="flex items-center gap-0.5 text-xs font-medium text-primary"
          >Switch <ChevronDownIcon class="size-3.5"
        /></span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-(--reka-popover-trigger-width) p-1.5">
      <div role="listbox" aria-label="Your children">
        <button
          v-for="c in children"
          :key="c.id"
          type="button"
          role="option"
          :aria-selected="c.id === selected.id"
          class="flex min-h-13 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-muted"
          :class="c.id === selected.id && 'bg-brand-subtle hover:bg-brand-subtle'"
          @click="pick(c.id)"
        >
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand-strong"
            aria-hidden="true"
            >{{ c.initials }}</span
          >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">{{ c.name }}</span>
            <span class="truncate text-xs text-muted-foreground"
              >{{ c.className || 'No class yet'
              }}{{ c.access === 'read-only' ? ' · Left the school' : '' }}</span
            >
          </span>
          <span class="text-xs whitespace-nowrap" :class="feeClass(c)">{{ feeText(c) }}</span>
          <CheckIcon v-if="c.id === selected.id" class="size-4 text-primary" />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
