<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useField, useForm } from 'vee-validate';
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useAssignmentQuery, useSaveAssignmentMutation } from '@/api/services/assignments';
import { useMaterialsQuery } from '@/api/services/materials';
import { useMyScopeQuery } from '@/api/services/shell';
import AttachmentPicker from '@/components/assignments/AttachmentPicker.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDay, formatDeadline } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { AssignmentPayload, FileRef } from '@/types';

import { API_FIELD, assignmentSchema } from './assignment-schema';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const { term, activeTerm, now, isReadOnly, readOnlyReason } = useTermContext();

const editId = computed(() =>
  typeof route.params.assignmentId === 'string' ? route.params.assignmentId : '',
);
const isEdit = computed(() => Boolean(editId.value));
const { data: existing, isPending: loadingExisting, error: loadError } = useAssignmentQuery(editId);
const { data: scope, isPending: loadingScope } = useMyScopeQuery();
const save = useSaveAssignmentMutation();

const formTerm = computed(() => activeTerm.value ?? term.value);
const { handleSubmit, resetForm, meta, values, setFieldValue, setErrors } = useForm({
  validationSchema: assignmentSchema({
    termStart: () => formTerm.value?.start ?? '',
    termEnd: () => formTerm.value?.end ?? '',
    termName: () => formTerm.value?.name ?? 'the term',
    now: () => now.value,
    savedDueAt: () => existing.value?.dueAt ?? null,
    highest: () => existing.value?.highestScore ?? null,
  }),
  initialValues: {
    publish: true,
    classKey: '',
    title: '',
    instructions: '',
    dueDate: '',
    dueTime: '16:00',
    maxScore: 20 as number | null,
    allowLate: 'no',
  },
});
const { value: allowLate } = useField<string>('allowLate');
const attachments = ref<FileRef[]>([]);
const savedAttachments = ref('[]');
const attachmentError = ref('');
const serverError = ref('');
const done = ref(false);

const classOptions = computed(() =>
  (scope.value?.assignments ?? []).map((a) => ({
    value: `${a.armId}|${a.subject}`,
    label: `${a.armName}${scope.value?.multiCampus ? ` (${a.branchName.replace(' Campus', '')})` : ''} · ${a.subjectName}`,
  })),
);
const chosen = computed(() => {
  const [armId = '', subject = ''] = (values.classKey ?? '').split('|');
  return scope.value?.assignments.find((a) => a.armId === armId && a.subject === subject) ?? null;
});

// Prefill from ?class=&subject= on a new assignment.
watch(
  scope,
  (s) => {
    if (!s || isEdit.value || meta.value.dirty) return;
    const key = `${route.query.class ?? ''}|${route.query.subject ?? ''}`;
    if (s.assignments.some((a) => `${a.armId}|${a.subject}` === key))
      resetForm({ values: { ...values, classKey: key } });
  },
  { immediate: true },
);
// Load the saved assignment on edit.
watch(
  existing,
  (a) => {
    if (!a || meta.value.dirty) return;
    resetForm({
      values: {
        publish: a.status !== 'Draft',
        classKey: `${a.armId}|${a.subject}`,
        title: a.title,
        instructions: a.instructions,
        dueDate: a.dueAt?.slice(0, 10) ?? '',
        dueTime: a.dueAt?.slice(11, 16) ?? '16:00',
        maxScore: a.maxScore,
        allowLate: a.allowLate ? 'yes' : 'no',
      },
    });
    attachments.value = a.attachments.map((f) => ({
      name: f.name,
      type: f.type,
      bytes: f.bytes,
      ...(f.materialId ? { materialId: f.materialId } : {}),
    }));
    savedAttachments.value = JSON.stringify(attachments.value);
  },
  { immediate: true },
);

const { data: materials } = useMaterialsQuery(() => ({
  class: chosen.value?.armId,
  subject: chosen.value?.subject,
  status: 'Published',
  pageSize: 50,
}));
const classMaterials = computed(() => (chosen.value ? (materials.value?.data ?? []) : []));

