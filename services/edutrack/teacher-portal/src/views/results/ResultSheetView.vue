<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { useMediaQuery } from '@vueuse/core';
import { CircleAlertIcon, CloudCheckIcon, MessageSquareWarningIcon } from '@lucide/vue';
import { computed, toRef, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useResultSheetQuery,
  useSaveScoresMutation,
  useSubmitSheetMutation,
} from '@/api/services/results';
import AccessDenied from '@/components/common/AccessDenied.vue';
import ScoreCards from '@/components/results/ScoreCards.vue';
import ScoreGrid from '@/components/results/ScoreGrid.vue';
import SheetReviewPanel from '@/components/results/SheetReviewPanel.vue';
import SheetStatusBadge from '@/components/results/SheetStatusBadge.vue';
import { countdown, savedLabel } from '@/components/results/sheet-status';
import { useScoreEntry, type Blocker } from '@/components/results/useScoreEntry';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { getApiErrorMessage, isForbidden, isNotFound, statusOf } from '@/lib/api-errors';
import { formatDateTime, formatDeadline } from '@/lib/dates';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';
import type { SaveScoresPayload } from '@/types';

const route = useRoute();
const confirm = useConfirm();
const layout = useLayoutStore();
const ctx = useTermContext();
const sheetId = computed(() => String(route.params.sheetId));
const { data: sheet, isPending, error, refetch } = useResultSheetQuery(sheetId);
const saveMut = useSaveScoresMutation(sheetId);
const submitMut = useSubmitSheetMutation(sheetId);
const isPhone = useMediaQuery('(max-width: 639px)');

const tab = useRouteQuery<'scores' | 'review'>('tab', 'scores');
const focusStudent = computed(() => (route.query.student as string | undefined) ?? undefined);
const focusComponent = computed(() => (route.query.focus as string | undefined) ?? undefined);

async function save(payload: SaveScoresPayload) {
  try {
    return await saveMut.mutateAsync(payload);
  } catch (e) {
    // Locked meanwhile (deadline passed, sheet returned elsewhere): show the sheet as it is now.
    if (statusOf(e) === 409) void refetch();
    throw e;
  }
}
const entry = useScoreEntry(
  toRef(() => sheet.value),
  save,
);

const title = computed(() =>
  sheet.value ? `${sheet.value.arm} · ${sheet.value.subjectName}` : '',
);
watch(title, (t) => layout.setRecordLabel(t || null), { immediate: true });
useUnsavedWork(
  () => entry.dirty.value || entry.state.value === 'saving',
  () => `Score sheet · ${title.value}`,
);

const termLabel = computed(
  () => ctx.terms.value.find((t) => t.id === sheet.value?.termId)?.label ?? '',
);
const left = computed(() => countdown(sheet.value?.deadline ?? null, ctx.now.value));
const blockers = computed(() => entry.blockers.value);
const canSubmit = computed(
  () => entry.editable.value && blockers.value.length === 0 && entry.parsed.value.length > 0,
);
const lockTone = computed(() => {
  const s = sheet.value;
  if (!s?.lock) return 'neutral' as const;
  if (s.status === 'Published') return 'brand' as const;
  if (s.status === 'Approved') return 'success' as const;
  if (s.lock.code === 'TERM_LOCKED') return 'warning' as const;
  return 'info' as const;
});

const tabs = computed(() => [
  { label: 'Scores', to: { query: { tab: undefined } }, active: tab.value === 'scores' },
  {
    label: 'Review',
    to: { query: { tab: 'review' } },
    active: tab.value === 'review',
    count: entry.editable.value ? new Set(blockers.value.map((b) => b.studentId)).size : 0,
  },
]);
const fixTo = (b: Blocker) => ({ query: { tab: undefined, student: b.studentId, focus: b.focus } });

const saveText = computed(() => {
  if (entry.state.value === 'saving') return 'Saving…';
  if (entry.state.value === 'error') return 'Couldn’t save';
  if (entry.invalidCount.value)
    return `${entry.invalidCount.value} cell${entry.invalidCount.value === 1 ? '' : 's'} to fix · not saved`;
  if (entry.dirty.value) return 'Unsaved changes';
  return savedLabel(entry.savedAt.value, ctx.today.value);
});

async function saveNow() {
  if (await entry.flush()) {
    if (entry.invalidCount.value)
      toast.warning('Saved, except the cells that aren’t scores. Fix them to save those too.');
    else toast.success('Draft saved.');
  }
}

