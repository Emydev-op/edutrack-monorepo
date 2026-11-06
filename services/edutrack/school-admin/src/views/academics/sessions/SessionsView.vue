<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useCloseTermMutation,
  useSessionsQuery,
  useStartSessionMutation,
} from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import type { AcademicSession, ChecklistStatus, SessionStatus, TermStatus } from '@/types';

import { eventLabel, fmtDate, fmtRange } from './dates';

const r = routesPath.academics;
const confirm = useConfirm();
const { data, isPending } = useSessionsQuery();
const start = useStartSessionMutation();
const closeTerm = useCloseTermMutation();

const SESSION_TONE: Record<SessionStatus, StatusTone> = {
  Upcoming: 'info',
  Active: 'success',
  Closing: 'warning',
  Closed: 'neutral',
  Archived: 'neutral',
};
const TERM_TONE: Record<TermStatus, StatusTone> = {
  Upcoming: 'info',
  Active: 'success',
  Ended: 'warning',
  Closed: 'neutral',
};
const CHECK_TONE: Record<ChecklistStatus, StatusTone> = {
  Complete: 'success',
  Blocking: 'error',
  Pending: 'warning',
  'In progress': 'warning',
  'Review needed': 'warning',
  Optional: 'neutral',
};
const LIFECYCLE: SessionStatus[] = ['Upcoming', 'Active', 'Closing', 'Closed', 'Archived'];

const sessions = computed(() => data.value?.sessions ?? []);
const current = computed(() => sessions.value.find((s) => s.id === data.value?.currentId) ?? null);
const checklist = computed(() => data.value?.termChecklist ?? null);
const closingTerm = computed(() =>
  current.value?.terms.find((t) => t.id === checklist.value?.termId),
);

const columns: Column[] = [
  { key: 'name', label: 'Session', width: 'minmax(110px,1fr)' },
  { key: 'dates', label: 'Dates', width: 'minmax(190px,1.5fr)' },
  { key: 'terms', label: 'Terms', width: '70px' },
  { key: 'students', label: 'Students', align: 'right', width: '90px' },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'action', label: '', width: 'minmax(170px,1.3fr)' },
];

function startSession(s: AcademicSession) {
  const active = sessions.value.find((x) => x.status === 'Active');
  void confirm({
    title: `Start ${s.name}?`,
    details: [
      ['Becomes', `Active · ${s.terms[0]?.name ?? 'first term'} opens`],
      ...(active
        ? ([
            [
              'Current session',
              `${active.name} moves to Closing so you can finish promotion and close it`,
            ],
          ] as [string, string][])
        : []),
      ['Reversible', 'No. Each session moves forward through its lifecycle.'],
    ],
    confirmLabel: 'Start session',
    action: async () => {
      await start.mutateAsync(s.id);
      toast.success(`${s.name} is now active.`);
    },
  });
}

function closeCurrentTerm() {
  const c = checklist.value!;
  const t = closingTerm.value!;
  void confirm({
    title: `Close ${t.name}?`,
    details: [
      [
        'What happens',
        `${t.name} becomes read-only. Results stay published and invoices stay collectable.`,
      ],
      [
        'Next',
        current.value!.terms[current.value!.terms.indexOf(t) + 1]?.name ??
          'Close the session after promotion',
      ],
    ],
    acknowledgement: 'I understand closing a term can’t be undone.',
    confirmLabel: `Close ${t.name}`,
    action: async () => {
      await closeTerm.mutateAsync(c.termId);
      toast.success(`${t.name} closed.`);
    },
  });
}
</script>

