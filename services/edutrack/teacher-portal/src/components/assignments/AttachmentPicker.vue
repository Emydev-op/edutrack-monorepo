<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { FileTextIcon, ImageIcon, LibraryIcon, PaperclipIcon, XIcon } from '@lucide/vue';
import { computed, ref, useId } from 'vue';

import { ATTACHMENT_LIMITS, type FileRef, type MaterialRow } from '@/types';

import { fileSize } from './assignment-format';

/**
 * Up to five files for an assignment (PDF, Word, PowerPoint, images; 25 MB each), checked as
 * they are picked. The mock keeps only each file's name, type and size. Materials already shared
 * with the class can be attached too.
 */
const model = defineModel<FileRef[]>({ required: true });
const props = defineProps<{
  disabled?: boolean;
  /** The class's published materials, offered as "Add from my materials". */
  materials?: MaterialRow[];
  /** A server message for the field. */
  error?: string;
}>();

const id = useId();
const input = ref<HTMLInputElement | null>(null);
const problem = ref('');
const EXT = ATTACHMENT_LIMITS.extensions as readonly string[];
const full = computed(() => model.value.length >= ATTACHMENT_LIMITS.count);

function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const files = Array.from(el.files ?? []);
  el.value = '';
  problem.value = '';
  const problems: string[] = [];
  const next = [...model.value];
  for (const file of files) {
    if (next.length >= ATTACHMENT_LIMITS.count) {
      problems.push(`You can attach up to ${ATTACHMENT_LIMITS.count} files.`);
      break;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXT.includes(ext)) {
      problems.push(`“${file.name}” isn’t supported. Use ${ATTACHMENT_LIMITS.label}.`);
      continue;
    }
    if (file.size > ATTACHMENT_LIMITS.bytes) {
      problems.push(`“${file.name}” is ${fileSize(file.size)}. Each file can be up to 25 MB.`);
      continue;
    }
    if (!file.size) {
      problems.push(`“${file.name}” is empty.`);
      continue;
    }
    if (next.some((a) => a.name === file.name && a.bytes === file.size)) continue;
    next.push({ name: file.name, type: file.type, bytes: file.size });
  }
  model.value = next;
  problem.value = problems.join(' ');
}

const available = computed(() =>
  (props.materials ?? []).filter(
    (m) => m.status === 'Published' && !model.value.some((f) => f.materialId === m.id),
  ),
);
const chosenMaterial = ref('');
function addMaterial(materialId: string) {
  const m = props.materials?.find((x) => x.id === materialId);
  chosenMaterial.value = '';
  if (!m || full.value) return;
  model.value = [
    ...model.value,
    {
      name: m.file?.name ?? m.title,
      type: m.file?.type ?? 'link',
      bytes: m.file?.bytes ?? 1,
      materialId: m.id,
    },
  ];
}

const remove = (i: number) => (model.value = model.value.filter((_, j) => j !== i));
</script>

<template>
  <div class="flex flex-col gap-2">
    <span :id="`${id}-label`" class="text-[13px] font-medium">Attachments</span>
    <ul v-if="model.length" class="flex flex-col gap-1.5" :aria-labelledby="`${id}-label`">
      <li
        v-for="(file, i) in model"
        :key="`${file.name}-${file.bytes}-${file.materialId ?? ''}`"
        class="flex min-w-0 items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]"
      >
        <LibraryIcon v-if="file.materialId" class="size-4 shrink-0 text-muted-foreground" />
        <ImageIcon
          v-else-if="file.type.startsWith('image/')"
          class="size-4 shrink-0 text-muted-foreground"
        />
        <FileTextIcon v-else class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
        <span class="shrink-0 text-xs text-faint tabular-nums">{{
          file.materialId ? 'Material' : fileSize(file.bytes)
        }}</span>
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
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
        :disabled="disabled || full"
        @click="input?.click()"
      >
        <PaperclipIcon class="size-3.5" />
        Attach files
      </Button>
      <NativeSelect
        v-if="available.length"
        v-model="chosenMaterial"
        class="h-8 max-w-60 text-[13px]"
        :disabled="disabled || full"
        aria-label="Add from my materials"
        @update:model-value="addMaterial(String($event))"
      >
        <NativeSelectOption value="">Add from my materials…</NativeSelectOption>
        <NativeSelectOption v-for="m in available" :key="m.id" :value="m.id">{{
          m.title
        }}</NativeSelectOption>
      </NativeSelect>
      <span class="text-xs text-muted-foreground"
        >{{ ATTACHMENT_LIMITS.label }} · up to {{ ATTACHMENT_LIMITS.count }} files, 25 MB each</span
      >
    </div>
    <input
      ref="input"
      type="file"
      multiple
      class="sr-only"
      tabindex="-1"
      :accept="EXT.map((e) => `.${e}`).join(',')"
      :aria-labelledby="`${id}-label`"
      @change="pick"
    />
    <p v-if="problem || error" role="alert" class="text-xs text-destructive">
      {{ problem || error }}
    </p>
  </div>
</template>
