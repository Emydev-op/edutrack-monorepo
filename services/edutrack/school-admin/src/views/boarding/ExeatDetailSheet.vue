<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useExeatQuery } from '@/api/services/boarding-house';
import { routesPath } from '@/router/routes-path';
import type { Exeat } from '@/types';

import { exeatBadge, studentPlace, whenLabel } from './house-format';
import { useExeatActions } from './use-exeat-actions';

/** One exeat in full: the boarder, dates, who collects, and its history from request to return. */
const props = defineProps<{ exeat: Exeat | null }>();
const open = defineModel<boolean>('open', { required: true });

const { data: fresh } = useExeatQuery(() => (open.value ? (props.exeat?.id ?? '') : ''));
const e = computed(() => (fresh.value?.id === props.exeat?.id ? fresh.value : props.exeat));
const actions = useExeatActions();

const badge = computed(() => (e.value ? exeatBadge(e.value) : null));
const rows = computed<[string, string][]>(() => {
  const x = e.value;
  if (!x) return [];
  const list: [string, string | null | undefined][] = [
    ['Class and room', studentPlace(x.student)],
    ['Campus', x.campus],
    ['Kind', x.kind],
    ['Reason', x.reason],
    ['Leaves', x.leaves],
    ['Back by', x.returns],
  ];
  return list.filter((r): r is [string, string] => !!r[1]);
});
const history = computed<[string, string][]>(() => {
  const x = e.value;
  if (!x) return [];
  const list: [string, string | null | undefined][] = [
    [
      'Requested by',
      x.requestedBy === 'Parent'
        ? `Parent${x.requestedByName ? ` · ${x.requestedByName}` : ''}`
        : `School${x.requestedByName ? ` · ${x.requestedByName}` : ''}`,
    ],
    [x.status === 'Declined' ? 'Declined by' : 'Decided by', x.decidedBy],
    [x.status === 'Declined' ? 'Reason' : 'Decision note', x.decisionNote],
    ['Signed out', x.signedOutAt ? whenLabel(x.signedOutAt) : null],
    ['Collected by', x.collectedBy],
    ['Signed back in', x.signedInAt ? whenLabel(x.signedInAt) : null],
  ];
  return list.filter((r): r is [string, string] => !!r[1]);
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="e ? `${e.student.name} · ${e.kind}` : 'Exeat'"
    :description="e ? `${e.student.admissionNo} · ${e.leaves} → ${e.returns}` : undefined"
  >
    <template v-if="e">
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge v-if="badge" :label="badge.label" :tone="badge.tone" />
        <span v-if="e.overdue" class="text-xs font-medium text-error-strong"
          >Not back yet — due {{ e.returns }}</span
        >
      </div>

      <dl class="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[13px]">
        <template v-for="[k, v] in rows" :key="k">
          <dt class="text-muted-foreground">{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>

      <section class="flex flex-col gap-2 rounded-md border p-3">
        <h3 class="text-[13px] font-semibold">Who collects</h3>
        <template v-if="e.pickup">
          <p class="text-[13px]">
            {{ e.pickup.name }}
            <span class="text-muted-foreground">({{ e.pickup.relationship }})</span>
          </p>
          <p class="text-[13px] tabular-nums">{{ e.pickup.phone }}</p>
          <p v-if="e.pickup.note" class="text-xs text-muted-foreground">{{ e.pickup.note }}</p>
        </template>
        <p v-else class="text-[13px]">A parent</p>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-[13px] font-semibold">History</h3>
        <dl class="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <template v-for="[k, v] in history" :key="k">
            <dt class="text-muted-foreground">{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </section>

      <Button as-child variant="link" class="self-start px-0">
        <RouterLink :to="{ name: routesPath.students.boarding.name, params: { id: e.student.id } }"
          >Open {{ e.student.name }}’s record</RouterLink
        >
      </Button>
    </template>

    <template v-if="e && ['Requested', 'Approved', 'Out'].includes(e.status)" #footer>
      <template v-if="e.status === 'Requested'">
        <Button variant="ghost" class="text-destructive" @click="actions.cancel(e)">Cancel</Button>
        <Button variant="outline" @click="actions.decline(e)">Decline</Button>
        <Button @click="actions.approve(e)">Approve</Button>
      </template>
      <Button
        v-else-if="e.status === 'Approved'"
        variant="outline"
        class="text-destructive"
        @click="actions.cancel(e)"
        >Cancel exeat</Button
      >
      <Button v-else @click="actions.signIn(e)">Sign back in</Button>
    </template>
  </SideDrawer>
</template>
