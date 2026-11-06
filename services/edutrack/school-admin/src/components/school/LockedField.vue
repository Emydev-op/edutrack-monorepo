<script setup lang="ts">
import { LockIcon } from '@lucide/vue';

/** A value the school can see but not change here, with who can change it. */
defineProps<{ label: string; value: string; note: string }>();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span class="text-[13px] font-medium">{{ label }}</span>
    <span
      class="flex h-9 items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground"
    >
      <LockIcon class="size-3.5 shrink-0" aria-hidden="true" />{{ value || '—' }}
    </span>
    <span class="text-xs text-faint">{{ note }}</span>
  </div>
</template>
