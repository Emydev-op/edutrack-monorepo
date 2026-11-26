<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { PhoneIcon } from '@lucide/vue';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useExeatQuery } from '@/api/services/boarding';
import { useMeQuery } from '@/api/services/shell';
import { dateTimeOf, exeatBadge } from '@/components/boarding/boarding-format';
import { useExeatActions } from '@/components/boarding/useExeatActions';
import { meets } from '@/config/navigation';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id ?? ''));
const { data: e, isPending, error, refetch } = useExeatQuery(id);
const { data: me } = useMeQuery();
const actions = useExeatActions();

watch(e, (x) => layout.setRecordLabel(x?.student.name ?? null), { immediate: true });

const badge = computed(() => (e.value ? exeatBadge(e.value) : null));
const canDecide = computed(() => meets(me.value, 'exeats'));
const atGate = computed(() => meets(me.value, 'gate'));

const rows = computed<[string, string][]>(() => {
  const x = e.value;
  if (!x) return [];
  return [
    ['Boarder', `${x.student.name} · ${x.student.admissionNo}`],
    ['Class', x.student.className],
    ['Hostel', [x.student.hostel, x.student.room].filter(Boolean).join(' · ') || '—'],
    ['Campus', x.campus],
    ['Kind', x.kind],
    ['Leaves', x.leaves],
    ['Back by', x.returns],
    ['Reason', x.reason || '—'],
    ['Requested by', x.requestedByName ?? x.requestedBy],
    ...(x.decidedBy
      ? ([[x.status === 'Declined' ? 'Declined by' : 'Decided by', x.decidedBy]] as [
          string,
          string,
        ][])
      : []),
    ...(x.decisionNote ? ([['Note', x.decisionNote]] as [string, string][]) : []),
    ...(x.signedOutAt
      ? ([
          [
            'Signed out',
            `${dateTimeOf(x.signedOutAt)}${x.collectedBy ? ` · collected by ${x.collectedBy}` : ''}`,
          ],
        ] as [string, string][])
      : []),
    ...(x.signedInAt
      ? ([['Signed back in', `${dateTimeOf(x.signedInAt)}${x.lateReturn ? ' (late)' : ''}`]] as [
          string,
          string,
        ][])
      : []),
  ];
});
</script>

<template>
  <EmptyState
    v-if="error"
    :title="
      isForbidden(error)
        ? 'You can’t open this exeat'
        : isNotFound(error)
          ? 'This exeat doesn’t exist'
          : 'This exeat couldn’t load'
    "
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button v-if="!isNotFound(error) && !isForbidden(error)" variant="outline" @click="refetch()"
      >Try again</Button
    >
  </EmptyState>
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-12 w-72" />
    <Skeleton class="h-64 w-full" />
  </div>
  <template v-else-if="e">
    <PageHeader
      :title="`${e.student.name}’s exeat`"
      :description="`${e.kind} · ${e.leaves} → ${e.returns}`"
    >
      <template #actions>
        <template v-if="e.status === 'Requested' && canDecide">
          <Button class="h-10" @click="actions.approve(e)">Approve</Button>
          <Button variant="outline" class="h-10" @click="actions.decline(e)">Decline</Button>
        </template>
        <Button v-if="e.status === 'Approved' && atGate" class="h-10" @click="actions.signOut(e)"
          >Sign out</Button
        >
        <Button
          v-if="e.status === 'Out' && atGate"
          class="h-10"
          :disabled="actions.signingIn.value"
          @click="actions.signIn(e)"
          >Sign in</Button
        >
        <Button
          v-if="(e.status === 'Requested' || e.status === 'Approved') && canDecide"
          variant="outline"
          class="h-10"
          @click="actions.cancel(e)"
          >Cancel exeat</Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      v-if="e.overdue"
      tone="error"
      title="Overdue"
      :description="`${e.student.name} was due back ${e.returns} and hasn’t signed in at the gate.`"
    />
    <InlineNotice
      v-else-if="e.status === 'Requested'"
      tone="brand"
      title="Waiting for a decision"
      description="The parent is told when you approve or decline."
    />

    <SectionCard title="Details">
      <template #actions>
        <StatusBadge v-if="badge" :label="badge.label" :tone="badge.tone" />
      </template>
      <dl class="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
        <div v-for="[label, value] in rows" :key="label" class="flex flex-col">
          <dt class="text-xs text-muted-foreground">{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
    </SectionCard>

    <SectionCard title="Who collects">
      <div v-if="e.pickup" class="mb-3 flex flex-col text-[13px]">
        <span class="font-medium"
          >{{ e.pickup.name }}
          <span class="font-normal text-muted-foreground">({{ e.pickup.relationship }})</span></span
        >
        <a
          v-if="e.pickup.phone"
          :href="`tel:${e.pickup.phone}`"
          class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          ><PhoneIcon class="size-3" />{{ e.pickup.phone }}</a
        >
        <span v-if="e.pickup.note" class="text-xs text-muted-foreground">{{ e.pickup.note }}</span>
      </div>
      <p v-else class="mb-3 text-[13px]">A parent collects.</p>
      <p class="text-xs text-muted-foreground">
        Approved to collect:
        {{ e.collectors.map((c) => `${c.name} (${c.relationship})`).join(', ') || 'no one yet' }}
      </p>
    </SectionCard>
  </template>
</template>
