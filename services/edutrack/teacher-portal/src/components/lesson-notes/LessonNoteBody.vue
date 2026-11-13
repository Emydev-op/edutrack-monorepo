<script setup lang="ts">
import { PaperclipIcon } from '@lucide/vue';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import type { LessonNote } from '@/types';

import { fileSize } from './note-status';

/** A lesson note, read-only: for approved / submitted notes and the reviewer's screen. */
defineProps<{ note: LessonNote }>();
</script>

<template>
  <SectionCard :title="note.topic">
    <div class="flex flex-col gap-4 text-[13px]">
      <div class="flex flex-col gap-1.5">
        <h3 class="text-xs font-medium text-muted-foreground">Objectives</h3>
        <ol v-if="note.objectives.length" class="list-decimal space-y-1 pl-5">
          <li v-for="(o, i) in note.objectives" :key="i">{{ o }}</li>
        </ol>
        <p v-else class="text-faint">None yet.</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <h3 class="text-xs font-medium text-muted-foreground">Content summary</h3>
        <p class="whitespace-pre-line">{{ note.content || '—' }}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-medium text-muted-foreground">Scheme of work topic</h3>
          <p>{{ note.schemeTopic || '—' }}</p>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <h3 class="text-xs font-medium text-muted-foreground">Attachment</h3>
          <p v-if="note.attachment" class="flex min-w-0 items-center gap-1.5">
            <PaperclipIcon class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ note.attachment.name }}</span>
            <span class="shrink-0 text-xs text-faint">{{ fileSize(note.attachment.bytes) }}</span>
          </p>
          <p v-else>—</p>
        </div>
      </div>
    </div>
  </SectionCard>
</template>
