<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';

import { useSetHostelStaffMutation } from '@/api/services/boarding';
import { useStaffOptionsQuery } from '@/api/services/school';
import type { Hostel, HostelStaffRole } from '@/types';

import { FLOOR_MASTER, HOUSE_MASTER, STAFF_ROLES } from './boarding-format';

/**
 * The hostel's house staff: house master / mistress, floor masters / mistresses (each for a
 * floor) and assistants, picked from the staff directory. Saving replaces the whole list.
 */
const props = defineProps<{ hostel: Hostel }>();
const open = defineModel<boolean>('open', { required: true });

const { data: staff, isPending: staffLoading } = useStaffOptionsQuery();
const save = useSetHostelStaffMutation();

interface Row {
  key: number;
  staffId: string;
  role: HostelStaffRole;
  floorId: string;
}
let seq = 0;
const rows = ref<Row[]>([]);
const fields = ref<Record<string, string>>({});
const serverError = ref('');
const showErrors = ref(false);

watch(open, (o) => {
  if (!o) return;
  rows.value = props.hostel.staff.map((s) => ({
    key: ++seq,
    staffId: s.staffId,
    role: s.role,
    floorId: s.floorId ?? '',
  }));
  if (!rows.value.length) addRow();
  fields.value = {};
  serverError.value = '';
  showErrors.value = false;
});
watch(rows, () => (fields.value = {}), { deep: true });

function addRow() {
  const hasHead = rows.value.some((r) => r.role === HOUSE_MASTER);
  rows.value.push({
    key: ++seq,
    staffId: '',
    role: hasHead ? (props.hostel.floors.length ? FLOOR_MASTER : 'Assistant') : HOUSE_MASTER,
    floorId: '',
  });
}
const removeRow = (i: number) => rows.value.splice(i, 1);

/** Staff still at the school, plus anyone already listed (so a former member still shows). */
const options = computed(() => {
  const list = (staff.value ?? []).filter((s) => s.account !== 'Deactivated');
  const known = new Set(list.map((s) => s.id));
  const extra = props.hostel.staff
    .filter((s) => !known.has(s.staffId))
    .map((s) => ({ id: s.staffId, name: `${s.name} (left)`, position: '' }));
  return [...list, ...extra];
});

const errors = computed(() => {
  const e: Record<string, string> = { ...fields.value };
  const seen = new Set<string>();
  rows.value.forEach((r, i) => {
    const k = `entries.${i}`;
    if (e[k]) return;
    if (!r.staffId) e[k] = 'Choose a staff member, or remove this row.';
    else if (seen.has(r.staffId)) e[k] = 'This person is listed twice.';
    else if (r.role === FLOOR_MASTER && !r.floorId)
      e[k] = 'Choose the floor or wing they look after.';
    seen.add(r.staffId);
  });
  return e;
});
const err = (i: number) =>
  showErrors.value || fields.value[`entries.${i}`] ? errors.value[`entries.${i}`] : undefined;

async function submit() {
  showErrors.value = true;
  serverError.value = '';
  if (Object.keys(errors.value).length) return;
  try {
    const result = await save.mutateAsync({
      hostelId: props.hostel.id,
      entries: rows.value.map((r) => ({
        staffId: r.staffId,
        role: r.role,
        floorId: r.role === FLOOR_MASTER ? r.floorId : null,
      })),
    });
    toast.success(messageOf(result, `House staff for ${props.hostel.name} saved.`));
    open.value = false;
  } catch (e) {
    const fe = getApiErrorFields(e);
    if (Object.keys(fe).length) {
      fields.value = fe;
      const other = Object.entries(fe).find(([k]) => !k.startsWith('entries.'));
      if (other) serverError.value = other[1];
      return;
    }
    serverError.value = getApiErrorMessage(e, 'House staff didn’t save. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[640px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">House staff · {{ hostel.name }}</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          The house master / mistress runs the hostel. A floor master / mistress looks after one
          floor or wing. Assistants help across the hostel.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-3 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not saved"
          :description="serverError"
          role="alert"
        />

        <p v-if="!rows.length" class="text-[13px] text-muted-foreground">
          No house staff. Add someone, or save to clear the list.
        </p>
        <div
          v-for="(r, i) in rows"
          :key="r.key"
          class="flex flex-col gap-1 rounded-md border bg-muted/40 p-2.5"
        >
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            <select
              v-model="r.staffId"
              class="h-9 min-w-0 rounded-md border bg-card px-2.5 text-sm"
              :aria-label="`Staff member ${i + 1}`"
              :aria-invalid="!!err(i)"
              :disabled="staffLoading"
            >
              <option value="" disabled>
                {{ staffLoading ? 'Loading staff…' : 'Choose a staff member' }}
              </option>
              <option v-for="s in options" :key="s.id" :value="s.id">
                {{ s.name }}{{ s.position ? ` · ${s.position}` : '' }}
              </option>
            </select>
            <select
              v-model="r.role"
              class="h-9 min-w-0 rounded-md border bg-card px-2.5 text-sm"
              :aria-label="`Role ${i + 1}`"
            >
              <option
                v-for="role in STAFF_ROLES"
                :key="role"
                :value="role"
                :disabled="role === FLOOR_MASTER && !hostel.floors.length"
              >
                {{ role }}
              </option>
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :aria-label="`Remove row ${i + 1}`"
              @click="removeRow(i)"
              ><Trash2Icon
            /></Button>
          </div>
          <select
            v-if="r.role === FLOOR_MASTER"
            v-model="r.floorId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
            :aria-label="`Floor for row ${i + 1}`"
          >
            <option value="" disabled>Which floor or wing?</option>
            <option v-for="f in hostel.floors" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <p v-if="err(i)" role="alert" class="text-xs text-destructive">{{ err(i) }}</p>
        </div>

        <Button type="button" variant="ghost" size="sm" class="self-start" @click="addRow"
          ><PlusIcon />Add someone</Button
        >
        <p v-if="!hostel.floors.length" class="text-xs text-faint">
          Add floors or wings to the hostel to give someone a floor.
        </p>

        <div class="flex justify-end gap-2 border-t border-divider pt-3">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="save.isPending.value"
            ><Spinner v-if="save.isPending.value" />Save house staff</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
