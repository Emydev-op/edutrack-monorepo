<script setup lang="ts">
import { LockIcon } from '@lucide/vue';

import { useTermContext } from '@/composables/useTermContext';
import { useContextStore } from '@/stores/context';

/** Says why the selected term is read-only, or flashes the new term after switching. */
const { term, isReadOnly, readOnlyReason, activeTerm, returnToActive } = useTermContext();
const context = useContextStore();
</script>

<template>
  <div
    v-if="term && isReadOnly"
    role="status"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted px-6 py-2.5 text-[13px] max-md:px-4"
  >
    <span class="flex min-w-0 flex-1 items-start gap-2 text-pretty">
      <LockIcon class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span><b class="font-semibold">Read-only.</b> {{ readOnlyReason }}</span>
    </span>
    <button
      v-if="activeTerm"
      type="button"
      class="shrink-0 font-medium text-primary hover:underline"
      @click="returnToActive"
    >
      Return to {{ activeTerm.name }}
    </button>
  </div>
  <div
    v-else-if="context.changed && term"
    role="status"
    class="flex items-center gap-2.5 bg-brand-subtle px-6 py-2 text-[13px] text-brand-strong max-md:px-4"
  >
    <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
    <span
      >Now showing <b class="font-semibold">{{ term.label }}</b
      >.</span
    >
  </div>
</template>
