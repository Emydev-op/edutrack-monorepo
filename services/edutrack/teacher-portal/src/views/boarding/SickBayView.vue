<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { HeartPulseIcon, PlusIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useDischargeMutation,
  useBoardingStudentsQuery,
  useMyHostelQuery,
  useRecordVisitMutation,
  useSickBayQuery,
} from '@/api/services/boarding';
import BoarderPicker from '@/components/boarding/BoarderPicker.vue';
import {
  boardersOf,
  VISIT_OUTCOMES,
  type BoarderOption,
} from '@/components/boarding/boarding-format';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import type { SickBayVisit, VisitOutcome } from '@/types';

const DAY_OPTIONS = [7, 14, 30];
const days = ref(14);
const daysValue = computed({
  get: () => String(days.value),
  set: (v: string) => (days.value = Number(v)),
});
const { data, isPending, error } = useSickBayQuery(days);
const discharge = useDischargeMutation();
const confirm = useConfirm();

const inSickBay = computed(() => data.value?.inSickBay ?? []);
const visits = computed(() => data.value?.visits ?? []);

const outcomeTone = (o: VisitOutcome) =>
  o === 'Back to class'
    ? ('success' as const)
    : o === 'Admitted'
      ? ('warning' as const)
      : ('error' as const);

const dischargeVisit = (v: SickBayVisit) =>
  confirm({
    title: `Discharge ${v.student.name}?`,
    description: 'They go back to class or their hostel. Their parents are told.',
    details: [
      ['Seen', v.seen],
      ['Complaint', v.complaint],
    ],
    input: { label: 'Note (optional)', placeholder: 'e.g. Fever gone; finish the antibiotics' },
    confirmLabel: 'Discharge',
    action: async ({ text }) => {
      await discharge.mutateAsync({ id: v.id, note: text || undefined });
      toast.success(`${v.student.name} discharged`);
    },
  });

/* ---------- Record visit ---------- */

const recording = ref(false);
const record = useRecordVisitMutation();
const { data: hostel, isPending: hostelLoading } = useMyHostelQuery();

// Students to pick: house staff's boarders, students the search finds (the workspace search
// covers the students the staff member teaches), and anyone seen recently.
const pickerSearch = ref('');
const searchText = refDebounced(pickerSearch, 300);
const { data: students } = useBoardingStudentsQuery(() =>
  searchText.value.trim().length >= 2 ? searchText.value.trim() : '',
);
const options = computed<BoarderOption[]>(() => {
  const out = new Map<string, BoarderOption>();
  for (const b of boardersOf(hostel.value)) out.set(b.studentId, b);
  for (const v of visits.value)
    if (!out.has(v.student.id))
      out.set(v.student.id, {
        studentId: v.student.id,
        name: v.student.name,
        admissionNo: v.student.admissionNo,
        className: v.student.className,
        place: v.student.boarder ? 'Boarder' : 'Day student',
        medicalNotes: v.student.medicalNotes ?? '',
      });
  // The nurse can pick anyone on the roll.
  for (const s of students.value ?? []) if (!out.has(s.studentId)) out.set(s.studentId, s);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
});

const form = reactive({
  studentId: '',
  complaint: '',
  assessment: '',
  treatment: '',
  medication: '',
  outcome: 'Back to class' as VisitOutcome,
  notes: '',
  seenAt: '',
});
const errors = reactive<Record<string, string>>({});
const recordError = ref('');

watch(recording, (o) => {
  if (!o) return;
  Object.assign(form, {
    studentId: '',
    complaint: '',
    assessment: '',
    treatment: '',
    medication: '',
    outcome: 'Back to class',
    notes: '',
    seenAt: '',
  });
  pickerSearch.value = '';
  for (const key of Object.keys(errors)) delete errors[key];
  recordError.value = '';
});

