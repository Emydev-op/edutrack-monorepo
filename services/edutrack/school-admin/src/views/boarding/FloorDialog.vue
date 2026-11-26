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
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useAddFloorMutation, useRenameFloorMutation } from '@/api/services/boarding';
import type { Hostel, HostelFloor } from '@/types';

/** Adds a floor or wing to a hostel, or renames one. */
const props = defineProps<{ hostel: Hostel; floor: HostelFloor | null }>();
const open = defineModel<boolean>('open', { required: true });

const add = useAddFloorMutation();
const rename = useRenameFloorMutation();
const name = ref('');
const error = ref('');
const showErrors = ref(false);
watch(open, (o) => {
  if (!o) return;
  name.value = props.floor?.name ?? '';
  error.value = '';
  showErrors.value = false;
});
watch(name, () => (error.value = ''));

const shownError = computed(
  () => error.value || (showErrors.value && !name.value.trim() ? 'Name the floor or wing.' : ''),
);
const pending = computed(() => add.isPending.value || rename.isPending.value);

async function submit() {
  showErrors.value = true;
  if (!name.value.trim()) return;
  const payload = { hostelId: props.hostel.id, name: name.value.trim() };
  try {
    const result = props.floor
      ? await rename.mutateAsync({ ...payload, floorId: props.floor.id })
      : await add.mutateAsync(payload);
    toast.success(messageOf(result, props.floor ? 'Floor renamed.' : `${payload.name} added.`));
    open.value = false;
  } catch (e) {
    error.value =
      getApiErrorFields(e).name ?? getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex flex-col gap-4 sm:max-w-[420px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{
          floor ? `Rename ${floor.name}` : 'Add a floor or wing'
        }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          Group rooms by floor, wing or block, so a floor master / mistress can look after them.
        </DialogDescription>
      </div>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <FieldShell id="floor-name" label="Name" required :error="shownError">
          <Input
            id="floor-name"
            v-model="name"
            maxlength="60"
            placeholder="e.g. Ground floor or East wing"
            :aria-invalid="!!shownError"
          />
        </FieldShell>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="pending"
            ><Spinner v-if="pending" />{{ floor ? 'Rename' : 'Add floor' }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
