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
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';

import { useCreateHostelMutation, useUpdateHostelMutation } from '@/api/services/boarding';
import type { BoardingSettings, Hostel, HostelGender } from '@/types';

import { boardingLevels, GENDERS } from './boarding-format';

/**
 * Add a hostel, or edit one: campus (only campuses that take boarders), name, Boys / Girls /
 * Mixed, the classes it houses (none picked = every boarding class at the campus) and a note.
 */
const props = defineProps<{
  settings: BoardingSettings | undefined;
  /** The hostel being edited; add mode without it. */
  hostel?: Hostel | null;
  /** The campus to start with in add mode. */
  branchId?: string;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [hostel: Hostel] }>();

const create = useCreateHostelMutation();
const update = useUpdateHostelMutation();

const campuses = computed(() =>
  (props.settings?.campuses ?? []).filter((c) => c.sections.some((s) => s.boarding)),
);

const initial = () => ({
  branchId: props.hostel?.branchId ?? props.branchId ?? campuses.value[0]?.branchId ?? '',
  name: props.hostel?.name ?? '',
  gender: (props.hostel?.gender ?? '') as HostelGender | '',
  levelIds: [...(props.hostel?.levelIds ?? [])],
  note: props.hostel?.note ?? '',
});
const form = reactive(initial());
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(
  open,
  (o) => {
    if (!o) return;
    Object.assign(form, initial());
    fields.value = {};
    serverError.value = '';
    showErrors.value = false;
  },
  { immediate: true },
);

const campus = computed(() => props.settings?.campuses.find((c) => c.branchId === form.branchId));
const levels = computed(() => boardingLevels(campus.value));
function changeCampus(id: string) {
  form.branchId = id;
  form.levelIds = [];
  clearField('branchId');
}
const clearField = (k: string) => {
  if (fields.value[k])
    fields.value = Object.fromEntries(Object.entries(fields.value).filter(([f]) => f !== k));
};
function pickGender(g: HostelGender) {
  form.gender = g;
  clearField('gender');
}
function toggleLevel(id: string) {
  form.levelIds = form.levelIds.includes(id)
    ? form.levelIds.filter((x) => x !== id)
    : [...form.levelIds, id];
  clearField('levelIds');
}

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  if (!form.branchId) e.branchId ??= 'Choose the campus.';
  if (!form.name.trim()) e.name ??= 'Name the hostel, e.g. Aggrey House.';
  if (!form.gender) e.gender ??= 'Choose who stays here.';
  return e;
});
const err = (k: string) => (showErrors.value || fields.value[k] ? errors.value[k] : undefined);
const pending = computed(() => create.isPending.value || update.isPending.value);

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  const payload = {
    branchId: form.branchId,
    name: form.name.trim(),
    gender: form.gender as HostelGender,
    levelIds: levels.value.map((l) => l.id).filter((id) => form.levelIds.includes(id)),
    note: form.note.trim(),
  };
  try {
    const result = props.hostel
      ? await update.mutateAsync({ id: props.hostel.id, ...payload })
      : await create.mutateAsync(payload);
    toast.success(
      messageOf(result, props.hostel ? `${result.name} saved.` : `${result.name} added.`),
    );
    open.value = false;
    emit('saved', result);
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) return void (fields.value = fe);
    serverError.value = getApiErrorMessage(e, 'The hostel didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[520px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">{{
          hostel ? `Edit ${hostel.name}` : 'Add a hostel'
        }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          A hostel is a boarding house. Add its floors or wings and rooms next.
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

        <FieldShell
          id="hostel-campus"
          label="Campus"
          required
          :error="err('branchId')"
          :hint="
            hostel && hostel.totals.rooms
              ? 'A hostel with rooms can’t move to another campus.'
              : 'Only campuses that take boarders.'
          "
        >
          <select
            id="hostel-campus"
            :value="form.branchId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
            :aria-invalid="!!err('branchId')"
            @change="changeCampus(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Choose a campus</option>
            <option v-for="c in campuses" :key="c.branchId" :value="c.branchId">
              {{ c.name }}
            </option>
          </select>
        </FieldShell>

        <FieldShell id="hostel-name" label="Name" required :error="err('name')">
          <Input
            id="hostel-name"
            v-model="form.name"
            maxlength="80"
            placeholder="e.g. Aggrey House"
            :aria-invalid="!!err('name')"
            @update:model-value="clearField('name')"
          />
        </FieldShell>

        <FieldShell id="hostel-gender" label="Who stays here" required :error="err('gender')">
          <div id="hostel-gender" class="flex gap-2" role="radiogroup" aria-label="Who stays here">
            <button
              v-for="g in GENDERS"
              :key="g"
              type="button"
              role="radio"
              :aria-checked="form.gender === g"
              class="flex-1 rounded-md border px-3 py-1.5 text-sm"
              :class="
                form.gender === g
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:border-primary'
              "
              @click="pickGender(g)"
            >
              {{ g }}
            </button>
          </div>
        </FieldShell>

        <FieldShell
          id="hostel-classes"
          label="Classes"
          :error="err('levelIds')"
          :hint="
            form.levelIds.length
              ? 'Only these classes can be given a place here.'
              : 'None picked: every boarding class at the campus.'
          "
        >
          <div
            id="hostel-classes"
            class="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Classes this hostel houses"
          >
            <button
              v-for="l in levels"
              :key="l.id"
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-xs"
              :class="
                form.levelIds.includes(l.id)
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:border-primary'
              "
              :aria-pressed="form.levelIds.includes(l.id)"
              @click="toggleLevel(l.id)"
            >
              {{ l.name }}
            </button>
            <span v-if="!levels.length" class="text-xs font-normal text-faint"
              >Choose a campus to see its boarding classes.</span
            >
          </div>
        </FieldShell>

        <FieldShell id="hostel-note" label="Note" hint="Optional, e.g. where it is on campus.">
          <Textarea id="hostel-note" v-model="form.note" rows="2" maxlength="300" />
        </FieldShell>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="pending"
            ><Spinner v-if="pending" />{{ hostel ? 'Save hostel' : 'Add hostel' }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
