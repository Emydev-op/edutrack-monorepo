<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteUpdate } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useRegisterQuery, useSaveRegisterMutation } from '@/api/services/class-teacher';
import MarkPicker from '@/components/class-teacher/MarkPicker.vue';
import AccessDenied from '@/components/common/AccessDenied.vue';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { fieldErrorsOf, getApiErrorMessage, isForbidden } from '@/lib/api-errors';
import { formatDateTime, formatWeekday, weekdayIndex } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { AttendanceMark, RegisterDay } from '@/types';

const confirm = useConfirm();
const ctx = useTermContext();
const dateQuery = useRouteQuery<string>('date', '');
const { data: day, isPending, isFetching, error, refetch } = useRegisterQuery(dateQuery);
const save = useSaveRegisterMutation();

/* ---------- Local marks ---------- */

type Draft = Record<string, { status: AttendanceMark | null; reason: string }>;
const marks = ref<Draft>({});
const loadedKey = ref('');
const fieldErrors = ref<Record<string, string>>({});
const serverError = ref('');

const fromServer = (d: RegisterDay): Draft =>
  Object.fromEntries(d.rows.map((x) => [x.studentId, { status: x.status, reason: x.reason }]));
const snapshot = computed(() => (day.value ? JSON.stringify(fromServer(day.value)) : '{}'));
const dirty = computed(() => Boolean(day.value) && JSON.stringify(marks.value) !== snapshot.value);

watch(
  day,
  (d) => {
    if (!d) return;
    const key = `${d.termId}|${d.date}|${d.updatedAt ?? d.takenAt ?? ''}`;
    if (key === loadedKey.value && dirty.value) return;
    loadedKey.value = key;
    marks.value = fromServer(d);
    fieldErrors.value = {};
    serverError.value = '';
  },
  { immediate: true },
);

const editable = computed(() => Boolean(day.value && !day.value.lock && day.value.rows.length));
const label = computed(() => (day.value ? `Register · ${day.value.arm}` : 'Register'));
useUnsavedWork(dirty, () => `${label.value} · ${formatWeekday(day.value?.date, { year: false })}`);

const counts = computed(() => {
  const c = { Present: 0, Absent: 0, Late: 0, Excused: 0, unmarked: 0 };
  for (const m of Object.values(marks.value)) {
    if (m.status) c[m.status]++;
    else c.unmarked++;
  }
  return c;
});
const absentees = computed(() =>
  (day.value?.rows ?? []).filter(
    (x) =>
      marks.value[x.studentId]?.status === 'Absent' &&
      !(x.status === 'Absent' && x.guardianNotified),
  ),
);

function setStatus(studentId: string, status: AttendanceMark | null) {
  const current = marks.value[studentId] ?? { status: null, reason: '' };
  marks.value = {
    ...marks.value,
    [studentId]: {
      status,
      reason: status === 'Present' || status === 'Late' ? '' : current.reason,
    },
  };
  if (fieldErrors.value[studentId])
    fieldErrors.value = Object.fromEntries(
      Object.entries(fieldErrors.value).filter(([k]) => k !== studentId),
    );
}
function setReason(studentId: string, reason: string) {
  marks.value = { ...marks.value, [studentId]: { ...marks.value[studentId]!, reason } };
}
function markAllPresent() {
  marks.value = Object.fromEntries(
    Object.entries(marks.value).map(([id, m]) => [
      id,
      m.status ? m : { status: 'Present' as const, reason: '' },
    ]),
  );
}

/* ---------- Saving ---------- */

