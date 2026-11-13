<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/yup';
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { PaperclipIcon, XIcon } from '@lucide/vue';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import FormTextarea from '@edutrack/app-kit/components/form/FormTextarea.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useRequestCorrectionMutation, useResultSheetQuery } from '@/api/services/results';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { gradeOf, parseScore, totalOf } from '@/components/results/scoring';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { ScoreValue, SheetComponent } from '@/types';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const sheetId = computed(() => String(route.params.sheetId));
const { data: sheet, isPending, error } = useResultSheetQuery(sheetId);
const request = useRequestCorrectionMutation();

watch(sheet, (s) => layout.setRecordLabel(s ? `${s.arm} · ${s.subjectName}` : null), {
  immediate: true,
});

const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|heic))$/;

const current = (studentId?: string, key?: string): ScoreValue | undefined => {
  const s = sheet.value;
  const i = s?.components.findIndex((c) => c.key === key) ?? -1;
  return s?.rows.find((r) => r.studentId === studentId)?.scores[i];
};
const componentOf = (key?: string): SheetComponent | undefined =>
  sheet.value?.components.find((c) => c.key === key);

const schema = toTypedSchema(
  yup.object({
    studentId: yup.string().required('Choose the student.'),
    componentKey: yup
      .string()
      .required('Choose the component.')
      .test('numeric', 'This score is ABS or EXM. Ask the academic office.', function (key) {
        const v = current(this.parent.studentId, key);
        return v === undefined || typeof v === 'number';
      }),
    proposed: yup
      .string()
      .required('Enter the corrected score.')
      .test('score', function (raw) {
        const comp = componentOf(this.parent.componentKey);
        if (!comp || !raw) return true;
        const p = parseScore(raw, comp.max);
        if (p.error || typeof p.value !== 'number')
          return this.createError({ message: `Enter a score from 0 to ${comp.max}.` });
        if (p.value === current(this.parent.studentId, comp.key))
          return this.createError({ message: 'The new score must differ from the current one.' });
        return true;
      }),
    reason: yup
      .string()
      .trim()
      .required('Explain the correction.')
      .min(15, 'Explain the correction in 15 characters or more (e.g. what was re-marked).')
      .max(600, 'Keep the reason under 600 characters.'),
  }),
);

const { handleSubmit, values, meta, setErrors, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: {
    studentId: (route.query.student as string) ?? '',
    componentKey: (route.query.component as string) ?? '',
    proposed: '',
    reason: '',
  },
});
const file = ref<File | null>(null);
const fileError = ref('');
const serverError = ref('');
const done = ref(false);
useUnsavedWork(() => (meta.value.dirty || !!file.value) && !done.value, 'Correction request');

const studentOptions = computed(() =>
  (sheet.value?.rows ?? []).map((r) => ({
    value: r.studentId,
    label: `${r.name} · ${r.admissionNo}`,
  })),
);
const componentOptions = computed(() =>
  (sheet.value?.components ?? []).map((c) => ({ value: c.key, label: `${c.name} (max ${c.max})` })),
);
const comp = computed(() => componentOf(values.componentKey));
const currentValue = computed(() => current(values.studentId, values.componentKey));
const row = computed(() => sheet.value?.rows.find((r) => r.studentId === values.studentId));
const proposedValue = computed(() => {
  if (!comp.value || !values.proposed) return null;
  const p = parseScore(values.proposed, comp.value.max);
  return typeof p.value === 'number' && !p.error ? p.value : null;
});
const fmt = (scores: ScoreValue[] | undefined) => {
  const s = sheet.value;
  if (!s || !scores) return '—';
  const t = totalOf(s.components, scores);
  return t === null ? '—' : `${t.toFixed(1)} · ${gradeOf(s.scale, t)?.grade ?? '—'}`;
};
const totals = computed(() => {
  const r = row.value;
  const i = sheet.value?.components.findIndex((c) => c.key === values.componentKey) ?? -1;
  if (!r || i < 0) return null;
  const after = r.scores.map((v, j) =>
    j === i && proposedValue.value !== null ? proposedValue.value : v,
  );
  return { before: fmt(r.scores), after: proposedValue.value === null ? null : fmt(after) };
});
// Changing student or component clears the proposed score.
watch(
  () => [values.studentId, values.componentKey],
  () => values.proposed && setFieldValue('proposed', ''),
);

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  (e.target as HTMLInputElement).value = '';
  fileError.value = '';
  if (!f) return;
  if (f.size > MAX_FILE) fileError.value = 'The evidence file must be 10 MB or smaller.';
  else if (!FILE_TYPES.test(f.type))
    fileError.value = 'Attach a PDF or a photo (JPG, PNG, WebP or HEIC).';
  else file.value = f;
}
const size = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

