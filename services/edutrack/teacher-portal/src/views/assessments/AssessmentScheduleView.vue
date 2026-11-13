<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/yup';
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useAssessmentQuery,
  useRescheduleAssessmentMutation,
  useScheduleAssessmentMutation,
  useScheduleOptionsQuery,
} from '@/api/services/assessments';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDay, formatWeekday } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import type { SheetComponent } from '@/types';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const ctx = useTermContext();
const editId = computed(() => (route.query.id as string | undefined) ?? '');
const isEdit = computed(() => Boolean(editId.value));
const { data: options, isPending: optionsPending, error: optionsError } = useScheduleOptionsQuery();
const {
  data: existing,
  isPending: existingPending,
  error: existingError,
} = useAssessmentQuery(editId, isEdit);
const create = useScheduleAssessmentMutation();
const reschedule = useRescheduleAssessmentMutation(editId);

const schema = toTypedSchema(
  yup.object({
    classKey: yup.string().required('Choose one of your classes.'),
    componentKey: yup.string().required('Choose a component from the school’s scheme.'),
    date: yup
      .string()
      .required('Choose a date.')
      .test('term', function (d) {
        const o = options.value;
        if (!d || !o) return true;
        if (d < o.termStart || d > o.termEnd)
          return this.createError({
            message: `Choose a date inside the term (${formatDay(o.termStart)} – ${formatDay(o.termEnd)}).`,
          });
        const unchanged = isEdit.value && d === existing.value?.date;
        if (!unchanged && d < o.today)
          return this.createError({
            message: `Choose today (${formatDay(o.today)}) or a later date.`,
          });
        return true;
      }),
    topics: yup
      .string()
      .trim()
      .required('List the topics it covers.')
      .min(3, 'List the topics it covers.')
      .max(300, 'Keep the topics under 300 characters.'),
    instructions: yup
      .string()
      .trim()
      .max(1000, 'Keep the instructions under 1,000 characters.')
      .default(''),
  }),
);

const query = route.query as Record<string, string | undefined>;
const { handleSubmit, values, meta, setErrors, resetForm, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: {
    classKey: query.class && query.subject ? `${query.class}|${query.subject}` : '',
    componentKey: (query.component as string) ?? '',
    date: '',
    topics: '',
    instructions: '',
  },
});
const done = ref(false);
useUnsavedWork(
  () => meta.value.dirty && !done.value,
  isEdit.value ? 'Reschedule' : 'New assessment',
);

watch(
  existing,
  (a) =>
    a &&
    resetForm({
      values: {
        classKey: `${a.armId}|${a.subject}`,
        componentKey: a.componentKey,
        date: a.date,
        topics: a.topics,
        instructions: a.instructions,
      },
    }),
  { immediate: true },
);

const classOptions = computed(() => {
  const multi = new Set(options.value?.classes.map((c) => c.branchName)).size > 1;
  return (options.value?.classes ?? []).map((c) => ({
    value: `${c.armId}|${c.subject}`,
    label: `${c.arm}${multi ? ` (${c.branchName.split(' ')[0]})` : ''} · ${c.subjectName}${c.available.length ? '' : ' — all scheduled'}`,
  }));
});
const chosen = computed(() =>
  options.value?.classes.find((c) => `${c.armId}|${c.subject}` === values.classKey),
);
const available = computed<SheetComponent[]>(() => chosen.value?.available ?? []);
const componentOptions = computed(() =>
  available.value.map((c) => ({
    value: c.key,
    label: `${c.name} · out of ${c.max} · ${c.weight}%`,
  })),
);
// A component that isn't available for the newly chosen class is cleared.
watch(
  () => [values.classKey, available.value.length],
  () => {
    if (
      !isEdit.value &&
      values.componentKey &&
      !available.value.some((c) => c.key === values.componentKey)
    )
      setFieldValue('componentKey', available.value.length === 1 ? available.value[0]!.key : '');
    else if (!isEdit.value && !values.componentKey && available.value.length === 1)
      setFieldValue('componentKey', available.value[0]!.key);
  },
);

const minDate = computed(() => options.value?.today ?? '');
const label = computed(() => {
  const c = chosen.value;
  return c ? `${c.arm} · ${c.subjectName}` : '';
});

