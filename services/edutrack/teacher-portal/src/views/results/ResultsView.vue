<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useResultsQuery } from '@/api/services/results';
import { useMyScopeQuery } from '@/api/services/shell';
import SheetCompletion from '@/components/results/SheetCompletion.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { countdown, savedLabel } from '@/components/results/sheet-status';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatDeadline } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import type { CorrectionStatus, ResultSheetSummary } from '@/types';

const ctx = useTermContext();
const armFilter = useRouteQuery<string>('class', '');
const subjectFilter = useRouteQuery<string>('subject', '');
const { data, isPending, error } = useResultsQuery(() => ({
  class: armFilter.value || undefined,
  subject: subjectFilter.value || undefined,
}));
const { data: scope } = useMyScopeQuery();

const arms = computed(() => {
  const seen = new Map<string, string>();
  for (const a of scope.value?.assignments ?? [])
    seen.set(
      a.armId,
      scope.value?.multiCampus ? `${a.armName} (${a.branchName.split(' ')[0]})` : a.armName,
    );
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
});
const subjects = computed(() => {
  const seen = new Map<string, string>();
  for (const a of scope.value?.assignments ?? []) seen.set(a.subject, a.subjectName);
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
});
const multiCampus = computed(() => scope.value?.multiCampus ?? false);
const left = computed(() => countdown(data.value?.deadline ?? null, ctx.now.value));
const filtered = computed(() => Boolean(armFilter.value || subjectFilter.value));

const description = computed(() => {
  const d = data.value;
  if (!d?.deadline) return 'Your score sheets for the term.';
  if (!d.entryOpen && ctx.isActiveTerm.value)
    return `Result entry closed ${formatDeadline(d.deadline)}. Ask the academic office to reopen a sheet.`;
  if (!ctx.isActiveTerm.value) return 'Your score sheets for this term. Read-only.';
  return `Result entry closes ${formatDeadline(d.deadline)}${left.value ? ` · ${left.value.label}` : ''}.`;
});

function action(s: ResultSheetSummary) {
  if (!s.editable) return 'View';
  if (s.status === 'Returned') return 'Fix and resubmit';
  if (s.status === 'Not started') return 'Enter scores';
  return s.completion.missing ? 'Continue' : 'Review and submit';
}
const statusLine = (s: ResultSheetSummary) => {
  if (s.withLabel) return s.withLabel;
  if (s.status === 'Returned') return `Returned: “${s.returnNote}”`;
  if (s.status === 'Draft') return savedLabel(s.savedAt, ctx.today.value);
  return '';
};
const CORRECTION_TONES: Record<CorrectionStatus, 'info' | 'success' | 'error'> = {
  'Under review': 'info',
  Applied: 'success',
  Rejected: 'error',
};
</script>

<template>
  <PageHeader title="Results" :description="description" />

  <div class="flex flex-wrap items-center gap-2">
    <NativeSelect v-model="armFilter" aria-label="Class" class="min-w-40">
      <NativeSelectOption value="">All classes</NativeSelectOption>
      <NativeSelectOption v-for="a in arms" :key="a.value" :value="a.value">{{
        a.label
      }}</NativeSelectOption>
    </NativeSelect>
    <NativeSelect v-model="subjectFilter" aria-label="Subject" class="min-w-44">
      <NativeSelectOption value="">All subjects</NativeSelectOption>
      <NativeSelectOption v-for="s in subjects" :key="s.value" :value="s.value">{{
        s.label
      }}</NativeSelectOption>
    </NativeSelect>
    <Button
      v-if="filtered"
      variant="ghost"
      size="sm"
      @click="
        armFilter = '';
        subjectFilter = '';
      "
      >Clear</Button
    >
  </div>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Your sheets couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton v-for="i in 4" :key="i" class="h-20 w-full" />
  </div>
  <EmptyState
    v-else-if="!data?.sheets.length"
    :title="filtered ? 'No sheets match these filters' : 'No score sheets this term'"
    :description="
      filtered
        ? 'Try another class or subject.'
        : 'A sheet appears for each class and subject you teach. The academic office assigns classes.'
    "
  />
  <ul v-else class="flex flex-col gap-2">
    <li v-for="s in data.sheets" :key="s.id">
      <RouterLink
        :to="{ name: routesPath.results.sheet.name, params: { sheetId: s.id } }"
        class="grid grid-cols-[minmax(0,1.6fr)_minmax(140px,1fr)_150px] items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 hover:border-[#D9D5CD] hover:bg-surface-warm max-md:grid-cols-[minmax(0,1fr)_auto]"
      >
        <span class="flex min-w-0 flex-col gap-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ s.arm }} · {{ s.subjectName }}</span>
            <SheetStatusBadge :status="s.status" :with-hod="s.withHod" />
          </span>
          <span class="text-xs text-muted-foreground"
            >{{ multiCampus ? `${s.branchName} · ` : '' }}{{ s.students }} students<template
              v-if="s.average !== null"
            >
              · average {{ s.average }}%</template
            ></span
          >
          <span
            v-if="statusLine(s)"
            class="line-clamp-1 text-xs"
            :class="s.status === 'Returned' ? 'text-error-strong' : 'text-faint'"
            >{{ statusLine(s) }}</span
          >
        </span>
        <SheetCompletion :completion="s.completion" class="max-md:col-span-2 max-md:row-start-2" />
        <span
          class="flex items-center gap-1 text-[13px] justify-end font-medium whitespace-nowrap text-primary max-md:col-start-2 max-md:row-start-1"
          >{{ action(s) }} <ChevronRightIcon class="size-4"
        /></span>
      </RouterLink>
    </li>
  </ul>

  <SectionCard
    title="My correction requests"
    description="Changes to published scores. The academic office decides them; they show on the sheet’s history."
    flush
  >
    <Skeleton v-if="isPending" class="m-4 h-10" />
    <p v-else-if="!data?.corrections.length" class="px-4 py-3.5 text-[13px] text-muted-foreground">
      None for this term. To change a published score, open the published sheet and choose “Request
      a correction”.
    </p>
    <ul v-else class="flex flex-col divide-y divide-divider">
      <li
        v-for="c in data.corrections"
        :key="c.id"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]"
      >
        <span class="flex min-w-0 flex-col">
          <RouterLink
            :to="{ name: routesPath.results.sheet.name, params: { sheetId: c.sheetId } }"
            class="font-medium hover:underline"
            >{{ c.student }} · {{ c.arm }} {{ c.subjectName }}</RouterLink
          >
          <span class="text-xs text-muted-foreground"
            >{{ c.component }}: {{ c.original }} → {{ c.proposed }} · total {{ c.originalTotal }} →
            {{ c.proposedTotal }} · {{ c.requestedAt }}</span
          >
        </span>
        <StatusBadge :label="c.status" :tone="CORRECTION_TONES[c.status]" />
      </li>
    </ul>
  </SectionCard>
</template>