const onSubmit = handleSubmit((v) => {
  const s = sheet.value!;
  const c = comp.value!;
  const student = row.value!;
  serverError.value = '';
  void confirm({
    title: 'Send this correction request?',
    description: 'The academic office reviews it in School Admin and applies or rejects it.',
    details: [
      ['Student', student.name],
      ['Component', `${c.name} (max ${c.max})`],
      ['Score', `${currentValue.value} → ${proposedValue.value}`],
      ['Total', `${totals.value?.before} → ${totals.value?.after}`],
      ['Evidence', file.value?.name ?? 'None'],
      ['Status', 'Under review until the academic office decides'],
    ],
    confirmLabel: 'Send request',
    action: async () => {
      try {
        await request.mutateAsync({
          sheetId: s.id,
          studentId: v.studentId,
          componentKey: v.componentKey as SheetComponent['key'],
          proposed: proposedValue.value!,
          reason: v.reason,
          evidence: file.value
            ? { name: file.value.name, size: file.value.size, type: file.value.type }
            : null,
        });
      } catch (e) {
        const fields = fieldErrorsOf(e);
        if (fields.evidence) fileError.value = fields.evidence;
        setErrors(fields);
        throw e;
      }
      done.value = true;
      toast.success('Correction request sent to the academic office.');
      await router.push({ name: routesPath.results.sheet.name, params: { sheetId: s.id } });
    },
  });
});
</script>

<template>
  <Skeleton v-if="isPending" class="h-96 w-full max-w-2xl" />
  <AccessDenied
    v-else-if="isForbidden(error)"
    what="that result sheet"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    title="This sheet couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <template v-else-if="sheet">
    <PageHeader
      title="Request a correction"
      :description="`${sheet.arm} · ${sheet.subjectName} · published results. The academic office decides; it shows on the sheet’s history.`"
    />
    <InlineNotice
      v-if="!sheet.canRequestCorrection"
      tone="warning"
      title="Corrections are for published sheets"
      :description="`This sheet is ${sheet.status}. ${sheet.editable ? 'Edit the scores on the sheet instead.' : 'Wait until it’s published, or ask the reviewer to return it.'}`"
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.results.sheet.name, params: { sheetId: sheet.id } }"
            >Open the sheet</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <form v-else class="flex max-w-2xl flex-col gap-5" novalidate @submit="onSubmit">
      <SectionCard title="Which score">
        <div class="grid gap-4.5 sm:grid-cols-2">
          <FormSelect
            name="studentId"
            label="Student"
            required
            :options="[{ value: '', label: 'Choose a student' }, ...studentOptions]"
            class="sm:col-span-2"
          />
          <FormSelect
            name="componentKey"
            label="Component"
            required
            :options="[{ value: '', label: 'Choose a component' }, ...componentOptions]"
          />
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Current score</span>
            <span
              class="flex h-9 items-center rounded-md border bg-muted px-3 text-sm tabular-nums"
              aria-live="polite"
              >{{ currentValue ?? '—'
              }}<span v-if="comp" class="ml-1 text-faint">/ {{ comp.max }}</span></span
            >
          </div>
          <FormInput
            name="proposed"
            label="Corrected score"
            required
            inputmode="decimal"
            :placeholder="comp ? `0–${comp.max}` : '15'"
            :hint="comp ? `0 to ${comp.max}, one decimal place at most` : undefined"
          />
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Total</span>
            <span
              class="flex h-9 items-center rounded-md border bg-muted px-3 text-sm tabular-nums"
            >
              <template v-if="totals">
                {{ totals.before }}
                <template v-if="totals.after">
                  <span class="mx-1.5 text-faint">→</span
                  ><b class="font-semibold">{{ totals.after }}</b></template
                >
              </template>
              <template v-else>—</template>
            </span>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Why">
        <div class="flex flex-col gap-4.5">
          <FormTextarea
            name="reason"
            label="Reason"
            required
            :rows="3"
            placeholder="e.g. Script re-marked: question 7 (6 marks) was not added to the total."
            hint="15 characters or more. The academic office sees exactly this."
          />
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium"
              >Evidence <span class="font-normal text-faint">optional</span></span
            >
            <div
              v-if="file"
              class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"
            >
              <span class="flex min-w-0 items-center gap-2"
                ><PaperclipIcon class="size-4 shrink-0 text-faint" /><span class="truncate">{{
                  file.name
                }}</span
                ><span class="shrink-0 text-faint">{{ size(file.size) }}</span></span
              >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove the evidence file"
                @click="file = null"
                ><XIcon
              /></Button>
            </div>
            <label
              v-else
              class="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-[13px] text-muted-foreground hover:bg-muted"
            >
              <PaperclipIcon class="size-4" /> Attach the marked script or a photo (PDF or image, 10
              MB max)
              <input
                type="file"
                class="sr-only"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
                @change="onFile"
              />
            </label>
            <span v-if="fileError" class="text-xs text-error-strong" role="alert">{{
              fileError
            }}</span>
          </div>
        </div>
      </SectionCard>
      <p
        v-if="serverError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ serverError }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="request.isPending.value">
          <Spinner v-if="request.isPending.value" />Send request
        </Button>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.results.sheet.name, params: { sheetId: sheet.id } }"
            >Cancel</RouterLink
          ></Button
        >
      </div>
    </form>
  </template>
</template>
