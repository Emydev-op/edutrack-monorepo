<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useSavePropertyMutation } from '@/api/services/boarding-house';
import type { PropertyKind, PropertyPayload, StudentProperty } from '@/types';

/** Ticks off what a boarder brought (check-in) or took home (check-out) this term. */
const props = defineProps<{
  studentId: string;
  studentName: string;
  property: StudentProperty | undefined;
  kind: PropertyKind;
}>();
const open = defineModel<boolean>('open', { required: true });

const save = useSavePropertyMutation();
interface Line {
  item: string;
  present: boolean;
  quantity: string;
  note: string;
}
const lines = ref<Line[]>([]);
const note = ref('');
const fields = ref<Record<string, string>>({});
const serverError = ref('');

watch(open, (o) => {
  if (!o) return;
  const check = props.kind === 'Check-in' ? props.property?.checkIn : props.property?.checkOut;
  // Check-out starts from what came in.
  const start = check ?? (props.kind === 'Check-out' ? props.property?.checkIn : null);
  const names = props.property?.items.map((i) => i.name) ?? [];
  for (const l of start?.items ?? []) if (!names.includes(l.item)) names.push(l.item);
  lines.value = names.map((item) => {
    const l = start?.items.find((x) => x.item === item);
    return {
      item,
      present: l?.present ?? false,
      quantity: l?.quantity != null ? String(l.quantity) : '',
      note: (check ? l?.note : '') ?? '',
    };
  });
  note.value = check?.note ?? '';
  fields.value = {};
  serverError.value = '';
});

const ticked = computed(() => lines.value.filter((l) => l.present).length);
const badQuantity = (l: Line) =>
  l.quantity !== '' && (!/^\d+$/.test(l.quantity) || Number(l.quantity) > 999);

async function submit() {
  serverError.value = '';
  if (lines.value.some(badQuantity)) {
    serverError.value = 'Quantities are whole numbers, like 2.';
    return;
  }
  const payload: PropertyPayload = {
    kind: props.kind,
    items: lines.value.map((l) => ({
      item: l.item,
      present: l.present,
      ...(l.quantity !== '' ? { quantity: Number(l.quantity) } : {}),
      ...(l.note.trim() ? { note: l.note.trim() } : {}),
    })),
  };
  if (note.value.trim()) payload.note = note.value.trim();
  try {
    await save.mutateAsync({ studentId: props.studentId, ...payload });
    toast.success(`${props.kind} saved for ${props.studentName}.`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    fields.value = fe;
    serverError.value =
      Object.values(fe)[0] ?? getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[600px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{ kind }} · {{ studentName }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          {{ property?.term ? `${property.term}. ` : '' }}Tick what
          {{ kind === 'Check-in' ? 'they brought' : 'they’re taking home' }}, with how many.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not saved"
          :description="serverError"
          role="alert"
        />
        <p v-if="!lines.length" class="text-[13px] text-muted-foreground">
          The property checklist is empty. Add items in Boarding › House › Property checklist.
        </p>
        <div v-else role="table" :aria-label="`${kind} items`" class="flex flex-col">
          <div
            role="row"
            class="grid grid-cols-[minmax(150px,1fr)_70px_minmax(120px,1fr)] gap-2 border-b pb-1.5 text-xs text-muted-foreground"
          >
            <span role="columnheader">Item ({{ ticked }} of {{ lines.length }})</span>
            <span role="columnheader">How many</span>
            <span role="columnheader">Note</span>
          </div>
          <div
            v-for="l in lines"
            :key="l.item"
            role="row"
            class="grid grid-cols-[minmax(150px,1fr)_70px_minmax(120px,1fr)] items-center gap-2 border-b border-divider py-1.5"
          >
            <label role="cell" class="flex items-center gap-2 text-[13px]">
              <Checkbox
                :model-value="l.present"
                @update:model-value="l.present = $event === true"
              />{{ l.item }}
            </label>
            <span role="cell">
              <Input
                v-model="l.quantity"
                inputmode="numeric"
                maxlength="3"
                placeholder="—"
                :aria-label="`How many: ${l.item}`"
                :aria-invalid="badQuantity(l)"
                class="h-8 text-[13px]"
              />
            </span>
            <span role="cell">
              <Input
                v-model="l.note"
                maxlength="120"
                placeholder="e.g. Torn at one end"
                :aria-label="`Note: ${l.item}`"
                class="h-8 text-[13px]"
              />
            </span>
          </div>
        </div>
        <FieldShell id="property-note" label="Note" :error="fields.note" hint="Optional.">
          <Input
            id="property-note"
            v-model="note"
            maxlength="300"
            placeholder="e.g. Provisions box locked in the store"
          />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="save.isPending.value || !lines.length"
            ><Spinner v-if="save.isPending.value" />Save {{ kind.toLowerCase() }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
