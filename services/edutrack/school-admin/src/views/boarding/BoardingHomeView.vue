<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { formatCount } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery } from '@/api/services/boarding';
import { useBoardingDashboardQuery } from '@/api/services/boarding-house';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';

import { dayLabel } from './house-format';

/** Boarding at a glance: who is in, who is out, the sick bay, the gate and today’s roll calls. */
const { data: settings } = useBoardingSettingsQuery();
const { data: d, isPending, isError, refetch } = useBoardingDashboardQuery();
const b = routesPath.boarding;
const can = useCan();
const n = (v: number | undefined) => formatCount(v ?? 0);

const rollCallHint = computed(() => {
  const r = d.value?.rollCalls;
  if (!r) return '';
  if (!r.expected) return 'No roll calls set';
  return r.taken >= r.expected ? 'All taken' : `${r.expected - r.taken} still to take`;
});
</script>

<template>
  <PageHeader
    title="Boarding"
    :description="`${d?.session ? `${d.session} · ` : ''}The boarding house today.`"
  >
    <template #actions>
      <Button v-if="can('boarding.gate')" as-child variant="outline"
        ><RouterLink :to="{ name: b.gate.name }">Open the gate desk</RouterLink></Button
      >
      <Button as-child><RouterLink :to="{ name: b.rollCalls.name }">Roll calls</RouterLink></Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="settings && !settings.enabled"
    tone="warning"
    title="Boarding isn’t switched on"
    description="Choose which sections take boarders at each campus first."
  >
    <template v-if="can('boarding.manage')" #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: b.setup.name }">Go to Boarding set-up</RouterLink></Button
      >
    </template>
  </InlineNotice>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="The boarding overview couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <InlineNotice
    v-if="d?.exeats.overdue"
    tone="error"
    :title="`${d.exeats.overdue} ${d.exeats.overdue === 1 ? 'boarder is' : 'boarders are'} overdue from exeat`"
    description="Past their return time and not signed back in at the gate."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: b.exeats.name, query: { status: 'Overdue' } }"
          >See who</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>

  <SectionCard title="Boarders and places">
    <MetricGrid>
      <MetricCard
        label="Boarders"
        :value="n(d?.boarders)"
        :loading="isPending"
        :hint="d ? `${n(d.placed)} placed` : undefined"
        :to="{ name: b.boarders.name }"
      />
      <MetricCard
        label="On campus now"
        :value="n(d?.onCampus)"
        :loading="isPending"
        :hint="d ? `${n(d.exeats.out)} out on exeat` : undefined"
        :to="{ name: b.boarders.name }"
      />
      <MetricCard
        label="Needing a place"
        :value="n(d?.needingPlace)"
        :loading="isPending"
        :hint="d?.needingPlace ? 'Place them in a room' : 'Everyone has a room'"
        :hint-tone="d?.needingPlace ? 'warning' : 'success'"
        :to="{ name: b.boarders.name, query: { unplaced: '1' } }"
      />
      <MetricCard
        label="Free places"
        :value="n(d?.freePlaces)"
        :loading="isPending"
        :hint="d ? `of ${n(d.places)} places` : undefined"
        :to="{ name: b.hostels.name }"
      />
    </MetricGrid>
  </SectionCard>

  <SectionCard title="Exeats and the gate">
    <MetricGrid>
      <MetricCard
        label="Exeats requested"
        :value="n(d?.exeats.requested)"
        :loading="isPending"
        :hint="d?.exeats.requested ? 'Waiting for a decision' : 'Nothing to decide'"
        :hint-tone="d?.exeats.requested ? 'warning' : 'neutral'"
        :to="{ name: b.exeats.name, query: { status: 'Requested' } }"
      />
      <MetricCard
        label="Out on exeat"
        :value="n(d?.exeats.out)"
        :loading="isPending"
        :hint="d?.exeats.leavingSoon ? `${n(d.exeats.leavingSoon)} leaving soon` : undefined"
        :to="{ name: b.exeats.name, query: { status: 'Out' } }"
      />
      <MetricCard
        label="Overdue"
        :value="n(d?.exeats.overdue)"
        :loading="isPending"
        :hint="d?.exeats.overdue ? 'Not back on time' : 'Everyone back on time'"
        :hint-tone="d?.exeats.overdue ? 'error' : 'success'"
        :to="{ name: b.exeats.name, query: { status: 'Overdue' } }"
      />
      <MetricCard
        label="Visitors on site"
        :value="n(d?.visitorsOnSite)"
        :loading="isPending"
        hint="Logged in at the gate"
        :to="{ name: b.gate.name }"
      />
    </MetricGrid>
  </SectionCard>

  <SectionCard title="Today in the house">
    <MetricGrid>
      <MetricCard
        label="Roll calls taken"
        :value="d ? `${n(d.rollCalls.taken)} of ${n(d.rollCalls.expected)}` : ''"
        :loading="isPending"
        :hint="rollCallHint"
        :hint-tone="
          d && d.rollCalls.expected && d.rollCalls.taken < d.rollCalls.expected
            ? 'warning'
            : 'neutral'
        "
        :to="{ name: b.rollCalls.name }"
      />
      <MetricCard
        label="Absent at roll call"
        :value="n(d?.rollCalls.absentToday)"
        :loading="isPending"
        :hint="d?.rollCalls.absentToday ? 'Parents and house staff alerted' : 'Nobody missing'"
        :hint-tone="d?.rollCalls.absentToday ? 'error' : 'success'"
        :to="{ name: b.rollCalls.name }"
      />
      <MetricCard
        label="In the sick bay"
        :value="n(d?.sickBay)"
        :loading="isPending"
        :hint="d?.sickBay ? 'Admitted now' : 'Nobody admitted'"
        :hint-tone="d?.sickBay ? 'warning' : 'neutral'"
        :to="{ name: b.sickBay.name }"
      />
      <MetricCard
        label="Open incidents"
        :value="n(d?.incidentsOpen)"
        :loading="isPending"
        :hint="d?.incidentsOpen ? 'Waiting to be closed' : 'All closed'"
        :to="{ name: b.house.name, query: { tab: 'incidents' } }"
      />
      <MetricCard
        label="Next visiting day"
        :value="d?.nextVisitingDay ? dayLabel(d.nextVisitingDay.date) : 'None set'"
        :loading="isPending"
        :hint="
          d?.nextVisitingDay
            ? `${d.nextVisitingDay.startsAt} – ${d.nextVisitingDay.endsAt} · ${d.nextVisitingDay.campus}`
            : 'Add one so parents can plan'
        "
        :to="{ name: b.house.name }"
      />
    </MetricGrid>
  </SectionCard>
</template>
