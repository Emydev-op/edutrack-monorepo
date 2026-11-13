<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronDownIcon, LockIcon } from '@lucide/vue';
import { ref } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import { formatDay } from '@/lib/dates';

/** The term switcher: session · term. Any term but the active one is read-only. */
const { term, terms, termId, isReadOnly, setTerm } = useTermContext();
const open = ref(false);

function pick(id: string) {
  setTerm(id);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger
      class="flex h-9 max-w-full min-w-0 items-center gap-2 rounded-md border bg-card px-3 text-[13px] whitespace-nowrap hover:bg-muted data-[state=open]:bg-muted max-md:px-2"
      :aria-label="`Term: ${term?.label ?? ''}${isReadOnly ? ', read-only' : ''}. Change term`"
    >
      <LockIcon v-if="isReadOnly" class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="max-md:hidden">{{ term?.sessionName }}</span>
      <span class="text-[#B8B2A9] max-md:hidden" aria-hidden="true">·</span>
      <span class="truncate font-semibold">{{ term?.name }}</span>
      <ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-4 shadow-popover"
    >
      <p class="text-xs text-muted-foreground">
        Everything you see is for this term. Only the active term can be changed.
      </p>
      <div role="radiogroup" aria-label="Term" class="flex flex-col gap-1.5">
        <button
          v-for="t in terms"
          :key="t.id"
          type="button"
          role="radio"
          :aria-checked="t.id === termId"
          :class="
            cn(
              'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-[13px] transition-colors',
              t.id === termId ? 'border-primary bg-brand-subtle' : 'bg-card hover:bg-muted',
            )
          "
          @click="pick(t.id)"
        >
          <span class="flex min-w-0 flex-col">
            <span :class="cn('font-medium', t.id === termId && 'text-brand-strong')">{{
              t.label
            }}</span>
            <span class="text-xs text-faint"
              >{{ formatDay(t.start) }} – {{ formatDay(t.end) }}</span
            >
          </span>
          <StatusBadge
            :label="t.status"
            :tone="t.status === 'Active' ? 'success' : t.status === 'Upcoming' ? 'info' : 'neutral'"
          />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
