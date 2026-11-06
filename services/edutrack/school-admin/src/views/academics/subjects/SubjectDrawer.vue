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

import { useDeleteSubjectMutation, useSaveSubjectMutation } from '@/api/services/academics';
import type { Subject, SubjectCategory } from '@/types';

import { CATEGORIES } from './subject-categories';

/** Add a subject to the school's list, or edit one. The code can't change once created. */
const props = defineProps<{ subject: Subject | null; subjects: Subject[] }>();
const open = defineModel<boolean>('open', { required: true });

const confirm = useConfirm();
const save = useSaveSubjectMutation();
const remove = useDeleteSubjectMutation();

const initial = () => ({
  name: props.subject?.name ?? '',
  code: props.subject?.code ?? '',
  category: props.subject?.category ?? ('Core' as SubjectCategory),
  periods: String(props.subject?.periods ?? 2),
  status: props.subject?.status ?? ('Active' as 'Active' | 'Inactive'),
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
/** Suggest a code from the name while adding. */
watch(
  () => form.name,
  (n) => {
    if (props.subject || showErrors.value) return;
    form.code = n
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();
  },
);

const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the subject.';
  else if (
    props.subjects.some(
      (s) => s.code !== props.subject?.code && s.name.toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = `${name} already exists.`;
  if (!props.subject) {
    if (!/^[A-Z]{2,4}\d?$/.test(form.code)) e.code = '2–4 capitals, e.g. MTH.';
    else if (props.subjects.some((s) => s.code === form.code))
      e.code = `Already used by ${props.subjects.find((s) => s.code === form.code)!.name}.`;
  }
  const p = Number(form.periods);
  if (!Number.isInteger(p) || p < 1 || p > 10) e.periods = 'Between 1 and 10.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({
      original: props.subject?.code,
      code: form.code,
      name: form.name.trim(),
      category: form.category,
      periods: Number(form.periods),
      status: form.status,
    });
    open.value = false;
    toast.success(
      props.subject
        ? `${form.name.trim()} saved.`
        : `${form.name.trim()} added. Add it to classes in Curriculum by class.`,
    );
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

function deleteSubject() {
  const s = props.subject!;
  void confirm({
    title: `Delete ${s.name}?`,
    description: 'It is removed from every class curriculum and elective group.',
    details: [
      ['Classes', s.levels.join(', ') || 'None'],
      ['Teachers', s.teachers.join(', ') || 'None'],
    ],
    confirmLabel: 'Delete subject',
    tone: 'destructive',
    action: async () => {
      await remove.mutateAsync(s.code);
      open.value = false;
      toast.success(`${s.name} deleted.`);
    },
  });
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="subject ? `Edit ${subject.name}` : 'Add subject'"
    description="Codes appear on timetables and report cards."
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
      <InlineNotice
        v-if="subject?.hasScores"
        tone="info"
        title="This subject has scores this session"
        description="It can’t be deleted or taken out of a class until the session closes. You can make it inactive for future sessions."
      />
      <FieldShell id="sub-name" label="Subject name" required :error="err('name')">
        <Input
          id="sub-name"
          v-model="form.name"
          placeholder="e.g. Mathematics"
          :aria-invalid="!!err('name')"
        />
      </FieldShell>
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="sub-code"
          label="Code"
          required
          :error="err('code')"
          :hint="subject ? 'Can’t be changed' : '2–4 capitals, e.g. MTH'"
        >
          <Input
            id="sub-code"
            v-model="form.code"
            :disabled="!!subject"
            maxlength="5"
            :aria-invalid="!!err('code')"
            @input="form.code = form.code.toUpperCase()"
          />
        </FieldShell>
        <FieldShell
          id="sub-periods"
          label="Lessons per week"
          required
          :error="err('periods')"
          hint="Timetables place this many"
        >
          <Input
            id="sub-periods"
            v-model="form.periods"
            inputmode="numeric"
            :aria-invalid="!!err('periods')"
          />
        </FieldShell>
        <FieldShell id="sub-cat" label="Category">
          <select
            id="sub-cat"
            v-model="form.category"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="c in CATEGORIES" :key="c">{{ c }}</option>
          </select>
        </FieldShell>
        <FieldShell id="sub-status" label="Status">
          <select
            id="sub-status"
            v-model="form.status"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </FieldShell>
      </div>
      <div class="flex items-center gap-2 border-t border-divider pt-4">
        <Button
          v-if="subject"
          variant="ghost"
          class="text-destructive"
          :disabled="subject.hasScores"
          @click="deleteSubject"
          >Delete</Button
        >
        <span class="flex-1" />
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button :disabled="save.isPending.value" @click="submit"
          ><Spinner v-if="save.isPending.value" />{{
            subject ? 'Save subject' : 'Add subject'
          }}</Button
        >
      </div>
    </div>
  </SideDrawer>
</template>
