<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { PaperclipIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useCorrectionActionMutation, useCorrectionsQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { Correction } from '@/types';

const confirm = useConfirm();
const auth = useAuthStore();
const { data: list, isPending } = useCorrectionsQuery();
const act = useCorrectionActionMutation();
const selectedId = useRouteQuery<string>('id', '');

const selected = computed(
  () => list.value?.find((c) => c.id === selectedId.value) ?? list.value?.[0] ?? null,
);
const statusLabel = (c: Correction) => (c.status === 'Applied' ? 'Completed' : c.status);

function approve(c: Correction) {
  void confirm({
    title: `Approve correction for ${c.student}?`,
    details: [
      [
        'Change',
        `${c.component.split(' (')[0]} ${c.original} → ${c.proposed} · total ${c.originalTotal} → ${c.proposedTotal}`,
      ],
      ['Report card', 'Re-issued as the next version. The earlier version stays in the history.'],
      ['Notifies', `${c.student}’s guardians and the student`],
      ['Authorised by', `${auth.fullName} · audit logged`],
    ],
    confirmLabel: 'Approve and apply',
    action: async () => {
      await act.mutateAsync({ id: c.id, action: 'approve', note: '' });
      toast.success(`Correction applied for ${c.student}.`);
    },
  });
}

function reject(c: Correction) {
  void confirm({
    title: 'Reject this correction?',
    details: [
      ['Result', `Stays at ${c.original} · ${c.originalTotal}`],
      ['Notifies', `${c.requestedBy.split(' · ')[0]} with your reason`],
    ],
    input: { label: 'Reason', placeholder: 'Why the change is not approved', required: true },
    confirmLabel: 'Reject',
    tone: 'destructive',
    action: async ({ text }) => {
      await act.mutateAsync({ id: c.id, action: 'reject', note: text });
      toast.success('Correction rejected. The teacher has been told why.');
    },
  });
}
</script>

<template>
  <PageHeader
    title="Result corrections"
    description="Published results are locked. Each correction keeps the original value and its history."
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.results.name }"
          >Back to results</RouterLink
        ></Button
      >
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-80" />
  <template v-else-if="list">
    <template v-if="!list.length">
      <InlineNotice
        tone="neutral"
        title="No correction requests"
        description="Corrections apply only to published results. Before publishing, teachers can still edit a sheet until it is approved."
      >
        <template #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink :to="{ name: routesPath.academics.results.name }"
              >Go to results</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>
      <EmptyState
        title="No correction requests"
        description="When a teacher asks to change a published score, the request appears here for approval."
      />
    </template>
    <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <ul class="flex flex-col gap-2" aria-label="Correction requests">
        <li v-for="c in list" :key="c.id">
          <button
            type="button"
            :aria-pressed="selected?.id === c.id"
            :class="
              cn(
                'flex w-full flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary',
                selected?.id === c.id && 'border-primary bg-brand-tint',
              )
            "
            @click="selectedId = c.id"
          >
            <span class="flex items-start justify-between gap-2">
              <span class="font-semibold">{{ c.student }}</span>
              <StatusBadge
                :label="statusLabel(c)"
                :tone="c.status === 'Under review' ? 'warning' : undefined"
              />
            </span>
            <span class="text-[13px] text-body">{{ c.subjectName }} · {{ c.arm }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ c.component }}: {{ c.original }} → {{ c.proposed }} · {{ c.requestedAt }}</span
            >
          </button>
        </li>
      </ul>

      <section
        v-if="selected"
        class="flex flex-col gap-3"
        :aria-label="`Correction for ${selected.student}`"
      >
        <div class="flex flex-col gap-3 rounded-lg border bg-card px-4.5 py-4">
          <header class="flex flex-wrap items-start justify-between gap-2">
            <div class="flex flex-col gap-0.5">
              <h2 class="text-[15px] font-semibold">{{ selected.student }}</h2>
              <span class="text-[13px] text-muted-foreground"
                >{{ selected.subjectName }} · {{ selected.arm }} · {{ selected.component }}</span
              >
            </div>
            <StatusBadge
              :label="statusLabel(selected)"
              :tone="selected.status === 'Under review' ? 'warning' : undefined"
            />
          </header>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-md bg-muted px-3.5 py-3">
              <span class="text-xs text-faint">Original</span>
              <p class="text-2xl font-semibold tabular-nums">{{ selected.original }}</p>
              <span class="text-xs text-muted-foreground">Total {{ selected.originalTotal }}</span>
            </div>
            <div class="rounded-md bg-brand-tint px-3.5 py-3">
              <span class="text-xs text-faint">Proposed</span>
              <p class="text-2xl font-semibold text-primary tabular-nums">
                {{ selected.proposed }}
              </p>
              <span class="text-xs text-muted-foreground">Total {{ selected.proposedTotal }}</span>
            </div>
          </div>
          <dl class="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt class="text-faint">Reason</dt>
            <dd>{{ selected.reason }}</dd>
            <dt class="text-faint">Requested by</dt>
            <dd>{{ selected.requestedBy }} · {{ selected.requestedAt }}</dd>
            <dt class="text-faint">Evidence</dt>
            <dd>
              <span v-if="selected.evidence" class="inline-flex items-center gap-1.5"
                ><PaperclipIcon class="size-3.5 text-faint" aria-hidden="true" />{{
                  selected.evidence
                }}</span
              >
              <span v-else class="text-muted-foreground">None attached</span>
            </dd>
            <template v-if="selected.decisionNote">
              <dt class="text-faint">Decision note</dt>
              <dd>{{ selected.decisionNote }}</dd>
            </template>
          </dl>
          <div
            v-if="selected.status === 'Under review'"
            class="flex justify-end gap-2 border-t border-divider pt-3"
          >
            <Button variant="outline" @click="reject(selected)">Reject</Button>
            <Button @click="approve(selected)">Approve and apply</Button>
          </div>
          <div
            v-else-if="selected.status === 'Applied'"
            class="flex justify-end border-t border-divider pt-3"
          >
            <Button as-child variant="outline" size="sm"
              ><RouterLink
                :to="{
                  name: routesPath.academics.reportCard.name,
                  params: { studentId: selected.studentId },
                }"
                >View re-issued report card</RouterLink
              ></Button
            >
          </div>
        </div>
        <KeyValueCard
          title="What approval does"
          :rows="[
            { label: 'Score', value: 'Updated on the published sheet; the original is kept' },
            { label: 'Report card', value: 'Re-issued as a new version' },
            { label: 'Audit', value: 'Logged with who approved it and when' },
          ]"
        />
        <ActivityTimeline title="Correction history" :items="selected.history" />
      </section>
    </div>
  </template>
</template>