const dirty = computed(
  () => meta.value.dirty || JSON.stringify(attachments.value) !== savedAttachments.value,
);
useUnsavedWork(
  () => dirty.value && !done.value,
  () => (isEdit.value ? `Assignment changes · ${values.title || 'untitled'}` : 'New assignment'),
);

const isPublished = computed(() => existing.value?.status === 'Published');
const lockReason = computed(() => {
  if (isEdit.value && existing.value && !existing.value.permissions.edit)
    return (
      existing.value.permissions.lockReason ??
      'Submissions are closed. Reopen the assignment to change it.'
    );
  if (!isEdit.value && isReadOnly.value)
    return readOnlyReason.value ?? 'Only the active term can be changed.';
  return null;
});

const dueHint = computed(() =>
  formTerm.value
    ? `Inside ${formTerm.value.name}: ${formatDay(formTerm.value.start, false)} – ${formatDay(formTerm.value.end, false)}`
    : undefined,
);
const maxHint = computed(() =>
  existing.value?.highestScore
    ? `A whole number from 1 to 100. The highest score given so far is ${existing.value.highestScore.score}.`
    : 'A whole number from 1 to 100.',
);

const LATE_CHOICES = [
  { value: 'no', label: 'No', description: 'Hand-ins close at the due time.' },
  { value: 'yes', label: 'Yes', description: 'Work after the due time is marked Late.' },
];

const submit = handleSubmit(async (v) => {
  serverError.value = '';
  attachmentError.value = '';
  const [armId = '', subject = ''] = v.classKey.split('|');
  const payload: AssignmentPayload = {
    armId,
    subject,
    title: v.title,
    instructions: v.instructions ?? '',
    dueAt: v.dueDate && v.dueTime ? `${v.dueDate}T${v.dueTime}` : null,
    maxScore: v.maxScore ?? null,
    allowLate: v.allowLate === 'yes',
    attachments: attachments.value,
    publish: Boolean(v.publish),
  };
  const students = chosen.value?.students ?? existing.value?.students ?? 0;
  const label = chosen.value ? `${chosen.value.armName} · ${chosen.value.subjectName}` : '';
  if (payload.publish && !isPublished.value) {
    const ok = await confirm({
      title: 'Publish this assignment?',
      description: 'Students see it in their portal straight away.',
      details: [
        ['Class', label],
        ['Due', formatDeadline(payload.dueAt)],
        ['Max score', String(payload.maxScore)],
        ['Notifies', `${students} students and their guardians`],
      ],
      confirmLabel: 'Publish',
    });
    if (!ok) return;
  } else if (isPublished.value) {
    const ok = await confirm({
      title: 'Save changes to a published assignment?',
      description: 'Students and guardians are told about the change.',
      details: [
        ['Class', label],
        ['Notifies', `${students} students and their guardians`],
      ],
      confirmLabel: 'Save and notify',
    });
    if (!ok) return;
  }
  try {
    const saved = await save.mutateAsync({ id: editId.value || undefined, payload });
    done.value = true;
    toast.success(
      payload.publish
        ? isPublished.value
          ? 'Changes saved. Students and guardians were notified.'
          : `Published to ${saved.classLabel}.`
        : 'Draft saved.',
    );
    await router.push({ name: r.assignments.detail.name, params: { assignmentId: saved.id } });
  } catch (e) {
    const fields = fieldErrorsOf(e);
    const mapped: Record<string, string> = {};
    for (const [k, msg] of Object.entries(fields)) {
      if (k === 'attachments') attachmentError.value = msg;
      else mapped[API_FIELD[k] ?? k] = msg;
    }
    if (Object.keys(mapped).length) setErrors(mapped);
    if (!Object.keys(fields).length)
      serverError.value = getApiErrorMessage(e, 'The assignment wasn’t saved. Try again.');
  }
});

async function run(publish: boolean) {
  setFieldValue('publish', publish);
  await nextTick();
  await submit();
}

const cancelTo = computed(() =>
  isEdit.value
    ? { name: r.assignments.detail.name, params: { assignmentId: editId.value } }
    : { name: r.assignments.list.name },
);
</script>

