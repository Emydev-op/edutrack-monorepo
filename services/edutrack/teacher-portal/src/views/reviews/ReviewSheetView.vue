<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { useMediaQuery } from '@vueuse/core';
import { computed, toRef, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useReviewSheetQuery, useSheetDecisionMutation } from '@/api/services/reviews';
import AccessDenied from '@/components/common/AccessDenied.vue';
import ScoreCards from '@/components/results/ScoreCards.vue';
import ScoreGrid from '@/components/results/ScoreGrid.vue';
import SheetReviewPanel from '@/components/results/SheetReviewPanel.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { useScoreEntry } from '@/components/results/useScoreEntry';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';
import { formatDateTime } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const layout = useLayoutStore();
const sheetId = computed(() => String(route.params.sheetId));
const { data: sheet, isPending, error, refetch } = useReviewSheetQuery(sheetId);
const decide = useSheetDecisionMutation(sheetId);
const isPhone = useMediaQuery('(max-width: 639px)');
const tab = useRouteQuery<'scores' | 'review'>('tab', 'scores');

// Read-only: the same grid and cards as the teacher's, never saving.
const entry = useScoreEntry(
  toRef(() => sheet.value),
  () => Promise.reject(new Error('Read-only')),
);

const title = computed(() =>
  sheet.value ? `${sheet.value.arm} · ${sheet.value.subjectName}` : '',
);
watch(title, (t) => layout.setRecordLabel(t || null), { immediate: true });

const flagged = computed(() => (sheet.value?.rows ?? []).filter((r) => r.flag || r.teacherRemark));
const tabs = computed(() => [
  { label: 'Scores', to: { query: { tab: undefined } }, active: tab.value === 'scores' },
  { label: 'Review', to: { query: { tab: 'review' } }, active: tab.value === 'review' },
]);
const teacherFirst = computed(() => sheet.value?.teacher ?? 'the teacher');

async function after(message: string) {
  toast.success(message);
  await router.push({ name: routesPath.reviews.results.name });
}

function forward() {
  const s = sheet.value!;
  void confirm({
    title: `Forward ${s.arm} · ${s.subjectName} to the academic office?`,
    details: [
      ['Teacher', s.teacher],
      ['Students', `${s.stats.count} · ${s.stats.complete} complete`],
      ['Class average', s.stats.average === null ? '—' : `${s.stats.average}%`],
      [
        'Flags',
        [s.stats.absent && `${s.stats.absent} absent`, s.stats.exempt && `${s.stats.exempt} exempt`]
          .filter(Boolean)
          .join(' · ') || 'None',
      ],
      ['Status', 'Under review, with the academic office'],
      ['Notifies', s.teacher],
    ],
    confirmLabel: 'Forward sheet',
    action: async () => {
      try {
        await decide.mutateAsync({ action: 'forward' });
      } catch (e) {
        void refetch();
        throw e;
      }
      await after(`Forwarded to the academic office. ${s.teacher} has been notified.`);
    },
  });
}

function returnSheet() {
  const s = sheet.value!;
  void confirm({
    title: `Return ${s.arm} · ${s.subjectName} to ${s.teacher}?`,
    details: [
      ['Status', 'Returned: the teacher can edit and resubmit it to you'],
      ['Notifies', s.teacher],
    ],
    input: {
      label: 'What should the teacher fix? (10 characters or more)',
      placeholder: 'e.g. Please check CA 2 for Blessing Etim against the script.',
      required: true,
    },
    confirmLabel: 'Return sheet',
    tone: 'destructive',
    action: async ({ text }) => {
      if (text.trim().length < 10)
        throw new Error('Tell the teacher what to fix (10 characters or more).');
      try {
        await decide.mutateAsync({ action: 'return', comment: text });
      } catch (e) {
        void refetch();
        throw e;
      }
      await after(`Returned to ${s.teacher} with your comment.`);
    },
  });
}
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-4">
    <Skeleton class="h-14 w-2/3" />
    <Skeleton class="h-96 w-full" />
  </div>
  <AccessDenied
    v-else-if="isForbidden(error)"
    what="that result sheet"
    :reason="getApiErrorMessage(error)"
  />
  <InlineNotice
    v-else-if="error"
    tone="error"
    :title="isNotFound(error) ? 'This sheet wasn’t found' : 'This sheet couldn’t load'"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.reviews.results.name }"
          >Back to reviews</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else-if="sheet">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-2xl leading-tight font-semibold">{{ title }}</h1>
          <SheetStatusBadge :status="sheet.status" :with-hod="sheet.withHod" />
        </div>
        <p class="text-[13px] text-muted-foreground">
          {{ sheet.teacher }} · {{ sheet.department }} · {{ sheet.branchName }} ·
          {{ sheet.students }} students
          <template v-if="sheet.submittedAt">
            · submitted {{ formatDateTime(sheet.submittedAt, false) }}</template
          >
        </p>
      </div>
      <div v-if="sheet.canDecide" class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="decide.isPending.value" @click="returnSheet"
          >Return to teacher</Button
        >
        <Button :disabled="decide.isPending.value" @click="forward"
          >Forward to academic office</Button
        >
      </div>
    </header>

    <InlineNotice
      v-if="sheet.canDecide"
      tone="info"
      title="Waiting for your review"
      :description="`Read-only. Check the totals and flags, then forward it to the academic office or return it to ${teacherFirst} with what to fix. Both notify them.`"
    />
    <InlineNotice
      v-else
      tone="neutral"
      title="No action needed"
      :description="sheet.decisionNote ?? ''"
    />

    <TabNav :tabs="tabs" label="Sheet sections" />
    <template v-if="tab === 'scores'">
      <ScoreCards v-if="isPhone" :entry="entry" />
      <ScoreGrid v-else :entry="entry" />
    </template>
    <template v-else>
      <SheetReviewPanel
        :stats="sheet.stats"
        :pass-mark="sheet.passMark"
        :scale-name="sheet.scaleName"
      />
      <section class="rounded-lg border bg-card">
        <h2 class="border-b border-divider px-4 py-3.5 text-[15px] font-semibold">
          Flags and remarks · {{ flagged.length }}
        </h2>
        <p v-if="!flagged.length" class="px-4 py-3.5 text-[13px] text-muted-foreground">
          No absent or exempt students and no remarks.
        </p>
        <ul v-else class="flex flex-col divide-y divide-divider">
          <li v-for="r in flagged" :key="r.studentId" class="flex flex-col px-4 py-2.5 text-[13px]">
            <span class="font-medium"
              >{{ r.name }}
              <span class="font-normal text-faint"
                >· total {{ r.total ?? '—' }} · {{ r.grade ?? '—' }}</span
              ></span
            >
            <span v-if="r.flag" class="text-xs text-info-strong">{{ r.flag }}</span>
            <span v-if="r.teacherRemark" class="text-xs text-muted-foreground"
              >Teacher’s remark: “{{ r.teacherRemark }}”</span
            >
          </li>
        </ul>
      </section>
    </template>
    <ActivityTimeline title="History" :items="sheet.history" />
  </template>
</template>
