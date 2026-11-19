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
import type { CurriculumView, Subject, SubjectCategory } from '@/types';

import { CATEGORIES } from './subject-categories';

/** Add a subject to the school's list, or edit one. The code can't change once created. */
const props = defineProps<{ subject: Subject | null; view: CurriculumView }>();
const open = defineModel<boolean>('open', { required: true });

const confirm = useConfirm();
const save = useSaveSubjectMutation();
const remove = useDeleteSubjectMutation();

/** '' = shared by every section. Section admins can only add to the sections they manage. */
const SHARED = '';
const sectionOptions = computed(() => {
  const mine = props.view.mySections;
  const names = props.view.levels.map((l) => l.section).filter((n) => !mine || mine.includes(n));
  return [
    ...(mine ? [] : [{ value: SHARED, label: 'Shared by every section' }]),
    ...names.map((n) => ({ value: n, label: n })),
  ];
});

const initial = () => ({
  name: props.subject?.name ?? '',
  section: props.subject
    ? (props.subject.section ?? SHARED)
    : (props.view.mySections?.[0] ?? SHARED),
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
  const subjects = props.view.subjects;
  // Names are unique within a section: Primary and Senior Secondary can each have English.
  if (!name) e.name = 'Name the subject.';
  else if (
    subjects.some(
      (s) =>
        s.code !== props.subject?.code &&
        (s.section ?? SHARED) === form.section &&
        s.name.toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = `${name} already exists${form.section ? ` in ${form.section}` : ''}.`;
  if (!props.subject) {
    if (!/^[A-Z]{2,4}\d?$/.test(form.code)) e.code = '2–4 capitals, e.g. MTH.';
    else if (subjects.some((s) => s.code === form.code))
      e.code = `Already used by ${subjects.find((s) => s.code === form.code)!.name}.`;
  }
  if (!sectionOptions.value.some((o) => o.value === form.section))
    e.section = 'Choose one of the sections you manage.';
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
      section: form.section || null,
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
      <FieldShell
        id="sub-name"
        label="Subject name"
        required
        :error="err('name')"
        info="The full name printed on report cards, timetables and the Teacher Workspace, e.g. Mathematics or Christian Religious Studies. Each name can only be used once in a section."
      >
        <Input
          id="sub-name"
          v-model="form.name"
          placeholder="e.g. Mathematics"
          :aria-invalid="!!err('name')"
        />
      </FieldShell>
      <FieldShell
        id="sub-section"
        label="Section"
        :error="err('section')"
        :hint="
          form.section
            ? `Only ${form.section} classes can take it`
            : 'Any section can add it to its classes'
        "
        info="A shared subject can be added to classes in every section. A section’s own subject is only offered in that section; admins of other sections can’t change it."
      >
        <select
          id="sub-section"
          v-model="form.section"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
          :aria-invalid="!!err('section')"
        >
          <option v-for="o in sectionOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </FieldShell>
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="sub-code"
          label="Code"
          required
          :error="err('code')"
          :hint="subject ? 'Can’t be changed' : '2–4 capitals, e.g. MTH'"
          info="A short code shown where space is tight: timetable cells, score sheets and exports. Use 2 to 4 capital letters, optionally followed by one digit (MTH, ENG, FRE, BIO2). Each code is unique and can’t be changed once the subject is created."
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
          info="How many lessons a class has each week, from 1 to 10. The timetable builder places exactly this many, and it counts towards each teacher’s weekly workload."
        >
          <Input
            id="sub-periods"
            v-model="form.periods"
            inputmode="numeric"
            :aria-invalid="!!err('periods')"
          />
        </FieldShell>
        <FieldShell
          id="sub-cat"
          label="Category"
          info="Groups subjects for filters and reports: Core, Science, Arts, Commercial, Technical, Language, Religious or Early years."
        >
          <select
            id="sub-cat"
            v-model="form.category"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="c in CATEGORIES" :key="c">{{ c }}</option>
          </select>
        </FieldShell>
        <FieldShell
          id="sub-status"
          label="Status"
          info="Active subjects can be offered in classes, assigned to teachers and placed on timetables. Make a subject inactive to stop offering it while keeping its past results; you can’t deactivate it while teachers are still assigned to it."
        >
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
