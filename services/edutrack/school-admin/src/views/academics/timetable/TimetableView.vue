<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowRightIcon, XIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useCopyTimetableMutation,
  useSaveTimetableMutation,
  useSessionsQuery,
  useSuggestTimetableMutation,
  useTimetableActionMutation,
  useTimetableArmsQuery,
  useTimetableQuery,
} from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import { DAYS, type Day, type TimetableStatus } from '@/types';

interface Conflict {
  type: string;
  title: string;
  lines: string[];
  attempt: string;
  fix: string;
}

const context = useContextStore();
const confirm = useConfirm();
const r = routesPath.academics;

/* ---------------- Term and class pickers (kept in the URL) ---------------- */

const { data: sessions, isPending: sessionsPending } = useSessionsQuery();
const session = computed(() =>
  sessions.value?.sessions.find((s) => s.id === sessions.value?.currentId),
);
const terms = computed(() => session.value?.terms ?? []);
const termQuery = useRouteQuery<string>('term', '');
const termId = computed(
  () =>
    terms.value.find((t) => t.id === termQuery.value)?.id ??
    terms.value.find((t) => t.name === context.current.term)?.id ??
    terms.value.find((t) => t.status === 'Active')?.id ??
    terms.value[0]?.id ??
    '',
);
const term = computed(() => terms.value.find((t) => t.id === termId.value));
const previousTerm = computed(() => {
  const i = terms.value.findIndex((t) => t.id === termId.value);
  return i > 0 ? terms.value[i - 1] : undefined;
});

const { data: arms, isPending: armsPending } = useTimetableArmsQuery(
  termId,
  () => context.current.branch,
);
const armQuery = useRouteQuery<string>('arm', '');
const armId = computed(
  () => arms.value?.find((a) => a.id === armQuery.value)?.id ?? arms.value?.[0]?.id ?? '',
);
const multiBranch = computed(() => new Set(arms.value?.map((a) => a.branch)).size > 1);

const { data: view, isFetching } = useTimetableQuery(armId, termId);

/* ---------------- Local grid (optimistic) ---------------- */

const grid = ref<Record<string, string>>({});
watch(view, (v) => (grid.value = { ...v?.grid }), { immediate: true });
const pick = ref('');
const conflict = ref<Conflict | null>(null);
watch(armId, () => {
  pick.value = '';
  conflict.value = null;
});

const save = useSaveTimetableMutation();
const suggest = useSuggestTimetableMutation();
const copy = useCopyTimetableMutation();
const act = useTimetableActionMutation();

const status = computed<TimetableStatus>(() => view.value?.status ?? 'Draft');
const locked = computed(() => status.value === 'Published');
const lessons = computed(() => (view.value?.periods ?? []).filter((p) => !p.isBreak));
const palette = computed(() => view.value?.palette ?? []);
const have = computed(() => {
  const out: Record<string, number> = {};
  Object.values(grid.value).forEach((c) => (out[c] = (out[c] ?? 0) + 1));
  return out;
});
const remaining = computed(() =>
  palette.value.reduce((n, p) => n + Math.max(0, p.need - (have.value[p.code] ?? 0)), 0),
);
const totalNeed = computed(() => palette.value.reduce((n, p) => n + p.need, 0));
const slotsAvailable = computed(() => DAYS.length * lessons.value.length);
const subjectOf = (code: string) => palette.value.find((p) => p.code === code);
const picked = computed(() => (pick.value ? subjectOf(pick.value) : undefined));
const shortName = (name: string | null) =>
  (name ?? '').replace(/^(Mr|Mrs|Ms|Miss|Mme|Dr|Rev)\.\s/, '');
const periodOf = (id: string) => view.value?.periods.find((p) => p.id === id);
const when = (day: Day, pid: string) => {
  const p = periodOf(pid);
  return `${day} ${p?.start}–${p?.end}`;
};
const busyFor = (code: string, slot: string) => {
  const t = subjectOf(code)?.teacherId;
  return t ? view.value?.busy[t]?.[slot] : undefined;
};