<template>
  <PageHeader
    title="Sessions & Terms"
    description="Each session is a separate record. Past sessions stay available read-only."
  >
    <template #actions>
      <Button v-if="current" as-child variant="outline"
        ><RouterLink :to="{ name: r.terms.name, params: { id: current.id } }"
          >Edit terms & calendar</RouterLink
        ></Button
      >
      <Button as-child
        ><RouterLink :to="{ name: r.sessionNew.name }">New session</RouterLink></Button
      >
    </template>
  </PageHeader>

  <SetupStepBar v-if="sessions.length" step="academic-session" auto />

  <Skeleton v-if="isPending" class="h-80" />
  <template v-else-if="data">
    <EmptyState
      v-if="!sessions.length"
      illustrated
      title="No academic session yet"
      description="Create your first session and its dates. Terms, classes, fees and results all belong to a session."
    >
      <Button as-child
        ><RouterLink :to="{ name: r.sessionNew.name, query: { from: 'setup' } }"
          >Create first session</RouterLink
        ></Button
      >
    </EmptyState>

    <template v-else>
      <SectionCard title="Session lifecycle">
        <ol class="flex flex-wrap items-center gap-1.5 text-[13px]">
          <template v-for="(l, i) in LIFECYCLE" :key="l">
            <li
              :class="
                cn(
                  'rounded-full border px-3 py-1',
                  current?.status === l
                    ? 'border-primary bg-brand-tint font-medium text-primary'
                    : 'text-faint',
                )
              "
            >
              {{ l }}
            </li>
            <ChevronRightIcon
              v-if="i < LIFECYCLE.length - 1"
              class="size-3.5 text-faint"
              aria-hidden="true"
            />
          </template>
        </ol>
        <p class="mt-2 text-xs text-muted-foreground">
          A new session stays Upcoming until you start it. Starting it moves the current one to
          Closing, where you finish promotion and close it.
        </p>
      </SectionCard>

      <DataTable
        title="Academic sessions"
        :columns="columns"
        :rows="sessions"
        :row-key="(s) => s.id"
      >
        <template #cell-name="{ row }"
          ><span class="font-semibold">{{ row.name }}</span></template
        >
        <template #cell-dates="{ row }">{{ fmtRange(row.start, row.end) }}</template>
        <template #cell-terms="{ row }">{{ row.terms.length }}</template>
        <template #cell-students="{ row }"
          ><span class="tabular-nums">{{ row.students.toLocaleString('en-NG') }}</span></template
        >
        <template #cell-status="{ row }"
          ><StatusBadge :label="row.status" :tone="SESSION_TONE[row.status]"
        /></template>
        <template #cell-action="{ row }">
          <Button
            v-if="row.status === 'Upcoming'"
            size="sm"
            variant="outline"
            @click="startSession(row)"
            >Start session</Button
          >
          <RouterLink
            v-else-if="row.status === 'Closing'"
            class="font-medium text-primary hover:underline"
            :to="{ name: r.sessionClose.name, params: { id: row.id } }"
            >Continue closing</RouterLink
          >
          <RouterLink
            v-else-if="row.status === 'Active'"
            class="font-medium text-primary hover:underline"
            :to="{ name: r.terms.name, params: { id: row.id } }"
            >Edit terms</RouterLink
          >
          <span v-else class="text-xs text-faint">{{
            row.closedOn ? `Read-only · closed ${row.closedOn}` : 'Read-only'
          }}</span>
        </template>
      </DataTable>
      <p
        v-if="sessions.some((s) => s.status === 'Upcoming')"
        class="-mt-2 text-xs text-muted-foreground"
      >
        {{
          sessions
            .filter((s) => s.status === 'Upcoming')
            .map((s) => `${s.name}: ${s.note}`)
            .join(' · ')
        }}
      </p>

      <template v-if="current">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold">Terms · {{ current.name }}</h2>
          <RouterLink
            class="text-[13px] font-medium text-primary hover:underline"
            :to="{ name: r.terms.name, params: { id: current.id } }"
            >Edit dates and events</RouterLink
          >
        </div>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="t in current.terms"
            :key="t.id"
            class="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="flex flex-col">
                <span class="font-semibold">{{ t.name }}</span>
                <span class="text-xs text-muted-foreground">{{ fmtRange(t.start, t.end) }}</span>
              </span>
              <StatusBadge :label="t.status" :tone="TERM_TONE[t.status]" />
            </div>
            <ul v-if="t.events.length" class="flex flex-col gap-1 text-[13px]">
              <li v-for="e in t.events" :key="e.id" class="flex justify-between gap-3">
                <span class="text-muted-foreground">{{ e.name || eventLabel(e.type) }}</span>
                <span class="text-right">{{ fmtRange(e.start, e.end, false) }}</span>
              </li>
            </ul>
            <p v-else class="text-[13px] text-faint">No breaks or events yet.</p>
          </div>
        </div>
      </template>

      <SectionCard
        v-if="checklist && closingTerm"
        :title="checklist.title"
        description="The term cannot close until blocking items are resolved. Nothing closes automatically."
      >
        <ul class="flex flex-col divide-y divide-divider">
          <li
            v-for="item in checklist.items"
            :key="item.label"
            class="flex flex-wrap items-center justify-between gap-3 py-2.5"
          >
            <span class="flex min-w-0 flex-col">
              <RouterLink
                v-if="item.to"
                :to="item.to"
                class="text-[13px] font-medium hover:text-primary hover:underline"
                >{{ item.label }}</RouterLink
              >
              <span v-else class="text-[13px] font-medium">{{ item.label }}</span>
              <span class="text-xs text-muted-foreground">{{ item.detail }}</span>
            </span>
            <StatusBadge :label="item.status" :tone="CHECK_TONE[item.status]" />
          </li>
        </ul>
        <div
          class="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-3"
        >
          <span v-if="checklist.reason" class="text-xs text-muted-foreground">{{
            checklist.reason
          }}</span>
          <Button :disabled="!checklist.canClose" @click="closeCurrentTerm"
            >Close {{ closingTerm.name }}</Button
          >
        </div>
      </SectionCard>
      <p v-else-if="current" class="text-[13px] text-muted-foreground">
        {{
          current.status === 'Upcoming' ? `${current.name} starts ${fmtDate(current.start)}.` : ''
        }}
      </p>
    </template>
  </template>
</template>