async function submitVisit() {
  for (const key of Object.keys(errors)) delete errors[key];
  recordError.value = '';
  if (!form.studentId) errors.studentId = 'Choose the student.';
  if (!form.complaint.trim()) errors.complaint = 'Enter the complaint.';
  if (Object.keys(errors).length) return;
  const opt = (s: string) => s.trim() || undefined;
  try {
    const visit = await record.mutateAsync({
      studentId: form.studentId,
      complaint: form.complaint.trim(),
      assessment: opt(form.assessment),
      treatment: opt(form.treatment),
      medication: opt(form.medication),
      outcome: form.outcome,
      notes: opt(form.notes),
      seenAt: form.seenAt || undefined,
    });
    toast.success(`Visit recorded for ${visit.student.name}`, {
      description: 'Their parents are told.',
    });
    recording.value = false;
  } catch (e) {
    Object.assign(errors, fieldErrorsOf(e));
    recordError.value =
      errorCodeOf(e) === 'ALREADY_ADMITTED'
        ? 'This student is already in the sick bay. Discharge them before recording a new admission.'
        : getApiErrorMessage(e, 'The visit couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <PageHeader
    title="Sick bay"
    description="Who’s in the sick bay now and recent visits. Parents are told about each visit."
  >
    <template #actions>
      <Button class="h-10" @click="recording = true"
        ><PlusIcon class="size-4" /> Record visit</Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="The sick bay couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
  </div>
  <template v-else>
    <SectionCard
      title="In sick bay now"
      :description="inSickBay.length ? `${inSickBay.length} admitted` : undefined"
      flush
    >
      <p v-if="!inSickBay.length" class="px-4 py-3.5 text-[13px] text-faint">
        No one is in the sick bay.
      </p>
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li
          v-for="v in inSickBay"
          :key="v.id"
          class="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-[14px] font-medium"
              >{{ v.student.name }}
              <span class="text-xs font-normal text-muted-foreground"
                >· {{ v.student.className }} · {{ v.student.admissionNo }}</span
              ></span
            >
            <span class="text-[13px]">{{ v.complaint }}</span>
            <span class="text-xs text-muted-foreground"
              >Admitted {{ v.seen }}{{ v.treatment ? ` · ${v.treatment}` : ''
              }}{{ v.medication ? ` · ${v.medication}` : '' }}</span
            >
            <p
              v-if="v.student.medicalNotes?.trim()"
              class="flex items-start gap-1.5 rounded-md bg-error-subtle px-2.5 py-1.5 text-xs text-error-strong"
            >
              <HeartPulseIcon class="mt-px size-3.5 shrink-0" />
              <span><span class="font-medium">Medical:</span> {{ v.student.medicalNotes }}</span>
            </p>
          </div>
          <Button variant="outline" class="h-11 shrink-0 px-5" @click="dischargeVisit(v)"
            >Discharge</Button
          >
        </li>
      </ul>
    </SectionCard>

    <SectionCard title="Recent visits" flush>
      <template #actions>
        <NativeSelect v-model="daysValue" aria-label="Period" class="h-8 w-36 text-[13px]">
          <NativeSelectOption v-for="d in DAY_OPTIONS" :key="d" :value="String(d)"
            >Last {{ d }} days</NativeSelectOption
          >
        </NativeSelect>
      </template>
      <EmptyState
        v-if="!visits.length"
        class="m-4"
        title="No visits"
        :description="`No sick bay visits in the last ${days} days.`"
      />
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li v-for="v in visits" :key="v.id" class="flex flex-col gap-1 px-4 py-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[14px] font-medium">{{ v.student.name }}</span>
            <span class="text-xs text-muted-foreground">{{ v.student.className }}</span>
            <StatusBadge :label="v.outcome" :tone="outcomeTone(v.outcome)" />
            <StatusBadge v-if="v.inSickBay" label="In sick bay" tone="warning" :dot="false" />
          </div>
          <span class="text-[13px]">{{ v.complaint }}</span>
          <span class="text-xs text-muted-foreground">
            {{ [v.seen, v.assessment, v.treatment, v.medication].filter(Boolean).join(' · ') }}
            <template v-if="v.recordedBy"> · by {{ v.recordedBy }}</template>
          </span>
          <span v-if="v.notes" class="text-xs text-muted-foreground">{{ v.notes }}</span>
        </li>
      </ul>
    </SectionCard>
  </template>

  <SideDrawer
    v-model:open="recording"
    title="Record visit"
    description="The student’s parents are told."
    :dirty="Boolean(form.complaint.trim() || form.treatment.trim())"
  >
    <form id="record-visit" class="flex flex-col gap-4" novalidate @submit.prevent="submitVisit">
      <BoarderPicker
        v-model="form.studentId"
        v-model:search="pickerSearch"
        :options="options"
        :loading="hostelLoading"
        :error="errors.studentId"
        show-medical
        empty-text="Search for the student by name."
      />
      <div class="flex flex-col gap-1.5">
        <Label for="visit-complaint">Complaint</Label>
        <Textarea
          id="visit-complaint"
          v-model="form.complaint"
          :rows="2"
          placeholder="e.g. Headache and fever since morning"
          :aria-invalid="Boolean(errors.complaint)"
        />
        <span v-if="errors.complaint" role="alert" class="text-xs text-error-strong">{{
          errors.complaint
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-assessment"
          >Assessment <span class="font-normal text-faint">(optional)</span></Label
        >
        <Input id="visit-assessment" v-model="form.assessment" placeholder="e.g. Temp 38.4°C" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-treatment"
          >Treatment <span class="font-normal text-faint">(optional)</span></Label
        >
        <Input id="visit-treatment" v-model="form.treatment" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-medication"
          >Medication <span class="font-normal text-faint">(optional)</span></Label
        >
        <Input
          id="visit-medication"
          v-model="form.medication"
          placeholder="e.g. Paracetamol 500mg"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-outcome">Outcome</Label>
        <NativeSelect id="visit-outcome" v-model="form.outcome" class="w-full">
          <NativeSelectOption v-for="o in VISIT_OUTCOMES" :key="o" :value="o">{{
            o
          }}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-seen"
          >Seen at <span class="font-normal text-faint">(leave blank for now)</span></Label
        >
        <Input id="visit-seen" v-model="form.seenAt" type="datetime-local" />
        <span v-if="errors.seenAt" role="alert" class="text-xs text-error-strong">{{
          errors.seenAt
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visit-notes"
          >Notes <span class="font-normal text-faint">(optional)</span></Label
        >
        <Textarea id="visit-notes" v-model="form.notes" :rows="2" />
      </div>
      <p
        v-if="recordError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ recordError }}
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="recording = false">Cancel</Button>
      <Button type="submit" form="record-visit" :disabled="record.isPending.value">
        <Spinner v-if="record.isPending.value" />Record visit
      </Button>
    </template>
  </SideDrawer>
</template>
