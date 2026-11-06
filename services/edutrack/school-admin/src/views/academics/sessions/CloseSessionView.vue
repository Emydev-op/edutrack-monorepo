<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useCloseSessionMutation, useSessionCloseQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import type { ChecklistStatus } from '@/types';

import { fmtRange } from './dates';

const CHECK_TONE: Record<ChecklistStatus, StatusTone> = {
  Complete: 'success',
  Blocking: 'error',
  Pending: 'warning',
  'In progress': 'warning',
  'Review needed': 'warning',
  Optional: 'neutral',
};

const route = useRoute();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const { data, isPending, error } = useSessionCloseQuery(id);
const close = useCloseSessionMutation();

const session = computed(() => data.value?.session);
const checklist = computed(() => data.value?.checklist);
const closed = computed(() => ['Closed', 'Archived'].includes(session.value?.status ?? ''));

function submit() {
  const s = session.value!;
  void confirm({
    title: `Close session ${s.name}?`,
    details: [
      [
        'Affects',
        `${s.students.toLocaleString('en-NG')} students · every term, result and invoice in ${s.name}`,
      ],
      [
        'What happens',
        `Every record in ${s.name} becomes read-only. Outstanding balances can still be paid.`,
      ],
      ['Reversible', 'No. Changes afterwards need a correction request approved by the Principal.'],
    ],
    acknowledgement: 'I understand this can’t be undone.',
    confirmLabel: `Close ${s.name}`,
    tone: 'destructive',
    action: async () => {
      await close.mutateAsync(s.id);
      toast.success(`${s.name} closed. It is now read-only.`);
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="error || !session || !checklist"
    tone="warning"
    title="Session not found"
    description="Go back to Sessions & Terms and pick a session."
  />
  <template v-else>
    <PageHeader
      :title="`Close session ${session.name}`"
      :status="session.status"
      :description="`${fmtRange(session.start, session.end)} · Closing makes the session read-only. Only authorised corrections can change it afterwards.`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.academics.sessions.name }"
            >Sessions & Terms</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="closed"
      tone="success"
      title="Session closed"
      :description="`${session.name} is now read-only${session.closedOn ? ` · closed ${session.closedOn}` : ''}. Next, check the current session’s setup or create the next one.`"
    >
      <template #action>
        <Button as-child size="sm"
          ><RouterLink :to="{ name: routesPath.academics.sessionNew.name }"
            >Create next session</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>

    <SectionCard
      :title="checklist.title"
      :description="
        closed ? 'Every item was resolved before closing.' : 'Resolve every blocking item first.'
      "
    >
      <ul class="flex flex-col divide-y divide-divider">
        <li
          v-for="item in checklist.items"
          :key="item.label"
          class="flex flex-wrap items-center justify-between gap-3 py-2.5"
        >
          <span class="flex min-w-0 flex-col">
            <RouterLink
              v-if="item.to && !closed"
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
      <div class="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-3">
        <span v-if="checklist.reason && !closed" class="text-xs text-muted-foreground">{{
          checklist.reason
        }}</span>
        <Button
          :variant="closed ? 'outline' : 'destructive'"
          :disabled="closed || !checklist.canClose || close.isPending.value"
          @click="submit"
          >{{ closed ? 'Session closed' : `Close ${session.name}` }}</Button
        >
      </div>
    </SectionCard>
  </template>
</template>
