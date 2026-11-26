<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { initials } from '@edutrack/app-kit/lib/format';

import { useApplicationQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { ApplicationStage, TimelineEntry } from '@/types';

import { fmtDate, fmtDateTime } from './application-format';
import ApplicationStageDialog from './ApplicationStageDialog.vue';
import { tone } from './student-tones';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => route.params.id as string);
const { data: app, isPending, isError } = useApplicationQuery(id);

watch(app, (a) => layout.setRecordLabel(a ? `${a.applicant} · ${a.number}` : null), {
  immediate: true,
});

/** Button wording for each stage the application can move to, from where it is now. */
function actionLabel(target: ApplicationStage, from: ApplicationStage) {
  const closed = from === 'Rejected' || from === 'Declined';
  switch (target) {
    case 'Pending':
      return closed ? 'Reopen' : 'Back to pending';
    case 'Under review':
      return from === 'Pending' ? 'Start review' : closed ? 'Reopen for review' : 'Back to review';
    case 'Offer sent':
      return from === 'Offer sent' ? 'Resend offer' : 'Send offer';
    case 'Offer accepted':
      return 'Mark offer accepted';
    case 'Rejected':
      return 'Reject';
    case 'Declined':
      return 'Family declined';
    default:
      return target;
  }
}

/** Admitting goes through the wizard, so it isn't one of the stage buttons. */
const actions = computed(() =>
  (app.value?.next ?? [])
    .filter((s) => s !== 'Admitted')
    .map((s) => ({
      stage: s,
      label: actionLabel(s, app.value!.stage),
      variant: (s === 'Rejected' || s === 'Declined' ? 'ghost' : 'outline') as 'ghost' | 'outline',
    })),
);

const moving = ref<{ stage: ApplicationStage; label: string } | null>(null);
const dialogOpen = ref(false);
function openStage(a: { stage: ApplicationStage; label: string }) {
  moving.value = a;
  dialogOpen.value = true;
}

const history = computed<TimelineEntry[]>(() =>
  (app.value?.history ?? []).map((h, i) => ({
    id: `${i}-${h.at}`,
    title: h.title,
    detail: [h.detail, h.by].filter(Boolean).join(' · '),
    when: fmtDateTime(h.at),
  })),
);

const offerStatus = computed(() => {
  const a = app.value;
  if (!a?.offerSentOn) return null;
  if (a.stage === 'Offer sent') return a.offerExpired ? 'Expired' : 'Waiting for the family';
  if (a.stage === 'Offer accepted' || a.stage === 'Admitted') return 'Accepted';
  if (a.stage === 'Declined') return 'Declined';
  return 'Withdrawn';
});
</script>

<template>
  <template v-if="isPending"><Skeleton class="h-16 w-1/2" /><Skeleton class="h-80" /></template>

  <EmptyState
    v-else-if="isError || !app"
    illustrated
    title="This application doesn’t exist"
    description="The link may be wrong, or the application belongs to another school."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.admissions.name }"
        >Admissions</RouterLink
      ></Button
    >
  </EmptyState>

  <template v-else>
    <PageHeader
      :title="app.applicant"
      :initials="initials(app.applicant)"
      :description="`${app.number} · ${app.level} · ${app.branch} · applied ${app.applied}`"
    >
      <template #actions>
        <Button v-if="app.canEdit" as-child variant="ghost"
          ><RouterLink
            :to="{ name: routesPath.students.applicationEdit.name, params: { id: app.id } }"
            >Edit details</RouterLink
          ></Button
        >
        <Button
          v-for="a in actions"
          :key="a.stage"
          :variant="a.variant"
          @click="openStage({ stage: a.stage, label: a.label })"
          >{{ a.label }}</Button
        >
        <Button v-if="app.studentId" as-child variant="outline"
          ><RouterLink
            :to="{ name: routesPath.students.detail.name, params: { id: app.studentId } }"
            >View student</RouterLink
          ></Button
        >
        <Button v-if="app.canAdmit" as-child
          ><RouterLink
            :to="{ name: routesPath.students.admit.name, query: { application: app.id } }"
            >Admit</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <div class="flex flex-wrap items-center gap-2 text-[13px]">
      <StatusBadge :label="app.stage" :tone="tone(app.stage)" />
      <StatusBadge
        v-if="app.stage === 'Offer sent' && app.offerExpired"
        label="Offer expired"
        :tone="tone('Offer expired')"
      />
      <span v-if="app.stageNote" class="text-muted-foreground">{{ app.stageNote }}</span>
    </div>

    <InlineNotice
      v-if="app.stage === 'Offer sent' && app.offerExpired"
      tone="warning"
      title="The offer has expired"
      :description="`${app.guardianName || 'The family'} didn’t accept by ${fmtDate(app.offerExpiresOn)}. Send the offer again with a new date, or close the application.`"
    />
    <InlineNotice
      v-else-if="app.canAdmit"
      tone="info"
      title="Ready to admit"
      description="The family accepted the offer. Admitting creates the student record, enrollment and first invoice."
    />

    <div class="grid items-start gap-4 md:grid-cols-3">
      <KeyValueCard
        title="Applicant"
        :rows="[
          {
            label: 'Name',
            value: [app.surname, app.firstName, app.otherNames].filter(Boolean).join(' '),
          },
          { label: 'Gender', value: app.gender },
          { label: 'Date of birth', value: fmtDate(app.dateOfBirth) },
          { label: 'Previous school', value: app.previousSchool },
        ]"
      />
      <KeyValueCard
        title="Applying for"
        :rows="[
          { label: 'Session', value: app.session },
          { label: 'Branch', value: app.branch },
          { label: 'Class', value: app.level },
          { label: 'Type', value: app.type },
          ...(app.wantsBoarding ? [{ label: 'Boarding', value: 'Wants a boarding place' }] : []),
          { label: 'Applied', value: app.applied },
        ]"
      />
      <KeyValueCard
        title="Family contact"
        :rows="[
          { label: 'Parent / Guardian', value: app.guardianName },
          { label: 'Phone', value: app.guardianPhone },
          { label: 'Email', value: app.guardianEmail },
        ]"
      />
      <KeyValueCard
        title="Assessment"
        :rows="[
          { label: 'Date', value: fmtDate(app.assessmentOn) },
          { label: 'Result', value: app.assessmentResult },
        ]"
        :footer="
          !app.assessmentOn && !app.assessmentResult
            ? 'Recorded when the application goes under review.'
            : undefined
        "
      />
      <KeyValueCard
        title="Offer"
        :rows="[
          { label: 'Sent', value: fmtDate(app.offerSentOn) },
          {
            label: 'Accept by',
            value: fmtDate(app.offerExpiresOn),
            emphasis: app.stage === 'Offer sent' && app.offerExpired ? 'error' : undefined,
          },
          { label: 'Status', value: offerStatus },
        ]"
        :footer="!app.offerSentOn ? 'No offer sent yet.' : undefined"
      />
      <KeyValueCard title="Note" :rows="[{ label: 'Admissions note', value: app.note }]" />
    </div>

    <ActivityTimeline
      title="History"
      :items="history"
      empty-text="Nothing has happened on this application yet."
    />

    <ApplicationStageDialog
      v-if="moving"
      v-model:open="dialogOpen"
      :application="app"
      :stage="moving.stage"
      :label="moving.label"
    />
  </template>
</template>