/** Would placing `code` at day/period make a run longer than the rule allows? */
function tooManyInARow(day: Day, pid: string, code: string) {
  const ids = lessons.value.map((p) => p.id);
  const i = ids.indexOf(pid);
  let run = 1;
  for (let k = i - 1; k >= 0 && grid.value[`${day}-${ids[k]}`] === code; k--) run++;
  for (let k = i + 1; k < ids.length && grid.value[`${day}-${ids[k]}`] === code; k++) run++;
  return run > (view.value?.maxConsecutive ?? 2);
}

function conflictFor(day: Day, pid: string, code: string): Conflict | null {
  const slot = `${day}-${pid}`;
  const s = subjectOf(code)!;
  const arm = view.value!.arm;
  const at = when(day, pid);
  const existing = grid.value[slot];
  if (existing) {
    const e = subjectOf(existing);
    return {
      type: 'Class conflict',
      title: `${arm} already has ${e?.name ?? existing} at this time`,
      lines: [`${arm} · ${at} · ${e?.name ?? existing}${e?.teacher ? ` (${e.teacher})` : ''}`],
      attempt: `${s.name} · ${arm} · ${at}`,
      fix: 'Remove the existing lesson first, or pick an empty period.',
    };
  }
  const busy = busyFor(code, slot);
  if (busy)
    return {
      type: 'Teacher conflict',
      title: `${s.teacher} is already assigned`,
      lines: [`${busy} · ${at}`],
      attempt: `${s.name} · ${arm} · ${at}`,
      fix: `Choose another period. Free periods for ${s.teacher} are highlighted.`,
    };
  if (tooManyInARow(day, pid, code))
    return {
      type: 'Rule',
      title: `More than ${view.value!.maxConsecutive} consecutive ${s.name} lessons`,
      lines: [`Max consecutive lessons is set to ${view.value!.maxConsecutive}`],
      attempt: at,
      fix: `Pick a period that is not next to two existing ${s.name} lessons.`,
    };
  return null;
}

async function persist(next: Record<string, string>) {
  const before = grid.value;
  grid.value = next;
  try {
    await save.mutateAsync({ armId: armId.value, termId: termId.value, grid: next });
  } catch (e) {
    grid.value = before;
    toast.error(getApiErrorMessage(e, 'We couldn’t save that change. Try again.'));
  }
}

function clickCell(day: Day, pid: string) {
  if (!view.value) return;
  if (locked.value)
    return void toast('Published timetables are locked. Start a revision to change it.');
  const slot = `${day}-${pid}`;
  if (!pick.value) {
    if (!grid.value[slot]) return;
    const next = { ...grid.value };
    delete next[slot];
    conflict.value = null;
    return void persist(next);
  }
  const c = conflictFor(day, pid, pick.value);
  if (c) return void (conflict.value = c);
  const code = pick.value;
  conflict.value = null;
  if ((have.value[code] ?? 0) + 1 >= (subjectOf(code)?.need ?? 0)) pick.value = '';
  void persist({ ...grid.value, [slot]: code });
}

function choose(code: string) {
  if (locked.value)
    return void toast('Published timetables are locked. Start a revision to change it.');
  const p = subjectOf(code)!;
  if ((have.value[code] ?? 0) >= p.need) return;
  pick.value = pick.value === code ? '' : code;
  conflict.value = null;
}

type CellState = 'lesson' | 'free' | 'busy' | 'empty';
function cellState(day: Day, pid: string): CellState {
  const slot = `${day}-${pid}`;
  if (grid.value[slot]) return 'lesson';
  if (!pick.value) return 'empty';
  return busyFor(pick.value, slot) || tooManyInARow(day, pid, pick.value) ? 'busy' : 'free';
}

