<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { useClipboard } from '@vueuse/core';
import { computed } from 'vue';
import { toast } from 'vue-sonner';

import { useAuditEntryQuery } from '@/api/services/activity';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

const props = defineProps<{ entryId?: string }>();
const emit = defineEmits<{ close: [] }>();

const { data: entry, isPending } = useAuditEntryQuery(() => props.entryId);
const { copy } = useClipboard();
const open = computed({ get: () => !!props.entryId, set: (v) => !v && emit('close') });

const rows = computed(() => {
  const e = entry.value;
  if (!e) return [];
  return [
    ['Timestamp', `${e.timestamp} WAT`],
    ['Actor', e.actor],
    ['Action', e.action],
    ['Entity', e.entity],
    ['Entity ID', e.entityId],
    ['Previous value', e.previousValue],
    ['New value', e.newValue],
    ['IP · device', e.ipDevice],
    ['Request ID', e.requestId],
    ['Integrity', "Append-only. Entries can't be edited or deleted."],
  ];
});

async function copyId() {
  if (!entry.value) return;
  await copy(entry.value.requestId);
  toast.success('Entry ID copied.');
}
</script>

<template>
  <SideDrawer v-model:open="open" title="Audit entry" :description="entry?.action">
    <Skeleton v-if="isPending" class="h-72" />
    <dl
      v-else
      class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 rounded-md bg-muted px-3.5 py-3 text-[13px]"
    >
      <template v-for="[label, value] in rows" :key="label">
        <dt class="text-faint">{{ label }}</dt>
        <dd class="break-words">{{ value }}</dd>
      </template>
    </dl>
    <template #footer>
      <Button variant="outline" @click="emit('close')">Close</Button>
      <Button :disabled="!entry" @click="copyId">Copy entry ID</Button>
    </template>
  </SideDrawer>
</template>
