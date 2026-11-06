<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Kbd } from '@edutrack/ui/components/kbd';
import { Spinner } from '@edutrack/ui/components/spinner';
import { cn } from '@edutrack/ui/lib/utils';
import { SearchIcon } from '@lucide/vue';
import { refDebounced, useEventListener } from '@vueuse/core';
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useSearchQuery } from '@/api/services/settings';
import type { SearchResult } from '@/types';

const open = defineModel<boolean>('open', { required: true });
const router = useRouter();

const term = ref('');
const debounced = refDebounced(term, 200);
const active = ref(0);
const { data: results, isFetching } = useSearchQuery(debounced);

watch(open, (isOpen) => isOpen && ((term.value = ''), (active.value = 0)));
watch(results, () => (active.value = 0));

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    open.value = !open.value;
  }
});

function go(result: SearchResult | undefined) {
  if (!result) return;
  open.value = false;
  void router.push(result.to);
}

function onKeydown(event: KeyboardEvent) {
  const count = results.value?.length ?? 0;
  if (!count) return;
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % count;
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + count) % count;
  else if (event.key === 'Enter') go(results.value?.[active.value]);
  else return;
  event.preventDefault();
}

const abbreviation: Record<SearchResult['type'], string> = {
  School: 'SC',
  User: 'US',
  Issue: 'IS',
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :show-close-button="false"
      class="top-20 w-[620px] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[620px]"
    >
      <DialogTitle class="sr-only">Search</DialogTitle>
      <DialogDescription class="sr-only"
        >Search schools, users and support issues</DialogDescription
      >
      <div class="flex h-13 items-center gap-2.5 border-b px-4">
        <Spinner v-if="isFetching" class="size-4 text-muted-foreground" />
        <SearchIcon v-else class="size-4 text-muted-foreground" />
        <input
          v-model="term"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          :aria-activedescendant="results?.length ? `command-result-${active}` : undefined"
          placeholder="Search schools, users and issues…"
          class="flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          @keydown="onKeydown"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="command-results" role="listbox" class="max-h-[440px] overflow-y-auto p-1.5">
        <li
          v-for="(result, i) in results"
          :id="`command-result-${i}`"
          :key="`${result.type}-${result.id}`"
          role="option"
          :aria-selected="i === active"
          :class="
            cn(
              'grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md px-2.5 py-2',
              i === active && 'bg-muted',
            )
          "
          @mouseenter="active = i"
          @click="go(result)"
        >
          <span
            class="flex size-8 items-center justify-center rounded-md border bg-muted text-[11px] font-semibold text-muted-foreground"
          >
            {{ abbreviation[result.type] }}
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium">{{ result.title }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ result.meta }}</span>
          </span>
          <span
            class="rounded-[3px] bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand-strong"
            >{{ result.type }}</span
          >
        </li>
        <li
          v-if="results && !results.length"
          class="px-4 py-7 text-center text-[13px] text-muted-foreground"
        >
          No matches for “{{ debounced }}” in records you can access.
        </li>
      </ul>
      <div class="border-t bg-surface-warm px-4 py-2.5 text-xs text-muted-foreground">
        Searching all tenants · platform operations scope
      </div>
    </DialogContent>
  </Dialog>
</template>
