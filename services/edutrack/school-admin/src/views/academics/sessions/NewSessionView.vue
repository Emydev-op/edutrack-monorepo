<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Switch } from '@edutrack/ui/components/switch';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon, XIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useCreateSessionMutation, useSessionsQuery } from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import type { CopyArea, SessionStructure } from '@/types';

import { addDays, daysBetween, fmtDate, fmtRange, isIso } from './dates';

const NEVER = [
  'Students and enrollments',
  'Results and scores',
  'Attendance',
  'Invoices and payments',
  'Financial transactions',
  'Stock movements',
];
const PRESETS: Record<Exclude<SessionStructure, 'Custom'>, string[]> = {
  '3 terms': ['First Term', 'Second Term', 'Third Term'],
  '2 semesters': ['First Semester', 'Second Semester'],
};

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const { data, isPending } = useSessionsQuery();
const create = useCreateSessionMutation();
const fromSetup = computed(() => route.query.from === 'setup');

const first = computed(
  () => !!data.value && !data.value.sessions.some((s) => ['Active', 'Upcoming'].includes(s.status)),
);
const latest = computed(
  () => [...(data.value?.sessions ?? [])].sort((a, b) => b.end.localeCompare(a.end))[0],
);

const form = reactive({
  start: '',
  end: '',
  name: '',
  nameTouched: false,
  structure: '3 terms' as SessionStructure,
  custom: ['Term 1', 'Term 2', 'Term 3'],
  copyOn: true,
  copy: [] as CopyArea[],
});
const step = ref(0);
const showErrors = ref(false);
const done = ref(false);

/** The Monday on or after a date. */
const monday = (iso: string) => addDays(iso, (8 - new Date(`${iso}T00:00:00Z`).getUTCDay()) % 7);

watch(
  data,
  (d) => {
    if (!d || form.start) return;
    const start = latest.value ? monday(addDays(latest.value.end, 49)) : '2026-09-14';
    form.start = start;
    form.end = addDays(start, 312);
    form.copy = d.copyAreas.filter((a) => a.id !== 'timetable').map((a) => a.id);
    form.copyOn = !first.value;
  },
  { immediate: true },
);

const autoName = computed(() =>
  isIso(form.start) && isIso(form.end)
    ? `${form.start.slice(0, 4)}/${form.end.slice(0, 4) === form.start.slice(0, 4) ? Number(form.start.slice(0, 4)) + 1 : form.end.slice(0, 4)}`
    : '',
);
watch(
  autoName,
  (n) => {
    if (!form.nameTouched) form.name = n;
  },
  { immediate: true },
);

const termNames = computed(() =>
  form.structure === 'Custom' ? form.custom : PRESETS[form.structure],
);
const months = computed(() =>
  isIso(form.start) && isIso(form.end) ? daysBetween(form.start, form.end) / 30.44 : 0,
);

const errors = computed(() => {
  const e = { start: '', end: '', name: '', terms: '' };
  if (!isIso(form.start)) e.start = 'Choose the start date.';
  if (!isIso(form.end)) e.end = 'Choose the end date.';
  else if (form.end <= form.start) e.end = 'The session must end after it starts.';
  else if (months.value < 5 || months.value > 15) e.end = 'A session runs between 5 and 15 months.';
  else {
    const overlap = data.value?.sessions.find((s) => form.start <= s.end && form.end >= s.start);
    if (overlap)
      e.end = `These dates overlap ${overlap.name} (${fmtRange(overlap.start, overlap.end)}).`;
  }
  const name = form.name.trim();
  if (!name) e.name = 'Name the session, e.g. 2027/2028.';
  else if (data.value?.sessions.some((s) => s.name === name)) e.name = `${name} already exists.`;
  const names = termNames.value.map((n) => n.trim());
  if (names.length < 1 || names.length > 4) e.terms = 'Use between 1 and 4 terms.';
  else if (names.some((n) => !n)) e.terms = 'Name every term.';
  else if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    e.terms = 'Term names must be different.';
  return e;
});
const err = (k: keyof typeof errors.value) => (showErrors.value ? errors.value[k] : '');

const STEPS = computed(() =>
  first.value ? ['Dates', 'Terms', 'Review'] : ['Dates', 'Terms', 'Copy setup', 'Review'],
);
const stepKey = computed(() => STEPS.value[step.value]);
const stepValid = computed(() => {
  const e = errors.value;
  if (stepKey.value === 'Dates') return !e.start && !e.end && !e.name;
  if (stepKey.value === 'Terms') return !e.terms;
  return true;
});

