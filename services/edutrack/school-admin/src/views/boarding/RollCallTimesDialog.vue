<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useSaveRollCallSlotsMutation } from '@/api/services/boarding-house';

/** The roll calls a hostel takes each day, in order: e.g. Morning, Prep, Night. */
const props = defineProps<{ hostel: { id: string; name: string } | null; slots: string[] }>();
const open = defineModel<boolean>('open', { required: true });

const save = useSaveRollCallSlotsMutation();
const list = ref<string[]>([]);
const error = ref('');
const showErrors = ref(false);
watch(open, (o) => {
  if (!o) return;
  list.value = props.slots.length ? [...props.slots] : ['Morning', 'Prep', 'Night'];
  error.value = '';
  showErrors.value = false;
});
watch(list, () => (error.value = ''), { deep: true });

const problem = computed(() => {
  const names = list.value.map((s) => s.trim());
  if (!names.length) return 'Keep at least one roll call.';
  if (names.some((n) => !n)) return 'Name every roll call, or remove the empty one.';
  const lower = names.map((n) => n.toLowerCase());
  if (lower.some((n, i) => lower.indexOf(n) !== i)) return 'Each roll call needs its own name.';
  return '';
});
const shown = computed(() => error.value || (showErrors.value ? problem.value : ''));

async function submit() {
  showErrors.value = true;
  if (problem.value || !props.hostel) return;
  try {
    await save.mutateAsync({ hostelId: props.hostel.id, slots: list.value.map((s) => s.trim()) });
    toast.success(`Roll call times saved for ${props.hostel.name}.`);
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    error.value =
      fe.slots ?? Object.values(fe)[0] ?? getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[420px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">Roll call times</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          The roll calls {{ hostel?.name ?? 'this hostel' }} takes each day, in order.
        </DialogDescription>
      </div>
      <form class="flex min-h-0 flex-col gap-3 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice v-if="shown" tone="error" :title="shown" role="alert" />
        <ol class="flex flex-col gap-2">
          <li v-for="(_, i) in list" :key="i" class="flex items-center gap-2">
            <span class="w-5 text-right text-xs text-faint tabular-nums">{{ i + 1 }}</span>
            <Input
              v-model="list[i]"
              maxlength="30"
              :aria-label="`Roll call ${i + 1}`"
              placeholder="e.g. Night"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :aria-label="`Remove ${list[i] || `roll call ${i + 1}`}`"
              :disabled="list.length === 1"
              @click="list.splice(i, 1)"
              ><Trash2Icon
            /></Button>
          </li>
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="self-start"
          :disabled="list.length >= 8"
          @click="list.push('')"
          ><PlusIcon />Add roll call</Button
        >
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="save.isPending.value"
            ><Spinner v-if="save.isPending.value" />Save</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
