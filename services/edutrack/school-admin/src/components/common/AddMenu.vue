<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { ChevronDownIcon, FileSpreadsheetIcon, PlusIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useRouter, type RouteLocationRaw } from 'vue-router';

/**
 * "Add" with two ways in: one record by hand (the form), or many at once from the Excel template
 * (the bulk upload in a modal, given as the default slot; it emits `done` to close).
 */
const props = defineProps<{
  label: string;
  manualLabel: string;
  manualTo: RouteLocationRaw;
  bulkTitle: string;
  bulkDescription: string;
}>();
const router = useRouter();
const open = ref(false);
const close = () => (open.value = false);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button><PlusIcon />{{ props.label }}<ChevronDownIcon class="size-4" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuItem @select="router.push(props.manualTo)">
        <PlusIcon />
        <span class="flex flex-col">
          <span>{{ props.manualLabel }}</span>
          <span class="text-xs text-muted-foreground">Fill in the form for one</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem @select="open = true">
        <FileSpreadsheetIcon />
        <span class="flex flex-col">
          <span>Bulk upload</span>
          <span class="text-xs text-muted-foreground">Many at once from the Excel template</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <Dialog v-model:open="open">
    <DialogScrollContent class="flex max-w-[min(64rem,calc(100vw-2rem))] flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{{ props.bulkTitle }}</DialogTitle>
        <DialogDescription>{{ props.bulkDescription }}</DialogDescription>
      </DialogHeader>
      <slot :close="close" />
    </DialogScrollContent>
  </Dialog>
</template>
