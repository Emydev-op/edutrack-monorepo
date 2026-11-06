<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';

import { routesPath } from '@/router/routes-path';
import type { StaffDetail } from '@/types';

const props = defineProps<{ staff: StaffDetail }>();
const s = computed(() => props.staff);

const since = computed(() =>
  /^\d{4}-\d{2}-\d{2}$/.test(s.value.since)
    ? new Date(`${s.value.since}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : s.value.since,
);
const cards = computed(() => [
  {
    title: 'Personal',
    rows: [
      { label: 'Gender', value: s.value.gender || 'Not given' },
      { label: 'Phone', value: s.value.phone },
      { label: 'Email', value: s.value.email },
      { label: 'Address', value: s.value.address },
      { label: 'Emergency contact', value: s.value.emergencyContact },
    ],
  },
  {
    title: 'Employment',
    status: s.value.status,
    rows: [
      { label: 'Staff ID', value: s.value.staffNumber },
      { label: 'Type', value: `${s.value.kind} · ${s.value.employment}` },
      { label: 'Department', value: s.value.department },
      { label: 'Position', value: s.value.position },
      { label: 'Date employed', value: since.value },
      { label: 'Branch', value: s.value.branch },
      ...(s.value.leftOn ? [{ label: 'Left', value: s.value.leftOn }] : []),
    ],
  },
]);
const load = computed(() => s.value.load);
const pct = computed(() => (load.value?.max ? (load.value.periods / load.value.max) * 100 : 0));
const meterColor = computed(() =>
  !load.value
    ? 'var(--primary)'
    : load.value.periods > load.value.max
      ? 'var(--error)'
      : load.value.periods >= load.value.max - 2
        ? 'var(--warning)'
        : 'var(--success)',
);
</script>

<template>
  <InlineNotice
    v-if="s.status === 'Deactivated'"
    tone="neutral"
    :title="`Deactivated${s.leftOn ? ` · ${s.leftOn}` : ''}`"
    description="Staff who leave are deactivated, never deleted. Their past results, approvals and payroll history stay attributed to them."
  />
  <InlineNotice
    v-else-if="s.kind === 'Teaching' && load && !load.subjects && !s.classTeacherOf.length"
    tone="warning"
    title="Not assigned to any class"
    description="They won’t see students or score sheets in the Teacher Workspace."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.academics.assignments.name }"
          >Assign</RouterLink
        ></Button
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
    <section
      v-if="s.kind === 'Teaching' && load"
      class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4"
    >
      <header class="flex items-center justify-between gap-2">
        <h2 class="text-[15px] font-semibold">Teaching this term</h2>
        <RouterLink
          :to="{ name: routesPath.staff.teaching.name, params: { id: s.id } }"
          class="text-[13px] text-primary hover:underline"
          >View teaching</RouterLink
        >
      </header>
      <MeterRow
        label="Workload"
        :percent="pct"
        :value="`${load.periods} of ${load.max}`"
        :color="meterColor"
        value-width="70px"
      />
      <p class="text-[13px] text-body">
        {{ load.subjects }} subject assignment{{ load.subjects === 1 ? '' : 's' }} across
        {{ load.classes }} class{{ load.classes === 1 ? '' : 'es' }}
        <template v-if="s.classTeacherOf.length">
          · class teacher of {{ s.classTeacherOf.join(', ') }}</template
        >
      </p>
    </section>
  </div>
</template>
