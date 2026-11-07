<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from '@lucide/vue';
import { ref, useId } from 'vue';

import { TICKET_LIMITS, type TicketAttachment } from '@/types';

import { fileSize } from './support-format';

/** Up to three screenshots or PDFs for a ticket or reply, checked for type and size. */
const model = defineModel<TicketAttachment[]>({ required: true });
defineProps<{ disabled?: boolean }>();

const id = useId();
const input = ref<HTMLInputElement | null>(null);
const error = ref('');
const reading = ref(0);
const TYPES = TICKET_LIMITS.attachmentTypes as readonly string[];

function read(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const files = Array.from(el.files ?? []);
  el.value = '';
  error.value = '';
  const problems: string[] = [];
  for (const file of files) {
    if (model.value.length + reading.value >= TICKET_LIMITS.attachments) {
      problems.push(`You can attach up to ${TICKET_LIMITS.attachments} files.`);
      break;
    }
    if (!TYPES.includes(file.type)) {
      problems.push(`“${file.name}” isn’t supported. Use PNG, JPG or PDF.`);
      continue;
    }
    if (file.size > TICKET_LIMITS.attachmentBytes) {
      problems.push(`“${file.name}” is ${fileSize(file.size)}. The limit is 10 MB.`);
      continue;
    }
    if (!file.size) {
      problems.push(`“${file.name}” is empty.`);
      continue;
    }
    if (model.value.some((a) => a.name === file.name && a.bytes === file.size)) continue;
    reading.value++;
    const dataUrl = await read(file);
    reading.value--;
    if (!dataUrl) {
      problems.push(`“${file.name}” couldn’t be read. Try again.`);
      continue;
    }
    model.value = [...model.value, { name: file.name, type: file.type, bytes: file.size, dataUrl }];
  }
  error.value = problems.join(' ');
}

const remove = (i: number) => (model.value = model.value.filter((_, j) => j !== i));
</script>

<template>
  <div class="flex flex-col gap-2">
    <ul v-if="model.length" class="flex flex-col gap-1.5" :aria-labelledby="`${id}-label`">
      <li
        v-for="(file, i) in model"
        :key="`${file.name}-${file.bytes}`"
        class="flex items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]"
      >
        <ImageIcon v-if="file.type.startsWith('image/')" class="size-4 text-muted-foreground" />
        <FileTextIcon v-else class="size-4 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
        <span class="text-xs text-faint tabular-nums">{{ fileSize(file.bytes) }}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground disabled:opacity-50"
          :aria-label="`Remove ${file.name}`"
          :disabled="disabled"
          @click="remove(i)"
        >
          <XIcon class="size-4" />
        </button>
      </li>
    </ul>
    <div class="flex flex-wrap items-center gap-2.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="disabled || reading > 0 || model.length >= TICKET_LIMITS.attachments"
        @click="input?.click()"
      >
        <PaperclipIcon class="size-3.5" />
        {{ reading ? 'Reading…' : 'Attach files' }}
      </Button>
      <span :id="`${id}-label`" class="text-xs text-muted-foreground"
        >Screenshots or PDFs · up to {{ TICKET_LIMITS.attachments }} files, 10 MB each</span
      >
    </div>
    <input
      ref="input"
      type="file"
      multiple
      class="sr-only"
      tabindex="-1"
      accept="image/png,image/jpeg,application/pdf"
      :aria-labelledby="`${id}-label`"
      @change="pick"
    />
    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
  </div>
</template>
