<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import {
  useRolesQuery,
  useSavePositionMutation,
  useStaffOptionsQuery,
} from '@/api/services/school';
import ChipGroup from '@/components/school/ChipGroup.vue';
import { APPROVALS } from '@/config/permissions';
import type { Position } from '@/types';

const props = defineProps<{
  /** The position to edit, or none to add one. */
  position: Position | null;
  /** For a new position: who it reports to. */
  parentId: string | null;
  positions: Position[];
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [id: string] }>();

const { data: staff } = useStaffOptionsQuery();
const { data: roles } = useRolesQuery();
const save = useSavePositionMutation();

const initial = () => ({
  title: props.position?.title ?? '',
  parentId: props.position ? (props.position.parentId ?? '') : (props.parentId ?? ''),
  holders: [...(props.position?.holderNames ?? [])],
  suggestedRoles: [...(props.position?.suggestedRoles ?? [])],
  responsibilities: props.position?.responsibilities ?? '',
  approvals: [...(props.position?.approvals ?? [])],
});
const form = reactive(initial());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  showErrors.value = false;
  serverError.value = '';
});

/** A position can't report to itself or to anyone below it. */
const below = computed(() => {
  const out = new Set<string>();
  const walk = (id: string) =>
    props.positions.filter((p) => p.parentId === id).forEach((p) => (out.add(p.id), walk(p.id)));
  if (props.position) walk(props.position.id);
  return out;
});
const parents = computed(() => [
  { value: '', label: 'Top of the organisation' },
  ...props.positions
    .filter((p) => p.id !== props.position?.id && !below.value.has(p.id))
    .map((p) => ({ value: p.id, label: p.title })),
]);

const errors = computed(() => {
  const e: Record<string, string> = {};
  const t = form.title.trim();
  if (!t) e.title = 'Enter the position title.';
  else if (
    props.positions.some(
      (p) => p.id !== props.position?.id && p.title.toLowerCase() === t.toLowerCase(),
    )
  )
    e.title = 'This position already exists.';
  if (!form.parentId && props.positions.some((p) => !p.parentId && p.id !== props.position?.id))
    e.parentId = 'Only one position can be at the top. Choose who this reports to.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const saved = await save.mutateAsync({
      id: props.position?.id,
      title: form.title.trim(),
      parentId: form.parentId || null,
      holderIds: form.holders
        .map((n) => staff.value?.find((s) => s.name === n)?.id)
        .filter((x): x is string => !!x),
      suggestedRoles: form.suggestedRoles,
      responsibilities: form.responsibilities,
      approvals: form.approvals,
    });
    open.value = false;
    emit('saved', saved.id);
    toast.success(props.position ? 'Position saved.' : 'Position added.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="position ? 'Edit position' : 'Add a position'"
    description="Positions describe reporting lines and approvals. They don’t grant system access by themselves."
    :dirty="dirty"
  >
    <div class="flex flex-col gap-4.5">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Something went wrong"
        :description="serverError"
        role="alert"
      />
      <FieldShell id="pos-title" label="Position title" required :error="err('title')">
        <Input
          id="pos-title"
          v-model="form.title"
          placeholder="e.g. HOD Languages"
          :aria-invalid="!!err('title')"
        />
      </FieldShell>
      <FieldShell id="pos-parent" label="Reports to" :error="err('parentId')">
        <select
          id="pos-parent"
          v-model="form.parentId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option v-for="p in parents" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </FieldShell>
      <ChipGroup
        v-model="form.holders"
        label="Held by"
        :options="(staff ?? []).map((s) => s.name)"
        hint="Leave empty if the position is vacant."
      />
      <ChipGroup
        v-model="form.suggestedRoles"
        label="Suggested system roles"
        :options="(roles ?? []).map((r) => r.name)"
        hint="Offered when you invite a holder. Change actual access in Users & Roles."
      />
      <FieldShell id="pos-resp" label="Responsibilities">
        <Textarea
          id="pos-resp"
          v-model="form.responsibilities"
          rows="3"
          placeholder="e.g. Languages department, 11 teachers"
        />
      </FieldShell>
      <ChipGroup v-model="form.approvals" label="Approval authority" :options="APPROVALS" />
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit">
        <Spinner v-if="save.isPending.value" />
        {{ save.isPending.value ? 'Saving…' : position ? 'Save position' : 'Add position' }}
      </Button>
    </template>
  </SideDrawer>
</template>
