<script setup lang="ts">
import { SearchIcon, XIcon } from '@lucide/vue';

defineProps<{ placeholder: string }>();
const model = defineModel<string>({ required: true });
</script>

<template>
  <label
    class="flex h-9 w-full max-w-sm min-w-56 items-center gap-2 rounded-md border bg-card px-3 text-faint transition-colors focus-within:border-ring"
  >
    <SearchIcon class="size-4 shrink-0" />
    <input
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
    />
    <button
      v-if="model"
      type="button"
      aria-label="Clear search"
      class="rounded-sm text-faint hover:text-foreground"
      @click="model = ''"
    >
      <XIcon class="size-3.5" />
    </button>
  </label>
</template>
