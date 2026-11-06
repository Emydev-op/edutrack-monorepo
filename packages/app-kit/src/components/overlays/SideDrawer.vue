<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';

import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

const props = defineProps<{
  title: string;
  description?: string;
  /** When true, closing asks before discarding the edits. */
  dirty?: boolean;
}>();
const open = defineModel<boolean>('open', { required: true });

const confirm = useConfirm();

async function requestClose(next: boolean) {
  if (next) return void (open.value = true);
  if (props.dirty) {
    const discard = await confirm({
      title: 'You have unsaved changes',
      description: 'Your changes will be lost if you close this panel.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
    if (!discard) return;
  }
  open.value = false;
}
</script>

<template>
  <Sheet :open="open" @update:open="requestClose">
    <SheetContent class="flex w-[460px] flex-col gap-0 p-0 sm:max-w-[460px]">
      <SheetHeader class="gap-0.5 border-b px-5 py-4.5 pr-12">
        <SheetTitle class="text-[17px] font-semibold">{{ title }}</SheetTitle>
        <!-- Always rendered so the dialog stays described while its content loads. -->
        <SheetDescription :class="description ? 'text-xs text-muted-foreground' : 'sr-only'">
          {{ description || title }}
        </SheetDescription>
      </SheetHeader>
      <div class="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4.5">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="flex justify-end gap-2 border-t px-5 py-3.5">
        <slot name="footer" />
      </footer>
    </SheetContent>
  </Sheet>
</template>