const onSubmit = handleSubmit((v) => {
  const [armId = '', subject = ''] = v.classKey.split('|');
  const compName =
    available.value.find((c) => c.key === v.componentKey)?.name ?? existing.value?.component ?? '';
  const moved = isEdit.value && existing.value && v.date !== existing.value.date;
  void confirm({
    title: isEdit.value
      ? `Save changes to ${compName} · ${existing.value?.arm} · ${existing.value?.subjectName}?`
      : `Schedule ${compName} for ${label.value}?`,
    details: [
      [
        'Date',
        moved
          ? `${formatWeekday(existing.value!.date)} → ${formatWeekday(v.date)}`
          : formatWeekday(v.date),
      ],
      ['Topics', v.topics],
      [
        'Students',
        moved
          ? 'Notified of the new date in their portal'
          : isEdit.value
            ? 'See the updated details in their portal'
            : 'See it in their portal',
      ],
      ['Once per term', 'Each component is scheduled once per class; you can reschedule it later'],
    ],
    confirmLabel: isEdit.value ? (moved ? 'Reschedule' : 'Save changes') : 'Schedule',
    action: async () => {
      try {
        const saved = isEdit.value
          ? await reschedule.mutateAsync({
              date: v.date,
              topics: v.topics,
              instructions: v.instructions,
            })
          : await create.mutateAsync({
              armId,
              subject,
              componentKey: v.componentKey as SheetComponent['key'],
              date: v.date,
              topics: v.topics,
              instructions: v.instructions,
            });
        done.value = true;
        toast.success(
          isEdit.value
            ? moved
              ? `Rescheduled to ${formatWeekday(v.date)}. Students are notified.`
              : 'Changes saved.'
            : `${compName} scheduled for ${formatWeekday(v.date)}.`,
        );
        await router.push({
          name: routesPath.assessments.detail.name,
          params: { assessmentId: saved.id },
        });
      } catch (e) {
        setErrors(fieldErrorsOf(e));
        throw e;
      }
    },
  });
});
</script>

<template>
  <PageHeader
    :title="isEdit ? 'Reschedule an assessment' : 'Schedule an assessment'"
    :description="
      isEdit
        ? 'Change the date, topics or instructions. Students are notified when the date moves.'
        : 'Pick a component of the school’s scheme for one of your classes. Each is scheduled once per class per term.'
    "
  />
  <InlineNotice
    v-if="ctx.isReadOnly.value"
    tone="warning"
    title="This term is read-only"
    :description="ctx.readOnlyReason.value ?? 'Only the active term can be changed.'"
  />
  <AccessDenied
    v-else-if="isForbidden(existingError)"
    what="that assessment"
    :reason="getApiErrorMessage(existingError)"
  />
  <InlineNotice
    v-else-if="optionsError || existingError"
    tone="error"
    title="This form couldn’t load"
    :description="getApiErrorMessage(optionsError ?? existingError, 'Refresh to try again.')"
  />
  <Skeleton
    v-else-if="optionsPending || (isEdit && existingPending)"
    class="h-96 w-full max-w-2xl"
  />
  <EmptyState
    v-else-if="!options?.classes.length"
    title="No classes this term"
    description="You can schedule assessments once the academic office assigns you classes."
  />
  <InlineNotice
    v-else-if="isEdit && existing && !existing.canReschedule"
    tone="neutral"
    title="This assessment can’t be rescheduled"
    :description="`It took place on ${formatWeekday(existing.date)}. Enter its scores on the sheet instead.`"
  />
  <form v-else class="flex max-w-2xl flex-col gap-5" novalidate @submit="onSubmit">
    <SectionCard title="What and when">
      <div class="grid gap-4.5 sm:grid-cols-2">
        <template v-if="isEdit && existing">
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Class</span>
            <span class="flex h-9 items-center rounded-md border bg-muted px-3 text-sm"
              >{{ existing.arm }} · {{ existing.subjectName }}</span
            >
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Component</span>
            <span class="flex h-9 items-center rounded-md border bg-muted px-3 text-sm"
              >{{ existing.component }} · out of {{ existing.max }}</span
            >
          </div>
        </template>
        <template v-else>
          <FormSelect
            name="classKey"
            label="Class and subject"
            required
            :options="[{ value: '', label: 'Choose a class' }, ...classOptions]"
            class="sm:col-span-2"
          />
          <FormSelect
            name="componentKey"
            label="Component"
            required
            :options="[
              {
                value: '',
                label: !chosen
                  ? 'Choose a class first'
                  : available.length
                    ? 'Choose a component'
                    : 'Every component is already scheduled',
              },
              ...componentOptions,
            ]"
            :hint="
              chosen && !available.length
                ? 'All of the scheme is scheduled for this class. Open one to reschedule it.'
                : 'From the school’s scheme; weights are set by the school.'
            "
          />
        </template>
        <FormInput
          name="date"
          label="Date"
          type="date"
          required
          placeholder="2026-12-10"
          :hint="`School days only, ${formatDay(minDate)} – ${formatDay(options?.termEnd)}.`"
        />
      </div>
    </SectionCard>
    <SectionCard title="For students">
      <div class="flex flex-col gap-4.5">
        <FormTextarea
          name="topics"
          label="Topics"
          required
          :rows="2"
          placeholder="e.g. Simultaneous equations, linear inequalities"
        />
        <FormTextarea
          name="instructions"
          label="Instructions"
          :rows="3"
          placeholder="e.g. Bring a calculator and a ruler. 40 minutes."
        />
      </div>
    </SectionCard>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="create.isPending.value || reschedule.isPending.value">
        <Spinner v-if="create.isPending.value || reschedule.isPending.value" />
        {{ isEdit ? 'Save changes' : 'Schedule' }}
      </Button>
      <Button as-child variant="outline"
        ><RouterLink
          :to="
            isEdit
              ? { name: routesPath.assessments.detail.name, params: { assessmentId: editId } }
              : { name: routesPath.assessments.list.name }
          "
          >Cancel</RouterLink
        ></Button
      >
    </div>
  </form>
</template>