function submit() {
  const s = sheet.value!;
  const st = entry.stats.value;
  const absentNames = entry.parsed.value.filter((r) => r.values.includes('ABS')).map((r) => r.name);
  void confirm({
    title: `${s.status === 'Returned' ? 'Resubmit' : 'Submit'} ${s.arm} · ${s.subjectName}?`,
    description: s.submitToHod
      ? `It goes to ${s.submitTo} for review, then to the academic office.`
      : `It goes straight to ${s.submitTo}.`,
    details: [
      ['Students', String(st.count)],
      ['Complete', `${st.complete} of ${st.count}`],
      ['Absent', st.absent ? `${st.absent} (${absentNames.join(', ')}) · no total` : 'None'],
      ['Exempt', st.exempt ? `${st.exempt} · weights re-spread` : 'None'],
      ['Class average', st.average === null ? '—' : `${st.average}%`],
      ['Goes to', s.submitTo],
      ['Notifies', s.submitToHod ? s.submitTo.replace(/ \(.*\)$/, '') : 'The academic office'],
      ['After submitting', 'Locked after submitting unless returned'],
    ],
    confirmLabel: s.status === 'Returned' ? 'Resubmit sheet' : 'Submit sheet',
    action: async () => {
      if (!(await entry.flush())) throw new Error(entry.error.value);
      await submitMut.mutateAsync();
      toast.success(
        s.submitToHod ? `Submitted to ${s.submitTo}.` : 'Submitted to the academic office.',
      );
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
        ><RouterLink :to="{ name: routesPath.results.list.name }"
          >Back to results</RouterLink
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
          {{ termLabel }} · {{ sheet.branchName }} · {{ sheet.students }} students ·
          {{ sheet.scaleName }}
        </p>
      </div>
      <div v-if="entry.editable.value" class="flex flex-wrap items-center gap-2">
        <span
          class="flex items-center gap-1.5 text-xs"
          :class="
            entry.state.value === 'error' || entry.invalidCount.value
              ? 'text-error-strong'
              : 'text-muted-foreground'
          "
          role="status"
          aria-live="polite"
        >
          <Spinner v-if="entry.state.value === 'saving'" class="size-3.5" />
          <CircleAlertIcon v-else-if="entry.state.value === 'error'" class="size-3.5" />
          <CloudCheckIcon v-else-if="!entry.dirty.value && entry.savedAt.value" class="size-3.5" />
          {{ saveText }}
          <button
            v-if="entry.state.value === 'error'"
            type="button"
            class="font-medium text-primary underline-offset-2 hover:underline"
            @click="entry.flush()"
          >
            — retry
          </button>
        </span>
        <Button
          variant="outline"
          :disabled="entry.state.value === 'saving' || !entry.dirty.value"
          @click="saveNow"
          >Save</Button
        >
        <Button :disabled="!canSubmit || submitMut.isPending.value" @click="submit">
          {{ sheet.status === 'Returned' ? 'Resubmit' : 'Submit for review' }}
        </Button>
      </div>
      <Button v-else-if="sheet.canRequestCorrection" as-child variant="outline"
        ><RouterLink
          :to="{ name: routesPath.results.correctionNew.name, params: { sheetId: sheet.id } }"
          >Request a correction</RouterLink
        ></Button
      >
    </header>

    <div
      v-if="sheet.returned"
      role="alert"
      class="flex gap-3 rounded-md bg-error-subtle px-3.5 py-3 text-[13px]"
    >
      <MessageSquareWarningIcon class="mt-0.5 size-4 shrink-0 text-error-strong" />
      <div class="flex flex-col gap-1">
        <span class="font-semibold text-error-strong"
          >Returned by {{ sheet.returned.by }} ·
          {{ formatDateTime(sheet.returned.at, false) }}</span
        >
        <span class="text-body">“{{ sheet.returned.note }}”</span>
        <span class="text-xs text-muted-foreground"
          >Fix what’s asked, then resubmit. It goes back to {{ sheet.submitTo }}.</span
        >
      </div>
    </div>

    <InlineNotice
      v-if="sheet.lock"
      :tone="lockTone"
      :title="sheet.lock.title"
      :description="sheet.lock.reason"
    />
    <InlineNotice
      v-else-if="sheet.deadline && left"
      :tone="left.urgent ? 'warning' : 'neutral'"
      :title="`Result entry closes ${formatDeadline(sheet.deadline)} · ${left.label}`"
      :description="`Drafts become read-only after the deadline. Submitting sends it to ${sheet.submitTo}.`"
    />
    <p
      v-if="entry.state.value === 'error' && entry.error.value"
      role="alert"
      class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
    >
      {{ entry.error.value }}
    </p>

    <TabNav :tabs="tabs" label="Sheet sections" />

    <template v-if="tab === 'scores'">
      <p v-if="entry.editable.value" class="text-xs text-faint">
        Type a number, ABS (or A) for absent, or EXM (or E) for exempt. A blank is missing, not
        zero.
        <span class="max-sm:hidden">Enter or ↓ moves down; ↑ up; ← → move across.</span> Saves
        automatically.
      </p>
      <ScoreCards
        v-if="isPhone"
        :entry="entry"
        :focus-student="focusStudent"
        :focus-component="focusComponent"
      />
      <ScoreGrid
        v-else
        :entry="entry"
        :focus-student="focusStudent"
        :focus-component="focusComponent"
      />
    </template>

    <template v-else>
      <SheetReviewPanel
        :stats="entry.stats.value"
        :pass-mark="sheet.passMark"
        :scale-name="sheet.scaleName"
        :blockers="entry.editable.value ? blockers : undefined"
        :fix-to="fixTo"
      />
      <div
        v-if="entry.editable.value"
        class="flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-card px-4 py-3"
      >
        <span class="mr-auto text-[13px] text-muted-foreground">
          {{
            canSubmit
              ? `Ready. It goes to ${sheet.submitTo}. Locked after submitting unless returned.`
              : 'Fix every blocker above to submit.'
          }}
        </span>
        <Button :disabled="!canSubmit || submitMut.isPending.value" @click="submit">
          {{ sheet.status === 'Returned' ? 'Resubmit' : 'Submit for review' }}
        </Button>
      </div>
    </template>

    <SectionCard v-if="sheet.corrections.length" title="Correction requests" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li
          v-for="c in sheet.corrections"
          :key="c.id"
          class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"
        >
          <span
            >{{ c.student }} · {{ c.component }}: {{ c.original }} → {{ c.proposed }}
            <span class="text-faint">· {{ c.requestedAt }}</span></span
          >
          <span class="text-xs font-medium">{{ c.status }}</span>
        </li>
      </ul>
    </SectionCard>

    <ActivityTimeline title="History" :items="sheet.history" />
  </template>
</template>