<template>
  <PageHeader
    :title="isEdit ? 'Edit assignment' : 'New assignment'"
    :description="
      isEdit
        ? existing?.classLabel
        : 'Set work for one of your classes. Save a draft, or publish to send it to students.'
    "
  />

  <AccessDenied
    v-if="isForbidden(loadError)"
    what="this assignment"
    :reason="getApiErrorMessage(loadError)"
  />
  <EmptyState
    v-else-if="isNotFound(loadError)"
    title="Assignment not found"
    description="It may have been deleted."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: r.assignments.list.name }">Back to assignments</RouterLink></Button
    >
  </EmptyState>
  <InlineNotice
    v-else-if="loadError"
    tone="error"
    title="The assignment couldn’t load"
    :description="getApiErrorMessage(loadError, 'Refresh to try again.')"
  />
  <Skeleton v-else-if="loadingScope || (isEdit && loadingExisting)" class="h-[480px] w-full" />
  <EmptyState
    v-else-if="!isEdit && !scope?.assignments.length"
    illustrated
    title="No classes to set work for yet"
    description="The academic office assigns your classes. Once they do, you can create assignments."
  />
  <template v-else>
    <InlineNotice
      v-if="lockReason"
      tone="warning"
      title="This can’t be changed"
      :description="lockReason"
    />
    <form class="flex max-w-3xl flex-col gap-5" novalidate @submit.prevent="run(true)">
      <fieldset :disabled="Boolean(lockReason) || save.isPending.value" class="contents">
        <SectionCard title="Class and title">
          <div class="flex flex-col gap-4.5">
            <FormSelect
              name="classKey"
              label="Class and subject"
              required
              :options="[{ value: '', label: 'Choose a class…' }, ...classOptions]"
              :hint="
                isPublished
                  ? 'A published assignment stays with its class.'
                  : chosen
                    ? `${chosen.students} students · ${chosen.branchName}`
                    : 'Only your own classes for the active term.'
              "
              :class="isPublished && 'pointer-events-none opacity-70'"
            />
            <FormInput
              name="title"
              label="Title"
              required
              placeholder="Algebraic expressions"
              :hint="`${(values.title ?? '').length} / 120`"
            />
            <FormTextarea
              name="instructions"
              label="Instructions"
              required
              :rows="5"
              placeholder="Answer questions 1 to 10 on page 42. Show your working and upload a clear photo of each page."
            />
          </div>
        </SectionCard>

        <SectionCard title="Due date and marking">
          <div class="grid grid-cols-2 gap-4.5 max-sm:grid-cols-1">
            <FormInput
              name="dueDate"
              label="Due date"
              type="date"
              required
              placeholder=""
              :hint="dueHint"
            />
            <FormInput name="dueTime" label="Due time" type="time" required placeholder="16:00" />
            <FormNumber
              name="maxScore"
              label="Max score"
              required
              placeholder="20"
              :hint="maxHint"
            />
          </div>
          <div class="mt-4.5 flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Allow late submissions</span>
            <ChoiceCards
              v-model="allowLate"
              :choices="LATE_CHOICES"
              label="Allow late submissions"
              :columns="2"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Files for students"
          description="Optional. Worksheets, notes or pictures."
        >
          <AttachmentPicker
            v-model="attachments"
            :materials="classMaterials"
            :disabled="Boolean(lockReason)"
            :error="attachmentError"
          />
        </SectionCard>
      </fieldset>

      <InlineNotice
        v-if="serverError"
        tone="error"
        title="The assignment wasn’t saved"
        :description="serverError"
      />

      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="Boolean(lockReason) || save.isPending.value">
          <Spinner v-if="save.isPending.value && values.publish" />
          {{ isPublished ? 'Save changes' : 'Publish' }}
        </Button>
        <Button
          v-if="!isPublished"
          type="button"
          variant="outline"
          :disabled="Boolean(lockReason) || save.isPending.value"
          @click="run(false)"
        >
          <Spinner v-if="save.isPending.value && !values.publish" />
          Save as draft
        </Button>
        <Button as-child variant="ghost"><RouterLink :to="cancelTo">Cancel</RouterLink></Button>
      </div>
    </form>
  </template>
</template>
