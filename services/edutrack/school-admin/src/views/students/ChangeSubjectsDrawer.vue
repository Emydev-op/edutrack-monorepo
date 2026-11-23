<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorFields, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useChangeSubjectsMutation } from '@/api/services/students';
import SubjectPicker from '@/components/students/SubjectPicker.vue';
import { choiceProblems } from '@/lib/subject-choices';
import type { StudentSubjects } from '@/types';

const props = defineProps<{ studentId: string; view: StudentSubjects }>();
const open = defineModel<boolean>('open', { required: true });
const change = useChangeSubjectsMutation(() => props.studentId);

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  religious: props.view.chosen.religious,
  electives: [...props.view.chosen.electives],
  effectiveOn: today(),
  armId: props.view.armId ?? '',
  reason: '',
});
const form = reactive(blank());
const initial = ref(JSON.stringify(form));
const showErrors = ref(false);
const serverErrors = ref<Record<string, string>>({});
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  initial.value = JSON.stringify(form);
  showErrors.value = false;
  serverErrors.value = {};
  serverError.value = '';
});
const dirty = computed(() => JSON.stringify(form) !== initial.value);

const problems = computed(() => {
  const e = choiceProblems(props.view, { religious: form.religious, electives: form.electives });
  if (!form.effectiveOn) e.effectiveOn = 'Choose the date the change starts.';
  return e;
});
const errors = computed(() => ({
  ...(showErrors.value ? problems.value : {}),
  ...serverErrors.value,
}));

const otherArms = computed(() => props.view.arms.filter((a) => a.id !== props.view.armId));

async function save() {
  showErrors.value = true;
  serverErrors.value = {};
  serverError.value = '';
  if (Object.keys(problems.value).length) return;
  try {
    const res = await change.mutateAsync({
      religious: form.religious,
      electives: form.electives,
      effectiveOn: form.effectiveOn,
      armId: form.armId && form.armId !== props.view.armId ? form.armId : undefined,
      reason: form.reason.trim() || undefined,
    });
    open.value = false;
    toast.success(messageOf(res, `${props.view.name}’s subjects were updated.`));
  } catch (e) {
    const fields = getApiErrorFields(e);
    serverErrors.value = fields;
    serverError.value = Object.keys(fields).length
      ? 'Check the highlighted choices.'
      : getApiErrorMessage(e, 'The subjects couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Change subjects"
    :description="`${view.name} · ${view.className} · ${view.session}`"
    :dirty="dirty"
  >
    <div class="flex flex-col gap-4">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Couldn’t change the subjects"
        :description="serverError"
        role="alert"
      />
      <SubjectPicker
        v-model:religious="form.religious"
        v-model:electives="form.electives"
        :religious-options="view.religious"
        :groups="view.groups"
        :errors="errors"
      />
      <p v-if="errors.electives" role="alert" class="text-xs text-destructive">
        {{ errors.electives }}
      </p>
      <p class="text-xs text-muted-foreground">
        Scores already entered for a dropped subject stay on that subject’s result sheet.
      </p>
      <FieldShell id="cs-date" label="Effective from" required :error="errors.effectiveOn">
        <Input
          id="cs-date"
          v-model="form.effectiveOn"
          type="date"
          :aria-invalid="!!errors.effectiveOn"
        />
      </FieldShell>
      <FieldShell
        v-if="otherArms.length"
        id="cs-arm"
        label="Move to another arm of this class"
        :error="errors.armId"
      >
        <select
          id="cs-arm"
          v-model="form.armId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!errors.armId"
        >
          <option :value="view.armId ?? ''">Stay in {{ view.className }}</option>
          <option v-for="a in otherArms" :key="a.id" :value="a.id" :disabled="a.used >= a.capacity">
            {{ a.label }} · {{ a.used }}/{{ a.capacity }}{{ a.used >= a.capacity ? ' · full' : '' }}
          </option>
        </select>
      </FieldShell>
      <FieldShell id="cs-reason" label="Reason">
        <Textarea
          id="cs-reason"
          v-model="form.reason"
          rows="3"
          placeholder="e.g. Moved to the science track after a parent meeting"
        />
      </FieldShell>
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="change.isPending.value" @click="save"
        ><Spinner v-if="change.isPending.value" /> Save subjects</Button
      >
    </template>
  </SideDrawer>
</template>
