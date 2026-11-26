<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useBoardingDashboardQuery } from '@/api/services/boarding';
import { useMeQuery } from '@/api/services/shell';
import { meets } from '@/config/navigation';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const { data: me } = useMeQuery();
const { data: d, isPending, error, refetch } = useBoardingDashboardQuery();
const loading = computed(() => isPending.value);

const can = (what: Parameters<typeof meets>[1]) => meets(me.value, what);

const greeting = computed(() => {
  const user = auth.user;
  return user ? `Boarding · ${user.title} ${user.lastName}`.trim() : 'Boarding';
});

const rollCallHint = computed(() => {
  const rc = d.value?.rollCalls;
  if (!rc) return undefined;
  if (!rc.expected) return 'No roll calls set for today';
  return rc.taken === rc.expected ? 'All taken' : `${rc.expected - rc.taken} still to take`;
});

const visitingDay = computed(() => {
  const v = d.value?.nextVisitingDay;
  if (!v) return null;
  return `${formatWeekday(v.date)}, ${v.startsAt}–${v.endsAt}${v.campus ? ` · ${v.campus}` : ''}`;
});

/** Shortcuts for what this staff member does. */
const actions = computed(() =>
  [
    { label: 'Take roll call', to: r.boarding.rollCalls.name, show: can('rollcall') },
    { label: 'Exeats', to: r.boarding.exeats.name, show: can('exeats') },
    { label: 'Gate', to: r.boarding.gate.name, show: can('gate') },
    { label: 'Sick bay', to: r.boarding.sickBay.name, show: can('health') },
    { label: 'My hostel', to: r.boarding.myHostel.name, show: can('houseStaff') },
  ].filter((a) => a.show),
);
</script>

<template>
  <PageHeader
    :title="greeting"
    :description="
      d?.session
        ? `${d.session}. Boarders in the hostels you look after.`
        : 'Boarders in the hostels you look after.'
    "
  />

  <div v-if="actions.length" class="flex flex-wrap gap-2">
    <Button v-for="a in actions" :key="a.to" as-child variant="outline" class="h-10"
      ><RouterLink :to="{ name: a.to }">{{ a.label }}</RouterLink></Button
    >
  </div>

  <EmptyState
    v-if="error"
    title="Boarding couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>

  <template v-else>
    <MetricGrid>
      <MetricCard
        label="Boarders"
        :value="d?.boarders"
        :hint="d ? `${d.onCampus} on campus` : undefined"
        :loading="loading"
        :to="can('houseStaff') ? { name: r.boarding.myHostel.name } : undefined"
      />
      <MetricCard
        label="Exeat requests"
        :value="d?.exeats.requested"
        :hint="d?.exeats.requested ? 'Waiting for a decision' : 'None waiting'"
        :hint-tone="d?.exeats.requested ? 'warning' : 'success'"
        :loading="loading"
        :to="
          can('exeats')
            ? { name: r.boarding.exeats.name, query: { status: 'Requested' } }
            : undefined
        "
      />
      <MetricCard
        label="Out on exeat"
        :value="d?.exeats.out"
        :hint="
          d?.exeats.overdue
            ? `${d.exeats.overdue} overdue`
            : d
              ? `${d.exeats.leavingSoon} leaving soon`
              : undefined
        "
        :hint-tone="d?.exeats.overdue ? 'error' : 'neutral'"
        :loading="loading"
        :to="
          can('gate')
            ? { name: r.boarding.gate.name }
            : can('exeats')
              ? { name: r.boarding.exeats.name, query: { status: 'Out' } }
              : undefined
        "
      />
      <MetricCard
        label="Roll calls today"
        :value="d ? `${d.rollCalls.taken} / ${d.rollCalls.expected}` : undefined"
        :hint="rollCallHint"
        :hint-tone="
          d && d.rollCalls.taken < d.rollCalls.expected ? 'warning' : d ? 'success' : undefined
        "
        :loading="loading"
        :to="can('rollcall') ? { name: r.boarding.rollCalls.name } : undefined"
      />
      <MetricCard
        label="Absent at roll call"
        :value="d?.rollCalls.absentToday"
        hint="Today"
        :hint-tone="d?.rollCalls.absentToday ? 'error' : 'neutral'"
        :loading="loading"
      />
      <MetricCard
        label="In sick bay"
        :value="d?.sickBay"
        :loading="loading"
        :to="can('health') ? { name: r.boarding.sickBay.name } : undefined"
      />
      <MetricCard
        label="Visitors on site"
        :value="d?.visitorsOnSite"
        :loading="loading"
        :to="can('gate') ? { name: r.boarding.gate.name, query: { tab: 'visitors' } } : undefined"
      />
      <MetricCard
        label="Open incidents"
        :value="d?.incidentsOpen"
        :hint-tone="d?.incidentsOpen ? 'warning' : 'neutral'"
        :loading="loading"
        :to="can('rollcall') ? { name: r.boarding.incidents.name } : undefined"
      />
    </MetricGrid>

    <SectionCard v-if="d" title="Places">
      <dl class="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt class="text-xs text-muted-foreground">Places</dt>
          <dd class="font-medium tabular-nums">{{ d.places }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">Placed</dt>
          <dd class="font-medium tabular-nums">{{ d.placed }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">Free places</dt>
          <dd class="font-medium tabular-nums">{{ d.freePlaces }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted-foreground">Needing a place</dt>
          <dd
            class="font-medium tabular-nums"
            :class="d.needingPlace ? 'text-warning-strong' : undefined"
          >
            {{ d.needingPlace }}
          </dd>
        </div>
      </dl>
    </SectionCard>

    <SectionCard v-if="d" title="Next visiting day">
      <p class="text-[13px]">
        <template v-if="visitingDay">
          <span class="font-medium">{{ visitingDay }}</span>
          <span v-if="d.nextVisitingDay?.note" class="text-muted-foreground">
            · {{ d.nextVisitingDay.note }}</span
          >
        </template>
        <span v-else class="text-faint"
          >None scheduled. The head of boarding sets visiting days.</span
        >
      </p>
    </SectionCard>
  </template>
</template>
