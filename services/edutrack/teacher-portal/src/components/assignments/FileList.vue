<script setup lang="ts">
import { FileTextIcon, ImageIcon, LinkIcon, PresentationIcon } from '@lucide/vue';

import type { FileRef } from '@/types';

import { fileSize } from './assignment-format';

/** Read-only list of attached files (name, size; linked materials that were archived say so). */
withDefaults(defineProps<{ files: FileRef[]; emptyText?: string }>(), {
  emptyText: 'No files attached.',
});

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const iconOf = (f: FileRef) => {
  const e = ext(f.name);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return ImageIcon;
  if (['ppt', 'pptx'].includes(e)) return PresentationIcon;
  if (!e || f.name.startsWith('http')) return LinkIcon;
  return FileTextIcon;
};
</script>

<template>
  <p v-if="!files.length" class="text-[13px] text-muted-foreground">{{ emptyText }}</p>
  <ul v-else class="flex flex-col gap-1.5">
    <li
      v-for="f in files"
      :key="`${f.name}-${f.bytes}`"
      class="flex min-w-0 items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]"
      :class="f.unavailable && 'opacity-70'"
    >
      <component :is="iconOf(f)" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate" :class="f.unavailable && 'line-through'">{{
        f.name
      }}</span>
      <span v-if="f.unavailable" class="shrink-0 text-xs font-medium text-warning-strong"
        >Unavailable · material archived</span
      >
      <span v-else-if="f.materialId" class="shrink-0 text-xs text-faint">From your materials</span>
      <span v-else class="shrink-0 text-xs text-faint tabular-nums">{{ fileSize(f.bytes) }}</span>
    </li>
  </ul>
</template>
