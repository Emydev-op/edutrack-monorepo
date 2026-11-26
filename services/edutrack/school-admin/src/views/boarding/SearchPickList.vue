<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';

import type { PickedStudent } from './house-format';

/** A search box with matching students under it; once one is picked it shows with "Change". */
defineProps<{
  id: string;
  placeholder: string;
  items: PickedStudent[];
  loading?: boolean;
  invalid?: boolean;
  emptyText?: string;
}>();
const search = defineModel<string>('search', { required: true });
const selected = defineModel<PickedStudent | null>('selected', { required: true });
</script>

<template>
  <div
    v-if="selected"
    class="flex items-center justify-between gap-3 rounded-md border bg-surface-warm px-3 py-2"
  >
    <span class="flex min-w-0 flex-col text-[13px]">
      <span class="font-medium">{{ selected.name }}</span>
      <span class="truncate text-xs text-muted-foreground">{{ selected.detail }}</span>
    </span>
    <Button type="button" variant="ghost" size="sm" @click="selected = null">Change</Button>
  </div>
  <div v-else class="flex flex-col gap-1.5">
    <Input
      :id="id"
      v-model="search"
      type="search"
      autocomplete="off"
      :placeholder="placeholder"
      :aria-invalid="invalid"
    />
    <Skeleton v-if="loading && !items.length" class="h-16" />
    <ul
      v-else-if="items.length"
      class="flex max-h-48 flex-col overflow-y-auto rounded-md border"
      :aria-label="`Matches for ${search || 'your search'}`"
    >
      <li v-for="s in items" :key="s.id" class="border-b last:border-b-0">
        <button
          type="button"
          class="flex w-full flex-col px-3 py-2 text-left text-[13px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          @click="selected = s"
        >
          <span class="font-medium">{{ s.name }}</span>
          <span class="text-xs text-muted-foreground">{{ s.detail }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="text-xs text-muted-foreground">
      {{ emptyText ?? 'No one matches. Check the spelling or admission number.' }}
    </p>
  </div>
</template>