function validate() {
  const errors: Record<string, string> = {};
  for (const [id, m] of Object.entries(marks.value)) {
    if (!m.status) errors[id] = 'Choose a mark.';
    else if (m.status === 'Excused' && m.reason.trim().length < 3)
      errors[id] = 'Give a reason for Excused.';
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function submit() {
  const d = day.value;
  if (!d || !editable.value) return;
  serverError.value = '';
  if (!validate()) {
    serverError.value = `${Object.keys(fieldErrors.value).length} student${Object.keys(fieldErrors.value).length === 1 ? ' needs' : 's need'} a mark or a reason.`;
    return;
  }
  const payload = Object.entries(marks.value).map(([studentId, m]) => ({
    studentId,
    status: m.status!,
    reason: m.reason.trim(),
  }));
  const run = async () => {
    try {
      const result = await save.mutateAsync({ date: d.date, marks: payload });
      toast.success(
        result.notified.length
          ? `Register saved. Guardians of ${result.notified.length} student${result.notified.length === 1 ? '' : 's'} notified.`
          : 'Register saved.',
      );
    } catch (e) {
      fieldErrors.value = fieldErrorsOf(e);
      serverError.value = getApiErrorMessage(e, 'The register wasn’t saved. Try again.');
      void refetch();
      throw e;
    }
  };
  const n = absentees.value.length;
  if (n) {
    await confirm({
      title: `Save the register for ${formatWeekday(d.date, { year: false })}?`,
      description: `Guardians of ${n} student${n === 1 ? '' : 's'} will be notified of the absence.`,
      details: [
        ['Class', d.arm],
        [
          'Marks',
          `${counts.value.Present} present · ${counts.value.Late} late · ${counts.value.Absent} absent · ${counts.value.Excused} excused`,
        ],
        ['Notifies', absentees.value.map((x) => `${x.name}’s guardian`).join(', ')],
      ],
      confirmLabel: 'Save and notify',
      action: run,
    });
  } else {
    await run().catch(() => undefined);
  }
}

/* ---------- Days ---------- */

const shownDate = computed(() => day.value?.date ?? dateQuery.value);
const isToday = computed(() => shownDate.value === day.value?.today);

const addDays = (iso: string, n: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
};
/** The weekday before / after, skipping weekends (the API explains holidays and breaks). */
function stepDay(from: string, dir: 1 | -1) {
  let d = addDays(from, dir);
  while ([0, 6].includes(weekdayIndex(d))) d = addDays(d, dir);
  return d;
}

async function goTo(date: string) {
  if (!date || date === shownDate.value) return;
  if (dirty.value) {
    const ok = await confirm({
      title: 'You have unsaved marks',
      description: 'They’ll be lost if you open another day.',
      confirmLabel: 'Discard marks',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
    if (!ok) return;
    if (day.value) marks.value = fromServer(day.value);
  }
  dateQuery.value = date === day.value?.today ? '' : date;
}
// Back / forward between days.
onBeforeRouteUpdate(async (to, from) => {
  if (to.query.date === from.query.date || !dirty.value) return true;
  return confirm({
    title: 'You have unsaved marks',
    description: 'They’ll be lost if you open another day.',
    confirmLabel: 'Discard marks',
    cancelLabel: 'Stay',
    tone: 'destructive',
  });
});

const quickDays = computed(() => (day.value?.editableDays ?? []).slice().reverse());
const canNext = computed(() => Boolean(day.value && shownDate.value < day.value.today));

const lockTone = computed(() =>
  day.value?.lock?.code === 'TOO_OLD' || day.value?.lock?.code === 'TERM_LOCKED'
    ? 'neutral'
    : 'info',
);
const lockTitle = computed(() => {
  switch (day.value?.lock?.code) {
    case 'NO_SCHOOL':
      return 'No school this day';
    case 'FUTURE':
      return 'This day hasn’t happened yet';
    case 'OUT_OF_TERM':
      return 'Outside the term';
    case 'TERM_LOCKED':
      return 'Read-only term';
    default:
      return 'Read-only';
  }
});
</script>

<template>
  <PageHeader
    :title="label"
    :description="
      day
        ? `${formatWeekday(day.date, { long: true })} · ${day.branchName} · ${day.rows.length || '—'} students`
        : 'Take today’s attendance for your class.'
    "
  />

  <AccessDenied v-if="isForbidden(error)" what="My class" :reason="getApiErrorMessage(error)" />
  <InlineNotice
    v-else-if="error && !day"
    tone="error"
    title="The register couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton class="h-10 w-full" />
    <Skeleton v-for="i in 6" :key="i" class="h-14 w-full" />
  </div>
  <template v-else-if="day">
    <!-- Day picker -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous school day"
          @click="goTo(stepDay(shownDate, -1))"
          ><ChevronLeftIcon class="size-4"
        /></Button>
        <Input
          type="date"
          aria-label="Register date"
          class="w-40 bg-card"
          :min="day.termStart"
          :max="day.termEnd < day.today ? day.termEnd : day.today"
          :model-value="shownDate"
          @update:model-value="(v) => goTo(String(v))"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Next school day"
          :disabled="!canNext"
          @click="goTo(stepDay(shownDate, 1))"
          ><ChevronRightIcon class="size-4"
        /></Button>
      </div>
      <Button
        v-if="!isToday && ctx.isActiveTerm.value"
        variant="ghost"
        size="sm"
        @click="goTo(day.today)"
        >Today</Button
      >
      <Spinner v-if="isFetching" class="size-4 text-muted-foreground" />
      <Button as-child variant="outline" size="sm" class="ml-auto"
        ><RouterLink :to="{ name: r.classTeacher.registerHistory.name }"
          ><HistoryIcon class="size-4" /> History</RouterLink
        ></Button
      >
    </div>
    <div
      v-if="quickDays.length"
      class="flex flex-wrap gap-1.5"
      aria-label="Days you can still change"
    >
      <button
        v-for="d in quickDays"
        :key="d"
        type="button"
        :class="
          cn(
            'h-8 rounded-full border px-3 text-xs whitespace-nowrap',
            d === shownDate
              ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
              : 'bg-card hover:bg-muted',
          )
        "
        @click="goTo(d)"
      >
        {{ d === day.today ? 'Today' : formatWeekday(d, { year: false }) }}
      </button>
    </div>

    <InlineNotice
      v-if="day.lock"
      :tone="lockTone"
      :title="lockTitle"
      :description="day.lock.reason"
    />
    <InlineNotice
      v-else-if="!day.taken"
      tone="warning"
      :title="isToday ? 'Today’s register isn’t taken yet' : 'This register wasn’t taken'"
      description="Mark everyone present, then tap the exceptions. Absences notify guardians when you save."
    />
    <p v-else class="text-[13px] text-muted-foreground">
      Taken by {{ day.takenBy }} {{ formatDateTime(day.takenAt, false)
      }}<template v-if="day.updatedAt">
        · updated {{ formatDateTime(day.updatedAt, false) }}</template
      >
    </p>

    <EmptyState
      v-if="
        !day.rows.length &&
        day.lock?.code !== 'NO_SCHOOL' &&
        day.lock?.code !== 'FUTURE' &&
        day.lock?.code !== 'OUT_OF_TERM'
      "
      title="No students in this class on that day"
    />

    <template v-if="day.rows.length">
      <!-- Counts bar -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-1.5 text-xs" aria-live="polite">
          <StatusBadge :label="`${counts.Present} present`" tone="success" />
          <StatusBadge :label="`${counts.Absent} absent`" tone="error" />
          <StatusBadge :label="`${counts.Late} late`" tone="warning" />
          <StatusBadge :label="`${counts.Excused} excused`" tone="info" />
          <StatusBadge
            v-if="counts.unmarked"
            :label="`${counts.unmarked} not marked`"
            tone="neutral"
          />
        </div>
        <Button
          v-if="editable && counts.unmarked"
          variant="outline"
          size="sm"
          @click="markAllPresent"
          >Mark all present</Button
        >
      </div>

      <ul class="flex flex-col divide-y divide-divider rounded-lg border bg-card">
        <li
          v-for="row in day.rows"
          :key="row.studentId"
          class="flex flex-col gap-2 px-3 py-2.5 sm:px-4"
          :class="fieldErrors[row.studentId] && 'bg-error-subtle/40'"
        >
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div class="flex min-w-0 flex-col">
              <span class="truncate font-medium">{{ row.name }}</span>
              <span class="text-xs text-faint"
                >{{ row.admissionNo
                }}<template v-if="row.guardianNotified"> · guardian notified</template></span
              >
            </div>
            <MarkPicker
              :model-value="marks[row.studentId]?.status ?? null"
              :label="`Mark for ${row.name}`"
              :disabled="!editable"
              :invalid="Boolean(fieldErrors[row.studentId])"
              class="w-full sm:w-[340px]"
              @update:model-value="(v) => setStatus(row.studentId, v)"
            />
          </div>
          <div
            v-if="
              marks[row.studentId]?.status === 'Excused' ||
              marks[row.studentId]?.status === 'Absent'
            "
            class="flex flex-col gap-1"
          >
            <Input
              :model-value="marks[row.studentId]?.reason ?? ''"
              :aria-label="
                marks[row.studentId]?.status === 'Excused'
                  ? `Reason ${row.name} is excused`
                  : `Note about ${row.name}’s absence`
              "
              :placeholder="
                marks[row.studentId]?.status === 'Excused'
                  ? 'Reason (required), e.g. Hospital appointment'
                  : 'Note (optional), e.g. Guardian called: unwell'
              "
              :disabled="!editable"
              :aria-invalid="Boolean(fieldErrors[row.studentId])"
              class="h-10 bg-card text-[13px]"
              maxlength="200"
              @update:model-value="(v) => setReason(row.studentId, String(v))"
            />
          </div>
          <p v-if="fieldErrors[row.studentId]" role="alert" class="text-xs text-destructive">
            {{ fieldErrors[row.studentId] }}
          </p>
        </li>
      </ul>

      <!-- Sticky save bar -->
      <div
        v-if="editable"
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
      >
        <span class="text-[13px] text-muted-foreground">
          <template v-if="serverError"
            ><span class="text-destructive" role="alert">{{ serverError }}</span></template
          >
          <template v-else-if="counts.unmarked">{{ counts.unmarked }} not marked yet</template>
          <template v-else-if="dirty">Unsaved changes</template>
          <template v-else-if="day.taken">Saved</template>
          <template v-else>Ready to save</template>
        </span>
        <Button
          :disabled="save.isPending.value || (!dirty && day.taken)"
          class="h-10 px-6"
          @click="submit"
        >
          <Spinner v-if="save.isPending.value" />
          {{ day.taken ? 'Save changes' : 'Save register' }}
        </Button>
      </div>
    </template>

    <ActivityTimeline v-if="day.history.length" title="This day’s history" :items="day.history" />
  </template>
</template>
