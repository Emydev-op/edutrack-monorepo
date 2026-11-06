<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronDownIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import { useContextStore } from '@/stores/context';
import type { WorkingContext } from '@/types';

const context = useContextStore();
const open = ref(false);

/** Terms after the current one in the active session haven't started yet. */
const termLabel = (term: string, i: number) =>
  context.sessionStatus === 'Active' && i > 0 ? `${term} · Upcoming` : term;

const fields = computed(() => {
  const o = context.options;
  if (!o) return [];
  const branch = {
    key: 'branch' as const,
    label: 'Branch',
    choices: o.branches
      .filter((b) => b.status === 'Active')
      .map((b) => ({ value: b.name, label: b.name })),
  };
  return [
    ...(context.singleBranch ? [] : [branch]),
    {
      key: 'session' as const,
      label: 'Academic session',
      choices: o.sessions.map((s) => ({ value: s.name, label: `${s.name} · ${s.status}` })),
    },
    {
      key: 'term' as const,
      label: 'Term',
      choices: o.terms.map((t, i) => ({ value: t, label: termLabel(t, i) })),
    },
  ];
});

function pick(key: keyof WorkingContext, value: string) {
  if (context.current[key] !== value) context.set({ [key]: value });
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger
      class="flex h-9 max-w-full min-w-0 items-center gap-2 rounded-md border bg-card px-3 text-[13px] whitespace-nowrap hover:bg-muted data-[state=open]:bg-muted"
      aria-label="Working context"
    >
      <span class="truncate font-semibold">{{ context.current.branch }}</span>
      <span class="text-[#B8B2A9]" aria-hidden="true">·</span>
      <span class="max-md:hidden">{{ context.current.session }}</span>
      <span class="text-[#B8B2A9] max-md:hidden" aria-hidden="true">·</span>
      <span class="max-md:hidden">{{ context.current.term }}</span>
      <ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent align="start" class="flex w-[340px] flex-col gap-3.5 p-4 shadow-popover">
      <p class="text-xs text-muted-foreground">
        Everything you view or record applies to this context.
      </p>
      <div v-for="f in fields" :key="f.key" class="flex flex-col gap-1.5">
        <span :id="`ctx-${f.key}`" class="text-xs font-medium text-muted-foreground">{{
          f.label
        }}</span>
        <div role="radiogroup" :aria-labelledby="`ctx-${f.key}`" class="flex flex-wrap gap-1.5">
          <button
            v-for="c in f.choices"
            :key="c.value"
            type="button"
            role="radio"
            :aria-checked="context.current[f.key] === c.value"
            :class="
              cn(
                'h-8 rounded-md border px-2.5 text-[13px] transition-colors',
                context.current[f.key] === c.value
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:bg-muted',
              )
            "
            @click="pick(f.key, c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
