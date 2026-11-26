<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { usePropertyQuery, useSavePropertyMutation } from '@/api/services/boarding';
import { getApiErrorMessage } from '@/lib/api-errors';
import type { PropertyCheck, PropertyKind } from '@/types';

import { dateTimeOf } from './boarding-format';

/** A boarder's property check-in / check-out against the school's checklist, this term. */
const props = defineProps<{ studentId: string; studentName: string }>();
const open = defineModel<boolean>('open', { required: true });

const { data, isPending, error } = usePropertyQuery(() => (open.value ? props.studentId : ''));
const save = useSavePropertyMutation();

interface Line {
  item: string;
  present: boolean;
  quantity: string;
  note: string;
}

const kind = ref<PropertyKind>('Check-in');
const lines = ref<Line[]>([]);
const note = ref('');
const serverError = ref('');
const touched = ref(false);

const existing = computed<PropertyCheck | null>(() =>
  kind.value === 'Check-in' ? (data.value?.checkIn ?? null) : (data.value?.checkOut ?? null),
);

/** Fill the form from the saved check of this kind, else the checklist with nothing ticked. */
function fill() {
  const saved = existing.value;
  lines.value = (data.value?.items ?? []).map((i) => {
    const prev = saved?.items.find((l) => l.item === i.name || l.item === i.id);
    return {
      item: i.name,
      present: prev?.present ?? false,
      quantity: prev?.quantity != null ? String(prev.quantity) : '',
      note: prev?.note ?? '',
    };
  });
  note.value = saved?.note ?? '';
  serverError.value = '';
  touched.value = false;
}
watch([data, kind], fill, { immediate: true });
watch(open, (o) => {
  if (o) {
    // Check-out once they’ve checked in.
    kind.value = data.value?.checkIn && !data.value.checkOut ? 'Check-out' : 'Check-in';
    fill();
  }
});

const KINDS = [
  { value: 'Check-in' as const, label: 'Check-in' },
  { value: 'Check-out' as const, label: 'Check-out' },
];

async function submit() {
  serverError.value = '';
  try {
    await save.mutateAsync({
      studentId: props.studentId,
      kind: kind.value,
      items: lines.value.map((l) => ({
        item: l.item,
        present: l.present,
        quantity: l.quantity.trim() ? Number(l.quantity) : undefined,
        note: l.note.trim() || undefined,
      })),
      note: note.value.trim() || undefined,
    });
    toast.success(`${kind.value} saved for ${props.studentName}`);
    open.value = false;
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'The property check couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="`Property · ${studentName}`"
    :description="
      data?.term ? `${data.term}. Tick what the boarder has.` : 'Tick what the boarder has.'
    "
    :dirty="touched"
  >
    <p
      v-if="error"
      role="alert"
      class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
    >
      {{ getApiErrorMessage(error, 'The property list couldn’t load.') }}
    </p>
    <div v-else-if="isPending" class="flex flex-col gap-2">
      <Skeleton v-for="i in 5" :key="i" class="h-11 w-full" />
    </div>
    <form
      v-else
      id="property-check"
      class="flex flex-col gap-4"
      @submit.prevent="submit"
      @input="touched = true"
    >
      <SegmentedControl v-model="kind" :options="KINDS" label="Check" />
      <p class="text-xs text-muted-foreground">
        <template v-if="existing">Last saved {{ dateTimeOf(existing.checkedAt) }}.</template>
        <template v-else>Not done yet this term.</template>
        <template v-if="kind === 'Check-out' && data?.checkIn">
          Checked in {{ dateTimeOf(data.checkIn.checkedAt) }}.</template
        >
      </p>
      <p v-if="!lines.length" class="text-[13px] text-faint">The school hasn’t set a checklist.</p>
      <ul v-else class="flex flex-col divide-y divide-divider rounded-md border">
        <li v-for="l in lines" :key="l.item" class="flex flex-col gap-2 px-3 py-2.5">
          <div class="flex items-center justify-between gap-3">
            <label class="flex min-h-9 flex-1 items-center gap-2.5 text-[13px] font-medium">
              <Checkbox v-model="l.present" @update:model-value="touched = true" />
              {{ l.item }}
            </label>
            <Input
              v-model="l.quantity"
              type="number"
              min="0"
              inputmode="numeric"
              class="h-9 w-20"
              :aria-label="`${l.item} quantity`"
              placeholder="Qty"
            />
          </div>
          <Input
            v-model="l.note"
            class="h-8 text-[13px]"
            :aria-label="`${l.item} note`"
            placeholder="Note (e.g. damaged, labelled)"
          />
        </li>
      </ul>
      <div class="flex flex-col gap-1.5">
        <Label for="property-note"
          >Note <span class="font-normal text-faint">(optional)</span></Label
        >
        <Textarea id="property-note" v-model="note" :rows="2" />
      </div>
      <p
        v-if="serverError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ serverError }}
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button
        type="submit"
        form="property-check"
        :disabled="save.isPending.value || isPending || Boolean(error)"
      >
        <Spinner v-if="save.isPending.value" />Save {{ kind.toLowerCase() }}
      </Button>
    </template>
  </SideDrawer>
</template>
