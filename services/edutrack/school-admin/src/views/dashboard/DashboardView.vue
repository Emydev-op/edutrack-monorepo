<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import ColumnChart from '@edutrack/app-kit/components/common/ColumnChart.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MeterRow from '@edutrack/app-kit/components/common/MeterRow.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { formatCount, formatNairaMillions } from '@edutrack/app-kit/lib/format';

import { useDashboardFinanceQuery, useDashboardQuery } from '@/api/services/dashboard';
import { useSetupQuery } from '@/api/services/setup';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';

import AttentionCard from './components/AttentionCard.vue';
import EmptyBlock from './components/EmptyBlock.vue';
import FirstSteps from './components/FirstSteps.vue';
import QuickActionsCard from './components/QuickActionsCard.vue';
import UpcomingCard from './components/UpcomingCard.vue';

const auth = useAuthStore();
const context = useContextStore();
const dashboard = useDashboardQuery();
const finance = useDashboardFinanceQuery();
const { data: setup } = useSetupQuery();
const router = useRouter();
// A newly provisioned school is guided through the Setup Center until setup is finished.
watch(
  setup,
  (s) => s?.onboarding && !s.finished && router.replace({ name: routesPath.setup.name }),
  { immediate: true },
);

const summary = computed(() => dashboard.data.value);
const isNew = computed(() => summary.value?.hasData === false);

const greeting = computed(() => {
  const name = auth.user?.firstName ?? '';
  if (isNew.value) return `Welcome, ${name}`;
  const hour = new Date().getHours();
  return `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${name}`;
});
const today = new Date().toLocaleDateString('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const contextLine = computed(
  () => `${context.current.branch} · ${context.current.session} · ${context.current.term}`,
);

/** Setup progress, while setup is unfinished. */
const progress = computed(() => {
  const s = setup.value;
  if (!s || s.finished) return null;
  const done = s.steps.filter((x) => x.done).length;
  const left = s.steps.filter((x) => x.required && !x.done).map((x) => x.name);
  return { percent: Math.round((done / s.steps.length) * 100), left };
});

const weekly = computed(() => {
  const weeks = finance.data.value?.weekly ?? [];
  return weeks.map((w, i) => ({
    label: w.label,
    value: w.value,
    display: formatNairaMillions(w.value / 1_000_000),
    // The current week is still in progress, so it's drawn in amber.
    color: i === weeks.length - 1 ? 'var(--highlight)' : undefined,
  }));
});
const enrollment = computed(() =>
  (summary.value?.enrollment ?? []).map((e) => ({ ...e, display: formatCount(e.value) })),
);
</script>

