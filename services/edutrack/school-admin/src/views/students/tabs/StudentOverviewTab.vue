<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { StudentDetail } from '@/types';

const props = defineProps<{ student: StudentDetail }>();
const context = useContextStore();
const s = computed(() => props.student);

const dob = computed(() =>
  s.value.dateOfBirth
    ? new Date(s.value.dateOfBirth).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '',
);
const current = computed(() => s.value.invoices[0]);
const cards = computed(() => [
  {
    title: 'Current enrollment',
    status: s.value.status,
    rows: [
      {
        label: 'Session',
        value: `${context.current.session} · ${s.value.exit ? s.value.status : 'Active'}`,
      },
      { label: 'Branch', value: s.value.branch },
      { label: 'Section', value: s.value.section },
      { label: 'Class', value: s.value.className || 'Awaiting arm' },
      { label: 'Class teacher', value: s.value.classTeacher },
      { label: 'Enrolled since', value: s.value.enrolledSince },
    ],
  },
  {
    title: 'Personal',
    rows: [
      { label: 'Date of birth', value: dob.value },
      { label: 'Gender', value: s.value.gender },
      { label: 'State of origin', value: s.value.stateOfOrigin },
      { label: 'Home address', value: s.value.address },
      { label: 'Medical notes', value: s.value.medicalNotes || 'None recorded' },
    ],
  },
  {
    title: 'Admission',
    rows: [
      { label: 'Admission no.', value: s.value.admissionNo },
      { label: 'Admitted', value: s.value.admittedOn },
      { label: 'Type', value: s.value.admissionType },
      { label: 'Admitted into', value: s.value.admittedInto },
      { label: 'Previous school', value: s.value.previousSchool },
    ],
  },
  {
    title: 'This term',
    rows: [
      { label: 'First Term results', value: s.value.termResults },
      {
        label: 'Fees',
        value: current.value
          ? `${current.value.status} · ${formatNaira(current.value.balance)} left`
          : s.value.balance
            ? `${formatNaira(s.value.balance)} outstanding`
            : 'Paid',
      },
      { label: 'Assignments', value: s.value.assignments },
    ],
  },
]);
const feesTo = computed(() => ({
  name: routesPath.students.fees.name,
  params: { id: s.value.id },
}));
</script>

<template>
  <InlineNotice
    v-if="s.exit"
    tone="neutral"
    :title="`${s.exit.kind} recorded · effective ${s.exit.date}`"
    :description="`${s.exit.reason}${s.exit.destination ? ` · ${s.exit.destination}` : ''}. Results, invoices, payments and documents stay on this record.`"
  />
  <InlineNotice
    v-if="!s.guardians.length && !s.exit"
    tone="warning"
    title="No guardian linked"
    description="This student has no parent or guardian on record. Fee reminders and results cannot be sent to anyone."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.students.parents.name, query: { add: s.id } }"
          >Link guardian</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="s.balance && !s.exit"
    tone="error"
    :title="`${formatNaira(s.balance)} outstanding`"
    :description="
      s.invoices.length > 1
        ? `${formatNaira(s.invoices[0]!.balance)} for ${s.invoices[0]!.period} and ${formatNaira(s.invoices[1]!.balance)} carried from ${s.invoices[1]!.period}.`
        : `On ${s.invoices[0]?.number ?? 'the current invoice'}.`
    "
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="feesTo">View fees</RouterLink></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="s.awaitingEnrollment"
    tone="info"
    title="Not yet placed in a class arm"
    description="Teachers can’t see this student until they’re enrolled into an arm for this session."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.students.enrollment.name }">Enroll</RouterLink></Button
      >
    </template>
  </InlineNotice>

  <div class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      v-for="c in cards"
      :key="c.title"
      :title="c.title"
      :rows="c.rows"
      :status="c.status"
    />
  </div>
  <ActivityTimeline title="Recent activity" :items="s.activity.slice(-4).reverse()" />
</template>
