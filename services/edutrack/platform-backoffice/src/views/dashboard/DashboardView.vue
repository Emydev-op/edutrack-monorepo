<script setup lang="ts">
import { computed, ref } from 'vue';

import { useDashboardSummaryQuery } from '@/api/services/dashboard';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { formatCount } from '@edutrack/app-kit/lib/format';
import { routesPath } from '@/router/routes-path';
import InviteUserDrawer from '@/views/users/components/InviteUserDrawer.vue';

import NeedsAttention from './components/NeedsAttention.vue';
import OnboardingHealth from './components/OnboardingHealth.vue';
import QuickActions from './components/QuickActions.vue';
import RevenueCard from './components/RevenueCard.vue';
import SchoolGrowth from './components/SchoolGrowth.vue';
import SubscriptionHealth from './components/SubscriptionHealth.vue';

const { data: summary, isPending } = useDashboardSummaryQuery();
const inviteOpen = ref(false);

const schoolsBy = (status?: string) => ({
  name: routesPath.schools.list.name,
  query: status ? { status } : {},
});
const metrics = computed(() => {
  const t = summary.value?.totals;
  return [
    { label: 'Total schools', value: t?.schools, hint: 'All tenants', to: schoolsBy() },
    { label: 'Active', value: t?.active, hint: t?.activeShare, to: schoolsBy('Active') },
    {
      label: 'Onboarding',
      value: t?.onboarding,
      hint: `${t?.stalledOnboarding ?? 0} stalled > 30 days`,
      to: schoolsBy('Onboarding'),
    },
    {
      label: 'Suspended',
      value: t?.suspended,
      hint: 'Non-payment or request',
      to: schoolsBy('Suspended'),
    },
    { label: 'Expired', value: t?.expired, hint: 'Data kept 12 months', to: schoolsBy('Expired') },
    { label: 'Students', value: t && formatCount(t.students), hint: 'Across all schools' },
    { label: 'Teachers', value: t && formatCount(t.teachers), hint: 'With active accounts' },
    {
      label: 'Active branches',
      value: t?.activeBranches,
      hint: `Of ${t?.createdBranches ?? '—'} created`,
    },
  ];
});
const greeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
});
</script>

<template>
  <PageHeader
    :title="summary ? `${greeting}, ${summary.greetingName}` : greeting"
    :description="
      summary
        ? `Platform overview · all tenants · ${summary.generatedAt}`
        : 'Platform overview · all tenants'
    "
  />
  <MetricGrid>
    <MetricCard v-for="m in metrics" :key="m.label" v-bind="m" :loading="isPending" />
  </MetricGrid>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <RevenueCard
      ><template #aside><SubscriptionHealth /></template
    ></RevenueCard>
  </div>
  <QuickActions @invite="inviteOpen = true" />
  <NeedsAttention />
  <SchoolGrowth />
  <OnboardingHealth />
  <InviteUserDrawer v-model:open="inviteOpen" />
</template>