useUnsavedChanges(() => !done.value && step.value > 0);

function next() {
  showErrors.value = true;
  if (!stepValid.value) return;
  showErrors.value = false;
  step.value++;
}

const copied = computed(() =>
  !first.value && form.copyOn
    ? (data.value?.copyAreas ?? []).filter((a) => form.copy.includes(a.id))
    : [],
);
function toggleArea(id: CopyArea, on: boolean | 'indeterminate') {
  form.copy = on === true ? [...form.copy, id] : form.copy.filter((x) => x !== id);
}

const review = computed(() => [
  { label: 'Name', value: form.name.trim() },
  { label: 'Dates', value: fmtRange(form.start, form.end) },
  { label: 'Length', value: `${Math.round(months.value * 10) / 10} months` },
  { label: 'Terms', value: termNames.value.map((n) => n.trim()).join(', ') },
  {
    label: 'Status',
    value: first.value
      ? 'Active straight away · your first session'
      : 'Upcoming until you start it',
  },
  ...(first.value
    ? []
    : [
        {
          label: 'Copied',
          value: copied.value.map((a) => a.label).join(', ') || 'Nothing · starts blank',
        },
      ]),
]);

function submit() {
  showErrors.value = true;
  if (Object.values(errors.value).some(Boolean))
    return toast.error('Fix the highlighted fields first.');
  const name = form.name.trim();
  void confirm({
    title: `Create session ${name}?`,
    details: [
      [
        'Status',
        first.value
          ? 'Active. It becomes your current session.'
          : 'Upcoming. It becomes Active only when you start it.',
      ],
      ['Terms', `${termNames.value.length} · dates spread evenly; adjust them next`],
      ...(!first.value
        ? ([['Copied', copied.value.map((a) => a.label).join(', ') || 'Nothing']] as [
            string,
            string,
          ][])
        : []),
      ['Never copied', 'Students, results, attendance, invoices and payments'],
    ],
    confirmLabel: 'Create session',
    action: async () => {
      try {
        const s = await create.mutateAsync({
          name,
          start: form.start,
          end: form.end,
          structure: form.structure,
          termNames: termNames.value.map((n) => n.trim()),
          copy: copied.value.map((a) => a.id),
        });
        done.value = true;
        toast.success(`${s.name} created. Next: set term dates and breaks.`);
        await router.push({
          name: routesPath.academics.terms.name,
          params: { id: s.id },
          query: fromSetup.value ? { from: 'setup' } : {},
        });
      } catch (e) {
        throw new Error(getApiErrorMessage(e));
      }
    },
  });
}
</script>

