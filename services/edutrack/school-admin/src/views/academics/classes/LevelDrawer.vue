<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useAddLevelMutation, useRenameLevelMutation } from '@/api/services/academics';
import type { ClassesView, ClassLevel } from '@/types';

/** Add a class level (with its arms), or rename one. */
const props = defineProps<{
  view: ClassesView;
  /** The level to rename; none to add one. */
  level: ClassLevel | null;
  /** Preselected branch and section when adding. */
  branchId?: string;
  section?: string;
}>();
const open = defineModel<boolean>('open', { required: true });

const add = useAddLevelMutation();
const rename = useRenameLevelMutation();

const END = '__end';
const START = '__start';
const initial = () => {
  const branchId = props.level?.branchId ?? props.branchId ?? props.view.branches[0]?.id ?? '';
  const branch = props.view.branches.find((b) => b.id === branchId);
  const section = props.level?.section ?? props.section ?? branch?.sections[0] ?? '';
  return {
    branchId,
    section,
    name: props.level?.name ?? '',
    arms: 'A',
    capacity: '35',
    position: END,
  };
};
const form = reactive(initial());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  form.name ||= missing.value[0] ?? '';
  showErrors.value = false;
  serverError.value = '';
});

const branch = computed(() => props.view.branches.find((b) => b.id === form.branchId));
const sectionOptions = computed(() => branch.value?.sections ?? []);
watch(
  () => form.branchId,
  () => {
    if (!sectionOptions.value.includes(form.section)) form.section = sectionOptions.value[0] ?? '';
  },
);
const inSection = computed(() =>
  props.view.levels.filter((l) => l.branchId === form.branchId && l.section === form.section),
);
const code = computed(() => props.view.sections.find((s) => s.name === form.section)?.code ?? '');
const missing = computed(() =>
  (props.view.defaults[code.value] ?? []).filter((n) => !inSection.value.some((l) => l.name === n)),
);
watch(
  () => form.section,
  () => {
    if (!props.level) form.name = missing.value[0] ?? '';
    form.capacity = code.value === 'NUR' ? '25' : '35';
  },
);

const armList = computed(() =>
  form.arms
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean),
);
const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the class level, e.g. JSS 1.';
  else if (
    props.view.levels.some(
      (l) =>
        l.id !== props.level?.id &&
        l.branchId === form.branchId &&
        l.name.toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = `${branch.value?.name ?? 'This branch'} already has ${name}.`;
  if (!props.level) {
    if (!form.section) e.section = 'This branch runs no sections. Add one to the branch first.';
    if (!armList.value.length) e.arms = 'Add at least one arm, e.g. A.';
    else if (armList.value.length > 12) e.arms = 'Use 12 arms or fewer.';
    else if (new Set(armList.value.map((a) => a.toLowerCase())).size !== armList.value.length)
      e.arms = 'Arm names must be different.';
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100) e.capacity = 'Between 1 and 100.';
  }
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));
const pending = computed(() => add.isPending.value || rename.isPending.value);

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    if (props.level) {
      await rename.mutateAsync({ id: props.level.id, name: form.name.trim() });
      toast.success(`Renamed to ${form.name.trim()}. Students and curriculum moved with it.`);
    } else {
      await add.mutateAsync({
        branchId: form.branchId,
        section: form.section,
        name: form.name.trim(),
        arms: armList.value,
        capacity: Number(form.capacity),
        after: form.position === END ? undefined : form.position === START ? null : form.position,
      });
      toast.success(
        `${form.name.trim()} added with ${armList.value.length} arm${armList.value.length === 1 ? '' : 's'}.`,
      );
    }
    open.value = false;
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="level ? `Rename ${level.name}` : 'Add a class level'"
    :description="
      level
        ? 'Renames carry students, curriculum, teacher assignments and timetables with them.'
        : 'Order is the promotion path: students move from one level to the next each session.'
    "
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
      <template v-if="!level">
        <FieldShell v-if="view.branches.length > 1" id="lv-branch" label="Branch" required>
          <select
            id="lv-branch"
            v-model="form.branchId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="b in view.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </FieldShell>
        <FieldShell id="lv-section" label="Section" required :error="err('section')">
          <select
            id="lv-section"
            v-model="form.section"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="s in sectionOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </FieldShell>
      </template>
      <FieldShell
        id="lv-name"
        label="Class level"
        required
        :error="err('name')"
        :hint="
          !level && missing.length
            ? `Standard levels not added yet: ${missing.join(', ')}`
            : undefined
        "
      >
        <Input
          id="lv-name"
          v-model="form.name"
          placeholder="e.g. JSS 1"
          :aria-invalid="!!err('name')"
        />
      </FieldShell>
      <div v-if="!level && missing.length > 1" class="-mt-2 flex flex-wrap gap-1.5">
        <Button
          v-for="n in missing"
          :key="n"
          size="sm"
          variant="outline"
          class="h-7 text-xs"
          @click="form.name = n"
          >{{ n }}</Button
        >
      </div>
      <template v-if="!level">
        <div class="grid gap-4 sm:grid-cols-2">
          <FieldShell
            id="lv-arms"
            label="Arms"
            required
            :error="err('arms')"
            hint="Comma separated · A, B, C or Gold, Blue"
          >
            <Input id="lv-arms" v-model="form.arms" :aria-invalid="!!err('arms')" />
          </FieldShell>
          <FieldShell id="lv-cap" label="Places per arm" required :error="err('capacity')">
            <Input
              id="lv-cap"
              v-model="form.capacity"
              inputmode="numeric"
              :aria-invalid="!!err('capacity')"
            />
          </FieldShell>
        </div>
        <FieldShell
          v-if="inSection.length"
          id="lv-pos"
          label="Position"
          hint="Where it sits in the promotion path."
        >
          <select
            id="lv-pos"
            v-model="form.position"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option :value="START">First in {{ form.section }}</option>
            <option v-for="l in inSection" :key="l.id" :value="l.id">After {{ l.name }}</option>
            <option :value="END">Last in {{ form.section }}</option>
          </select>
        </FieldShell>
        <p class="text-xs text-muted-foreground">
          {{ armList.length }} arm{{ armList.length === 1 ? '' : 's' }} ·
          {{ armList.length * (Number(form.capacity) || 0) }} places. Class teachers are assigned
          later in Teacher Assignments.
        </p>
      </template>
      <div class="flex justify-end gap-2 border-t border-divider pt-4">
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button :disabled="pending" @click="submit"
          ><Spinner v-if="pending" />{{ level ? 'Rename' : 'Add class level' }}</Button
        >
      </div>
    </div>
  </SideDrawer>
</template>
