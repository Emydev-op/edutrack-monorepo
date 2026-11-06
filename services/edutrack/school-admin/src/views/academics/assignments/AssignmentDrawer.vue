<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { useDebounceFn } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { checkAssignment, useSaveAssignmentMutation } from '@/api/services/academics';
import type { AssignmentInput, AssignmentsView, AssignmentType, AssignmentWarning } from '@/types';

/** Add or change who teaches a subject in a class arm, with live workload and conflict checks. */
const props = defineProps<{
  view: AssignmentsView;
  /** Pre-fill, e.g. a gap ("Chemistry · SSS 1A") or an existing assignment to reassign. */
  preset?: Partial<AssignmentInput>;
}>();
const open = defineModel<boolean>('open', { required: true });

const save = useSaveAssignmentMutation();
const TYPES: AssignmentType[] = ['Subject teacher', 'Temporary', 'Part-time'];

const blank = (): AssignmentInput => ({
  teacherId: props.preset?.teacherId ?? '',
  subject: props.preset?.subject ?? '',
  armId: props.preset?.armId ?? '',
  type: props.preset?.type ?? 'Subject teacher',
});
const form = reactive(blank());
const initial = ref(JSON.stringify(blank()));
const showErrors = ref(false);
const serverError = ref('');
const warnings = ref<AssignmentWarning[]>([]);
const checking = ref(false);

watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  initial.value = JSON.stringify(blank());
  showErrors.value = false;
  serverError.value = '';
  warnings.value = [];
});

const teacher = computed(() => props.view.teachers.find((t) => t.id === form.teacherId));
const branchNames = computed(() => [...new Set(props.view.arms.map((a) => a.branch))]);
/**
 * Arms that offer the subject. Arms carry branch names while teachers carry branch ids, so a
 * teacher at the wrong branch is caught by the live check ("doesn’t work at …") instead.
 */
const armOptions = computed(() =>
  props.view.arms.filter(
    (a) =>
      (!form.subject || a.subjects.includes(form.subject)) &&
      (!teacher.value || teacher.value.branches.includes(a.branchId)),
  ),
);
watch(armOptions, (list) => {
  if (form.armId && !list.some((a) => a.id === form.armId)) form.armId = '';
});

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.teacherId) e.teacherId = 'Choose a teacher.';
  if (!form.subject) e.subject = 'Choose a subject.';
  if (!form.armId)
    e.armId = form.subject ? 'Choose a class that offers this subject.' : 'Choose a class.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const blocking = computed(() =>
  warnings.value.filter((w) => w.tone === 'error' && w.kind !== 'conflict'),
);
const dirty = computed(() => JSON.stringify(form) !== initial.value);

const runCheck = useDebounceFn(async () => {
  if (!form.teacherId || !form.subject || !form.armId) return void (warnings.value = []);
  checking.value = true;
  try {
    warnings.value = await checkAssignment({ ...form });
  } catch {
    warnings.value = [];
  } finally {
    checking.value = false;
  }
}, 250);
watch(() => [form.teacherId, form.subject, form.armId], runCheck, { immediate: true });

const loadText = computed(() =>
  teacher.value
    ? `${teacher.value.periods} of ${teacher.value.maxPeriods} periods · ${teacher.value.employment}${teacher.value.qualified.length ? ` · qualified: ${teacher.value.qualified.join(', ')}` : ''}`
    : undefined,
);

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length || blocking.value.length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({ ...form });
    const arm = props.view.arms.find((a) => a.id === form.armId)?.name;
    const subject = props.view.subjects.find((s) => s.code === form.subject)?.name;
    toast.success(`${teacher.value?.name} now teaches ${subject} in ${arm}.`);
    open.value = false;
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t save the assignment. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="preset?.teacherId ? 'Reassign subject' : 'Add assignment'"
    :description="`Applies to ${view.term || 'this term'} and carries through the rest of the session.`"
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
      <FieldShell
        id="as-teacher"
        label="Teacher"
        required
        :error="err('teacherId')"
        :hint="loadText"
      >
        <select
          id="as-teacher"
          v-model="form.teacherId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!err('teacherId')"
        >
          <option value="">Choose…</option>
          <option v-for="t in view.teachers" :key="t.id" :value="t.id">
            {{ t.name }} · {{ t.periods }}/{{ t.maxPeriods }}
          </option>
        </select>
      </FieldShell>
      <FieldShell id="as-subject" label="Subject" required :error="err('subject')">
        <select
          id="as-subject"
          v-model="form.subject"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!err('subject')"
        >
          <option value="">Choose…</option>
          <option v-for="s in view.subjects" :key="s.code" :value="s.code">
            {{ s.name }} · {{ s.code }}
          </option>
        </select>
      </FieldShell>
      <FieldShell
        id="as-arm"
        label="Class"
        required
        :error="err('armId')"
        :hint="
          form.subject && !armOptions.length
            ? 'No class offers this subject at the teacher’s branches.'
            : 'Only classes that offer the subject are listed.'
        "
      >
        <select
          id="as-arm"
          v-model="form.armId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!err('armId')"
        >
          <option value="">Choose…</option>
          <option v-for="a in armOptions" :key="a.id" :value="a.id">
            {{ a.name }}{{ branchNames.length > 1 ? ` · ${a.branch}` : '' }}
          </option>
        </select>
      </FieldShell>
      <ChoiceCards
        v-model="form.type"
        label="Type"
        :columns="3"
        :choices="TYPES.map((t) => ({ value: t, label: t }))"
      />
      <div v-if="warnings.length" class="flex flex-col gap-2" aria-live="polite">
        <InlineNotice
          v-for="w in warnings"
          :key="w.text"
          :tone="w.tone"
          :title="
            w.kind === 'workload'
              ? 'Workload'
              : w.kind === 'qualification'
                ? 'Qualification'
                : w.kind === 'conflict'
                  ? 'Timetable conflict'
                  : w.kind === 'branch'
                    ? 'Branch'
                    : 'Check'
          "
          :description="w.text"
        />
      </div>
      <p v-else-if="checking" class="text-xs text-muted-foreground">
        Checking workload and timetable…
      </p>
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value || !!blocking.length" @click="submit">
        <Spinner v-if="save.isPending.value" />
        {{ save.isPending.value ? 'Saving…' : 'Save assignment' }}
      </Button>
    </template>
  </SideDrawer>
</template>