<template>
  <PageHeader :title="greeting" :description="`${contextLine} · ${today}`">
    <template v-if="!isNew" #actions>
      <Button v-if="progress || setup?.finished" as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.setup.name }">{{
          setup?.finished ? 'Setup Center' : 'Open Setup Center'
        }}</RouterLink></Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.reports.name }">Reports</RouterLink></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="dashboard.isError.value"
    tone="error"
    title="We couldn’t load your dashboard"
    description="The connection to the server timed out. Your data is safe. Check your connection and try again; if it keeps happening, contact support."
    role="alert"
  >
    <template #action>
      <Button variant="outline" size="sm" @click="dashboard.refetch()">Try again</Button>
    </template>
  </InlineNotice>

  <template v-else>
    <InlineNotice
      v-if="isNew"
      tone="brand"
      :title="`${auth.school?.name} has no students, staff or classes yet`"
      description="Start with the Setup Center. It walks you through your session, classes, subjects and staff, and lets you import students from a spreadsheet."
    >
      <template #action>
        <Button as-child size="sm"
          ><RouterLink :to="{ name: routesPath.setup.name }">Open Setup Center</RouterLink></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-else-if="progress"
      tone="brand"
      :title="`Setup is ${progress.percent}% complete`"
      :description="
        progress.left.length
          ? `${progress.left.length} required step${progress.left.length > 1 ? 's' : ''} remain: ${progress.left.join(', ')}. Day-to-day work is not blocked.`
          : 'All required steps are done. Finish setup to hide this.'
      "
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.setup.name }">Continue setup</RouterLink></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="finance.isError.value"
      tone="warning"
      title="Finance figures couldn’t load"
      description="Students, academics and tasks are up to date. Fee collection charts will appear when the finance service responds. Nothing is lost."
    >
      <template #action>
        <Button variant="outline" size="sm" @click="finance.refetch()">Retry</Button>
      </template>
    </InlineNotice>

    <MetricGrid>
      <template v-if="summary">
        <MetricCard
          v-for="m in summary.metrics"
          :key="m.label"
          :label="m.label"
          :value="m.value"
          :hint="m.hint"
          :hint-tone="m.hintTone"
        />
      </template>
      <template v-else>
        <MetricCard v-for="i in 5" :key="i" label="" loading />
      </template>
    </MetricGrid>

    <FirstSteps v-if="isNew" />

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <AttentionCard :items="summary?.attention" />
      <div class="flex flex-col gap-4">
        <QuickActionsCard />
        <UpcomingCard :events="summary?.upcoming" />
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SectionCard
        title="Weekly fee receipts"
        description="Is collection picking up before term ends?"
      >
        <Skeleton v-if="finance.isPending.value" class="h-36" />
        <template v-else-if="weekly.length">
          <ColumnChart :bars="weekly" :height="110" label="Fee receipts per week" />
          <p class="mt-2 text-xs text-faint">Amber = current week, partial</p>
        </template>
        <EmptyBlock v-else-if="!finance.isError.value" text="No payments recorded yet." />
        <p v-else class="text-[13px] text-muted-foreground">Not available right now.</p>
      </SectionCard>

      <SectionCard
        title="Collection by section"
        description="Where is First Term collection behind 70%?"
      >
        <Skeleton v-if="finance.isPending.value" class="h-36" />
        <div v-else-if="finance.data.value?.sections.length" class="flex flex-col gap-2.5">
          <MeterRow
            v-for="s in finance.data.value.sections"
            :key="s.label"
            :label="s.label"
            :percent="s.percent"
            :value="`${s.percent}% · ${s.percent >= 70 ? 'on track' : 'behind'}`"
            :color="s.percent >= 70 ? 'var(--primary)' : 'var(--highlight)'"
            label-width="112px"
            value-width="104px"
          />
        </div>
        <EmptyBlock v-else-if="!finance.isError.value" text="No sections configured yet." />
        <p v-else class="text-[13px] text-muted-foreground">Not available right now.</p>
      </SectionCard>

      <SectionCard
        title="Enrollment trend"
        description="All branches, by session"
        class="md:col-span-2 xl:col-span-1"
      >
        <Skeleton v-if="!summary" class="h-36" />
        <ColumnChart
          v-else-if="enrollment.length"
          :bars="enrollment"
          :height="110"
          label="Students enrolled per session"
        />
        <EmptyBlock v-else text="No students enrolled yet." />
      </SectionCard>
    </div>

    <div class="grid items-start gap-4 lg:grid-cols-2">
      <SectionCard
        title="First Term performance by subject"
        description="Average of approved JSS result sheets"
      >
        <Skeleton v-if="!summary" class="h-40" />
        <div v-else-if="summary.performance.length" class="flex flex-col gap-2">
          <MeterRow
            v-for="p in summary.performance"
            :key="p.label"
            :label="p.label"
            :percent="p.percent"
            :value="`${p.percent}%`"
            color="var(--primary)"
            label-width="140px"
          />
        </div>
        <EmptyBlock v-else text="No results yet." />
      </SectionCard>
      <ActivityTimeline
        title="Recent activity"
        :items="summary?.activity ?? []"
        empty-text="No activity yet. Actions in your school will show here."
      />
    </div>
  </template>
</template>
