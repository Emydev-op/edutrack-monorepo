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
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useAddArmMutation,
  useAssignmentsQuery,
  useDeleteArmMutation,
  useUpdateArmMutation,
} from '@/api/services/academics';
import type { ClassArm, ClassLevel } from '@/types';

/**
 * Add an arm to a class level, or edit one: name, places, class teacher and room. Arms with
 * students can't go below their head count or be removed.
 */
const props = defineProps<{
  /** The level an arm is added to (add mode). */
  level: ClassLevel | null;
  /** The arm being edited (edit mode). */
  arm: ClassArm | null;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ deleted: [] }>();

const confirm = useConfirm();
const { data: assignments } = useAssignmentsQuery('');
const add = useAddArmMutation();
const update = useUpdateArmMutation();
const remove = useDeleteArmMutation();

const branchId = computed(() => props.arm?.branchId ?? props.level?.branchId ?? '');
const levelName = computed(() => props.arm?.level ?? props.level?.name ?? '');
const siblings = computed(() => (props.level?.arms ?? []).map((a) => a.arm));
const nextLetter = () => 'ABCDEFGHIJKL'.split('').find((c) => !siblings.value.includes(c)) ?? '';

const initial = () => ({
  arm: props.arm?.arm ?? nextLetter(),
  capacity: String(props.arm?.capacity ?? props.level?.arms[0]?.capacity ?? 35),
  classTeacherId: props.arm?.classTeacherId ?? '',
  room: props.arm?.room ?? '',
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

const teachers = computed(() =>
  (assignments.value?.teachers ?? []).filter((t) => t.branches.includes(branchId.value)),
);
const students = computed(() => props.arm?.students ?? 0);
const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.arm.trim();
  if (!name) e.arm = 'Name the arm, e.g. A or Gold.';
  else if (
    siblings.value.some((a) => a.toLowerCase() === name.toLowerCase() && a !== props.arm?.arm)
  )
    e.arm = `${levelName.value} already has arm ${name}.`;
  const cap = Number(form.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) e.capacity = 'Between 1 and 100.';
  else if (cap < students.value) e.capacity = `${students.value} students are already in this arm.`;
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));
const pending = computed(() => add.isPending.value || update.isPending.value);

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  const payload = {
    arm: form.arm.trim(),
    capacity: Number(form.capacity),
    classTeacherId: form.classTeacherId || null,
    room: form.room.trim(),
  };
  try {
    if (props.arm) await update.mutateAsync({ id: props.arm.id, ...payload });
    else await add.mutateAsync({ levelId: props.level!.id, ...payload });
    open.value = false;
    toast.success(
      props.arm
        ? 'Arm saved.'
        : `Arm ${levelName.value}${/\d$/.test(levelName.value) ? '' : ' '}${payload.arm} added.`,
    );
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

function deleteArm() {
  const a = props.arm!;
  void confirm({
    title: `Remove ${a.name}?`,
    description: a.students
      ? undefined
      : 'Its teacher assignments and timetable are removed too. This can’t be undone.',
    details: [
      ['Students', String(a.students)],
      ['Class teacher', a.classTeacher ?? 'None'],
    ],
    confirmLabel: 'Remove arm',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(a.id);
      open.value = false;
      emit('deleted');
      toast.success(`${a.name} removed.`);
    },
  });
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="arm ? `Edit ${arm.name}` : `Add an arm to ${levelName}`"
    description="Arms are the streams a class level is split into. Each has its own class teacher, timetable and results."
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
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell id="arm-name" label="Arm" required :error="err('arm')" hint="e.g. A, B or Gold">
          <Input id="arm-name" v-model="form.arm" :aria-invalid="!!err('arm')" />
        </FieldShell>
        <FieldShell
          id="arm-cap"
          label="Places"
          required
          :error="err('capacity')"
          :hint="arm ? `${arm.students} enrolled now` : undefined"
        >
          <Input
            id="arm-cap"
            v-model="form.capacity"
            inputmode="numeric"
            :aria-invalid="!!err('capacity')"
          />
        </FieldShell>
      </div>
      <FieldShell
        id="arm-teacher"
        label="Class teacher"
        :hint="
          teachers.length
            ? 'Form teacher: writes report card comments and proposes promotions.'
            : 'No teaching staff at this branch yet. You can assign one later.'
        "
      >
        <select
          id="arm-teacher"
          v-model="form.classTeacherId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Not assigned</option>
          <option v-for="t in teachers" :key="t.id" :value="t.id">
            {{ t.name
            }}{{
              t.classTeacherOf.length ? ` · class teacher of ${t.classTeacherOf.join(', ')}` : ''
            }}
          </option>
        </select>
      </FieldShell>
      <FieldShell id="arm-room" label="Room" hint="Optional, e.g. Room J2B · Block C">
        <Input id="arm-room" v-model="form.room" />
      </FieldShell>
      <div class="flex items-center gap-2 border-t border-divider pt-4">
        <Button
          v-if="arm"
          variant="ghost"
          class="text-destructive"
          :disabled="arm.students > 0"
          :title="arm.students ? 'Move its students to another arm first.' : undefined"
          @click="deleteArm"
          >Remove arm</Button
        >
        <span class="flex-1" />
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button :disabled="pending" @click="submit"
          ><Spinner v-if="pending" />{{ arm ? 'Save arm' : 'Add arm' }}</Button
        >
      </div>
    </div>
  </SideDrawer>
</template>