<template>
  <PageHeader
    :title="first ? 'Create your first academic session' : 'Create academic session'"
    :description="
      first
        ? 'Your session holds terms, classes, fees and results. You can change the dates later.'
        : 'Set up the next session ahead of time. It stays Upcoming until you start it.'
    "
  />
  <SetupStepBar step="academic-session" auto />

  <Skeleton v-if="isPending" class="h-80" />
  <div v-else-if="data" class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <SectionCard>
      <div class="flex flex-col gap-5">
        <StepIndicator :steps="STEPS" :current="step" />

        <template v-if="stepKey === 'Dates'">
          <div class="grid gap-4 sm:grid-cols-2">
            <FieldShell id="ns-start" label="Start date" required :error="err('start')">
              <Input id="ns-start" v-model="form.start" type="date" />
            </FieldShell>
            <FieldShell
              id="ns-end"
              label="End date"
              required
              :error="err('end')"
              :hint="
                months ? `${Math.round(months * 10) / 10} months · sessions run 5–15 months` : ''
              "
            >
              <Input id="ns-end" v-model="form.end" type="date" />
            </FieldShell>
            <FieldShell
              id="ns-name"
              label="Session name"
              required
              :error="err('name')"
              hint="Named from the dates. Change it if your school uses another format."
            >
              <Input
                id="ns-name"
                :model-value="form.name"
                placeholder="2027/2028"
                @update:model-value="
                  form.name = String($event);
                  form.nameTouched = true;
                "
              />
            </FieldShell>
          </div>
          <InlineNotice
            v-if="latest"
            tone="neutral"
            :title="`Latest session: ${latest.name}`"
            :description="`${fmtRange(latest.start, latest.end)} · ${latest.status}. The new session can’t overlap it.`"
          />
        </template>

        <template v-else-if="stepKey === 'Terms'">
          <ChoiceCards
            v-model="form.structure"
            label="Structure"
            :columns="3"
            :choices="[
              { value: '3 terms', label: '3 terms', description: 'First, Second and Third Term' },
              {
                value: '2 semesters',
                label: '2 semesters',
                description: 'First and Second Semester',
              },
              { value: 'Custom', label: 'Custom', description: 'Between 1 and 4, your names' },
            ]"
          />
          <div v-if="form.structure === 'Custom'" class="flex flex-col gap-2">
            <div v-for="(_, i) in form.custom" :key="i" class="flex items-center gap-2">
              <Input
                v-model="form.custom[i]"
                :aria-label="`Term ${i + 1} name`"
                :placeholder="`Term ${i + 1}`"
              />
              <Button
                variant="ghost"
                size="icon"
                :disabled="form.custom.length <= 1"
                :aria-label="`Remove term ${i + 1}`"
                @click="form.custom.splice(i, 1)"
                ><Trash2Icon class="size-4"
              /></Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="self-start"
              :disabled="form.custom.length >= 4"
              @click="form.custom.push(`Term ${form.custom.length + 1}`)"
              ><PlusIcon class="size-3.5" />Add term</Button
            >
          </div>
          <p v-else class="text-[13px] text-body">Terms: {{ termNames.join(', ') }}</p>
          <p v-if="err('terms')" role="alert" class="text-xs text-destructive">
            {{ err('terms') }}
          </p>
          <p class="text-xs text-muted-foreground">
            Term dates are spread evenly across the session with a two-week break. You set the real
            dates, breaks and exams on the next screen.
          </p>
        </template>

        <template v-else-if="stepKey === 'Copy setup'">
          <label class="flex items-center justify-between gap-3 rounded-lg border p-3.5">
            <span class="flex flex-col">
              <span class="font-medium"
                >Copy configuration from {{ latest?.name ?? 'the current session' }}</span
              >
              <span class="text-xs text-muted-foreground"
                >Saves setting up classes, subjects and grading again. Change anything after.</span
              >
            </span>
            <Switch v-model="form.copyOn" />
          </label>
          <div v-if="form.copyOn" class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="a in data.copyAreas"
              :key="a.id"
              class="flex items-start gap-2.5 rounded-md border p-3 text-[13px]"
            >
              <Checkbox
                :model-value="form.copy.includes(a.id)"
                @update:model-value="toggleArea(a.id, $event)"
              />
              <span class="flex flex-col">
                <span class="font-medium">{{ a.label }}</span>
                <span class="text-xs text-muted-foreground">{{ a.detail }}</span>
              </span>
            </label>
          </div>
          <div class="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3 text-[13px]">
            <span class="font-semibold">Never copied</span>
            <ul class="flex flex-wrap gap-x-4 gap-y-1">
              <li v-for="n in NEVER" :key="n" class="flex items-center gap-1.5 text-body">
                <XIcon class="size-3.5 text-faint" aria-hidden="true" />{{ n }}
              </li>
            </ul>
          </div>
        </template>

        <template v-else>
          <KeyValueCard title="New session" :rows="review" />
          <InlineNotice
            :tone="first ? 'info' : 'neutral'"
            :title="first ? 'This becomes your active session' : 'Created as Upcoming'"
            :description="
              first
                ? 'Your first term opens right away. Set its dates and breaks on the next screen.'
                : 'Nothing changes for the current session. Start the new one from Sessions & Terms when you’re ready.'
            "
          />
        </template>

        <div class="flex justify-between gap-2 border-t border-divider pt-4">
          <Button v-if="step > 0" variant="ghost" @click="step--">Back</Button>
          <Button v-else as-child variant="ghost"
            ><RouterLink
              :to="{ name: fromSetup ? routesPath.setup.name : routesPath.academics.sessions.name }"
              >Cancel</RouterLink
            ></Button
          >
          <Button v-if="step < STEPS.length - 1" @click="next">Continue</Button>
          <Button v-else :disabled="create.isPending.value" @click="submit">Create session</Button>
        </div>
      </div>
    </SectionCard>

    <aside class="flex flex-col gap-2 rounded-lg border bg-muted px-4 py-3.5 text-[13px]">
      <span class="font-semibold">What a session is</span>
      <p>
        One school year, from the first day of the first term to the last day of the final term.
        Each session keeps its own terms, enrollments, results and invoices.
      </p>
      <p v-if="isIso(form.start) && isIso(form.end)" class="text-muted-foreground">
        {{ form.name || 'This session' }} runs {{ fmtDate(form.start) }} to {{ fmtDate(form.end) }}.
      </p>
    </aside>
  </div>
</template>
