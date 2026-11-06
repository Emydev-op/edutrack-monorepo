<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { FileTextIcon, UploadIcon } from '@lucide/vue';
import { ref, useId } from 'vue';

import type { FileRef } from '@/types';

/** Picks one file, checks its type and size, and keeps a preview for images. */
const props = defineProps<{
  title: string;
  hint: string;
  accept: string;
  /** e.g. "PDF, JPG or PNG", for the error message. */
  typeLabel: string;
  maxBytes: number;
  /** Read images as a data URL so they can be previewed. */
  preview?: boolean;
  /** Shown beside an uploaded file, e.g. "Awaiting verification by Edutrack". */
  status?: string;
}>();
const model = defineModel<FileRef | null>({ required: true });

const id = useId();
const input = ref<HTMLInputElement | null>(null);
const error = ref('');
const busy = ref(false);

const sizeText = (bytes: number) =>
  bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function accepts(file: File) {
  return props.accept
    .split(',')
    .map((t) => t.trim())
    .some((t) => (t.endsWith('/*') ? file.type.startsWith(t.slice(0, -1)) : file.type === t));
}

function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  error.value = '';
  if (!accepts(file))
    return void (error.value = `“${file.name}” isn’t supported. Use ${props.typeLabel}.`);
  if (file.size > props.maxBytes)
    return void (error.value = `“${file.name}” is ${sizeText(file.size)}. The limit is ${sizeText(props.maxBytes)}.`);
  const done = (dataUrl: string | null) => {
    busy.value = false;
    model.value = { name: file.name, size: sizeText(file.size), dataUrl };
  };
  busy.value = true;
  if (!props.preview) return done(null);
  const reader = new FileReader();
  reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null);
  reader.onerror = () => {
    busy.value = false;
    error.value = 'The upload failed. Check your connection and try again.';
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span :id="`${id}-label`" class="text-[13px] font-medium">{{ title }}</span>
    <div class="flex items-center gap-3 rounded-lg border border-dashed bg-card px-3.5 py-3">
      <span
        class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <img v-if="model?.dataUrl" :src="model.dataUrl" alt="" class="size-full object-contain" />
        <FileTextIcon v-else-if="model" class="size-5" />
        <UploadIcon v-else class="size-5" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col text-[13px]">
        <template v-if="model">
          <span class="truncate font-medium">{{ model.name }}</span>
          <span class="text-xs text-muted-foreground"
            >{{ model.size }} · {{ status ?? 'Uploaded' }}</span
          >
        </template>
        <span v-else-if="busy" class="text-muted-foreground">Uploading…</span>
        <span v-else class="text-xs text-muted-foreground">{{ hint }}</span>
      </div>
      <Button v-if="model" type="button" variant="ghost" size="sm" @click="model = null"
        >Remove</Button
      >
      <Button type="button" variant="outline" size="sm" :disabled="busy" @click="input?.click()">
        {{ model ? 'Replace' : 'Upload' }}
      </Button>
      <input
        ref="input"
        type="file"
        class="sr-only"
        :accept="accept"
        :aria-labelledby="`${id}-label`"
        @change="pick"
      />
    </div>
    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
  </div>
</template>