/* ---------------- Toolbar actions ---------------- */

async function runSuggest() {
  conflict.value = null;
  try {
    const before = Object.keys(grid.value).length;
    const res = await suggest.mutateAsync({
      armId: armId.value,
      termId: termId.value,
      grid: grid.value,
    });
    const placed = Object.keys(res.grid).length - before;
    toast.success(
      placed
        ? `Placed ${placed} lesson${placed > 1 ? 's' : ''} in free periods with no clashes.`
        : 'No more lessons could be placed without a clash.',
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Suggestions failed. Try again.'));
  }
}

function resetDraft() {
  void confirm({
    title: `Reset the ${view.value!.arm} draft?`,
    description: 'Every lesson in this draft is removed. Published versions are not affected.',
    confirmLabel: 'Reset draft',
    tone: 'destructive',
    action: async () => {
      pick.value = '';
      conflict.value = null;
      await save.mutateAsync({ armId: armId.value, termId: termId.value, grid: {} });
      toast.success('Draft cleared.');
    },
  });
}

function copyPrevious() {
  const from = previousTerm.value!;
  void confirm({
    title: `Copy the ${from.name} timetable into ${term.value!.name}?`,
    details: [
      ['Class', view.value!.arm],
      ['Result', 'A new draft you can edit. Nothing is published.'],
    ],
    confirmLabel: 'Copy timetable',
    action: async () => {
      await copy.mutateAsync({ armId: armId.value, termId: termId.value, fromTermId: from.id });
      toast.success(`Copied from ${from.name}.`);
    },
  });
}

async function review() {
  try {
    await act.mutateAsync({ action: 'review', armId: armId.value, termId: termId.value });
    toast.success(`${view.value!.arm} marked as reviewed. Publish it when you’re ready.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'We couldn’t mark it as reviewed.'));
  }
}

const fmt = (iso?: string) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

function publish() {
  const v = view.value!;
  const today = new Date().toISOString().slice(0, 10);
  const effective = term.value && term.value.start > today ? term.value.start : today;
  void confirm({
    title: `Publish ${v.arm} timetable for ${v.term}?`,
    details: [
      ['Version', `v${v.version} · ${v.term} ${session.value?.name ?? ''}`],
      ['Effective', fmt(effective)],
      [
        'Notifies',
        `Students and guardians of ${v.arm} · ${new Set(v.palette.map((p) => p.teacherId).filter(Boolean)).size} teachers`,
      ],
      ...(v.publishedVersion
        ? ([['Replaces', `v${v.publishedVersion}`]] as [string, string][])
        : []),
      ['Reversible', 'You can publish a revision. Each version is kept.'],
    ],
    confirmLabel: 'Publish timetable',
    action: async () => {
      await act.mutateAsync({ action: 'publish', armId: armId.value, termId: termId.value });
      toast.success(`${v.arm} timetable v${v.version} published.`);
    },
  });
}

function revise() {
  void confirm({
    title: `Start a revision of ${view.value!.arm}?`,
    description: `v${view.value!.version} stays in effect until you publish the revision.`,
    confirmLabel: 'Start revision',
    action: async () => {
      await act.mutateAsync({ action: 'revise', armId: armId.value, termId: termId.value });
      toast.success('Revision started as a draft.');
    },
  });
}

const STATES: TimetableStatus[] = ['Draft', 'Reviewed', 'Published'];
const stateIndex = computed(() => STATES.indexOf(status.value));
const noTeacher = computed(() => palette.value.filter((p) => !p.teacherId));
const anyPublished = computed(() => (arms.value ?? []).some((a) => a.status === 'Published'));
const busyNow = computed(
  () => !!(save.isPending.value || suggest.isPending.value || act.isPending.value),
);
</script>

<template>
  <PageHeader
    title="Timetable builder"
    :description="
      view
        ? `${view.arm} · ${view.term} · ${session?.name ?? ''} · ${context.current.branch} · ${lessons.length} periods per day, ${view.periods.length - lessons.length} breaks`
        : 'Periods and lessons for each class, per term.'
    "
  >
    <template v-if="view && !locked" #actions>
      <Button
        v-if="!Object.keys(grid).length && previousTerm"
        variant="outline"
        :disabled="busyNow"
        @click="copyPrevious"
        >Copy from {{ previousTerm.name }}</Button
      >
      <Button variant="outline" :disabled="busyNow || !remaining" @click="runSuggest"
        >Smart suggestions</Button
      >
      <Button variant="outline" :disabled="busyNow || !Object.keys(grid).length" @click="resetDraft"
        >Reset draft</Button
      >
    </template>
  </PageHeader>

  <SetupStepBar
    step="timetable"
    :details="[
      [
        'Published',
        `${(arms ?? []).filter((a) => a.status === 'Published').length} of ${(arms ?? []).length} classes this term`,
      ],
    ]"
    :blocked="anyPublished ? '' : 'Publish at least one class timetable first.'"
  />

  <Skeleton v-if="sessionsPending || armsPending" class="h-96" />
  <EmptyState
    v-else-if="!session || !terms.length"
    title="No session yet"
    description="Create the academic session and its terms before building timetables."
  >
    <Button as-child
      ><RouterLink :to="{ name: r.sessions.name }">Go to Sessions & Terms</RouterLink></Button
    >
  </EmptyState>
  <EmptyState
    v-else-if="!arms?.length"
    title="No classes yet"
    description="Add class levels and arms, then assign teachers, before building timetables."
  >
    <Button as-child
      ><RouterLink :to="{ name: r.classes.name }">Go to Classes & Arms</RouterLink></Button
    >
  </EmptyState>

  <template v-else>
    <SectionCard>
      <div class="flex flex-wrap items-end gap-4">
        <FieldShell id="tt-term" label="Term">
          <select
            id="tt-term"
            :value="termId"
            class="h-9 min-w-40 rounded-md border bg-card px-2.5 text-sm"
            @change="termQuery = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="t in terms" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </FieldShell>
        <FieldShell id="tt-arm" label="Class">
          <select
            id="tt-arm"
            :value="armId"
            class="h-9 min-w-56 rounded-md border bg-card px-2.5 text-sm"
            @change="armQuery = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="a in arms" :key="a.id" :value="a.id">
              {{ a.name }}{{ multiBranch ? ` · ${a.branch}` : '' }} · {{ a.status }}
            </option>
          </select>
        </FieldShell>
        <div v-if="view" class="ml-auto flex flex-col gap-1.5">
          <span class="text-[13px] font-medium">Status</span>
          <ol class="flex items-center gap-1.5" aria-label="Timetable workflow">
            <li v-for="(s, i) in STATES" :key="s" class="flex items-center gap-1.5">
              <span
                :class="
                  cn(
                    'rounded-full border px-2.5 py-1 text-xs',
                    i === stateIndex
                      ? 'border-transparent bg-brand-subtle font-semibold text-brand-strong'
                      : i < stateIndex
                        ? 'text-body'
                        : 'text-faint',
                  )
                "
                :aria-current="i === stateIndex ? 'step' : undefined"
                >{{ s }}</span
              >
              <ArrowRightIcon
                v-if="i < STATES.length - 1"
                class="size-3.5 text-faint"
                aria-hidden="true"
              />
            </li>
          </ol>
          <span class="text-xs text-muted-foreground"
            >Version {{ view.version
            }}{{
              view.publishedVersion && view.publishedVersion !== view.version
                ? ` · v${view.publishedVersion} in effect`
                : view.publishedVersion
                  ? ' · in effect'
                  : ''
            }}</span
          >
        </div>
      </div>
    </SectionCard>

    <Skeleton v-if="!view && isFetching" class="h-96" />
    <template v-else-if="view">
      <InlineNotice
        v-if="locked"
        tone="brand"
        :title="`Published · version ${view.version}`"
        description="Published timetables are locked. Start a revision to change it; this version stays in effect until the revision is published."
      >
        <template #action>
          <Button size="sm" variant="outline" :disabled="busyNow" @click="revise"
            >Start revision</Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-if="noTeacher.length"
        tone="warning"
        :title="`${noTeacher.map((p) => p.name).join(', ')} ${noTeacher.length > 1 ? 'have' : 'has'} no teacher`"
        description="You can place these lessons, but the timetable can’t be reviewed until a teacher is assigned."
      >
        <template #action>
          <Button as-child size="sm" variant="outline"
            ><RouterLink :to="{ name: r.assignments.name }">Assign teachers</RouterLink></Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-if="totalNeed > slotsAvailable"
        tone="warning"
        title="More lessons than periods"
        :description="`${view.arm} needs ${totalNeed} lessons a week but has ${slotsAvailable} periods. Reduce lessons per week in Subjects & Curriculum.`"
      />

      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div class="flex min-w-0 flex-col gap-3">
          <div
            v-if="conflict"
            role="alert"
            class="flex flex-col gap-2 rounded-lg border border-error/40 bg-error-subtle px-4 py-3 text-[13px]"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="flex flex-col gap-0.5">
                <span class="text-xs font-semibold tracking-[0.04em] text-error-strong uppercase">{{
                  conflict.type
                }}</span>
                <span class="font-semibold">{{ conflict.title }}</span>
              </span>
              <Button variant="ghost" size="icon" aria-label="Dismiss" @click="conflict = null"
                ><XIcon class="size-4"
              /></Button>
            </div>
            <ul class="list-inside list-disc text-body">
              <li v-for="l in conflict.lines" :key="l">{{ l }}</li>
            </ul>
            <span class="text-muted-foreground">You tried: {{ conflict.attempt }}</span>
            <span class="font-medium">{{ conflict.fix }}</span>
          </div>
          <p v-else-if="picked" class="text-[13px] text-body" aria-live="polite">
            Placing <strong>{{ picked.name }}</strong
            >{{ picked.teacher ? ` · ${picked.teacher}` : '' }}. Click a highlighted period, or
            click the subject again to stop.
          </p>
          <p v-else class="text-[13px] text-muted-foreground">
            {{
              locked
                ? 'Read-only while published.'
                : 'Pick a subject on the right, then click a free period. Click a lesson to remove it.'
            }}
          </p>

          <div class="overflow-x-auto rounded-lg border bg-card">
            <table class="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr class="bg-muted text-xs text-muted-foreground">
                  <th class="w-24 px-2.5 py-2 text-left font-medium">Day</th>
                  <th
                    v-for="p in view.periods"
                    :key="p.id"
                    scope="col"
                    :class="cn('px-1.5 py-2 text-center font-medium', p.isBreak && 'w-14')"
                  >
                    <span class="block text-foreground">{{
                      p.isBreak ? p.label : `P${p.label}`
                    }}</span>
                    <span class="block text-[11px] font-normal">{{ p.start }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in DAYS" :key="day" class="border-t border-divider">
                  <th scope="row" class="px-2.5 py-1.5 text-left font-medium">{{ day }}</th>
                  <template v-for="p in view.periods" :key="p.id">
                    <td v-if="p.isBreak" class="bg-muted/60" aria-hidden="true" />
                    <td v-else class="p-1">
                      <button
                        type="button"
                        :class="
                          cn(
                            'flex h-14 w-full flex-col items-center justify-center rounded-md border px-1 text-center transition-colors',
                            cellState(day, p.id) === 'lesson' &&
                              'border-border bg-card hover:border-primary',
                            cellState(day, p.id) === 'free' &&
                              'border-success/50 border-dashed bg-success-subtle hover:border-success',
                            cellState(day, p.id) === 'busy' &&
                              'border-transparent bg-muted text-faint',
                            cellState(day, p.id) === 'empty' && 'border-dashed border-border',
                            locked && 'cursor-default',
                          )
                        "
                        :aria-label="`${day} period ${p.label}: ${grid[`${day}-${p.id}`] ? subjectOf(grid[`${day}-${p.id}`]!)?.name : 'free'}`"
                        @click="clickCell(day, p.id)"
                      >
                        <template v-if="grid[`${day}-${p.id}`]">
                          <span class="font-semibold">{{ grid[`${day}-${p.id}`] }}</span>
                          <span class="w-full truncate text-[11px] text-muted-foreground">{{
                            shortName(subjectOf(grid[`${day}-${p.id}`]!)?.teacher ?? null) ||
                            'No teacher'
                          }}</span>
                        </template>
                        <span v-else-if="cellState(day, p.id) === 'busy'" class="text-[11px]"
                          >Busy</span
                        >
                        <span
                          v-else-if="cellState(day, p.id) === 'free'"
                          class="text-[11px] text-success-strong"
                          >Free</span
                        >
                      </button>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <span class="text-[13px] text-body">
              {{
                remaining
                  ? `${remaining} lesson${remaining > 1 ? 's' : ''} still need a period.`
                  : 'Every lesson has a period.'
              }}
            </span>
            <div class="flex gap-2">
              <Button
                v-if="status === 'Draft'"
                :disabled="busyNow || !!remaining || !!noTeacher.length"
                :title="remaining ? `${remaining} lessons still need a period` : undefined"
                @click="review"
                >Mark as reviewed</Button
              >
              <Button v-if="status === 'Reviewed'" :disabled="busyNow" @click="publish"
                >Publish timetable</Button
              >
              <Button
                v-if="status === 'Published'"
                variant="outline"
                :disabled="busyNow"
                @click="revise"
                >Start revision</Button
              >
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <SectionCard
            title="Lessons to place"
            :description="`${totalNeed - remaining} of ${totalNeed} placed`"
          >
            <ul class="flex flex-col gap-1.5">
              <li v-for="p in palette" :key="p.code">
                <button
                  type="button"
                  :disabled="locked"
                  :aria-pressed="pick === p.code"
                  :class="
                    cn(
                      'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                      pick === p.code
                        ? 'border-primary bg-brand-subtle'
                        : (have[p.code] ?? 0) >= p.need
                          ? 'bg-muted text-faint'
                          : 'bg-card hover:border-primary',
                    )
                  "
                  @click="choose(p.code)"
                >
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-[13px] font-medium">{{ p.name }}</span>
                    <span
                      :class="
                        cn(
                          'truncate text-xs',
                          p.teacher ? 'text-muted-foreground' : 'text-warning-strong',
                        )
                      "
                      >{{ p.code }} · {{ p.teacher ?? 'No teacher' }}</span
                    >
                  </span>
                  <span class="shrink-0 text-xs tabular-nums"
                    >{{ have[p.code] ?? 0 }} of {{ p.need }}</span
                  >
                </button>
              </li>
            </ul>
          </SectionCard>
          <SectionCard title="Legend">
            <div class="flex flex-col gap-1.5 text-xs text-body">
              <span class="flex items-center gap-2"
                ><span
                  class="size-3 rounded-sm border border-dashed border-success bg-success-subtle"
                />Free for the picked teacher</span
              >
              <span class="flex items-center gap-2"
                ><span class="size-3 rounded-sm bg-muted" />Teacher busy elsewhere, or breaks the
                {{ view.maxConsecutive }}-in-a-row rule</span
              >
              <span class="flex items-center gap-2"
                ><StatusBadge :label="status" /> current state</span
              >
            </div>
          </SectionCard>
          <ActivityTimeline title="History" :items="view.history" empty-text="No versions yet." />
        </div>
      </div>
    </template>
  </template>
</template>
