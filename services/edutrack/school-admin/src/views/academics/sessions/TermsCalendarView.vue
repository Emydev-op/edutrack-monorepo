<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, SparklesIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useCalendarQuery, useSaveTermsMutation, useSessionsQuery } from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import type { TermEvent, TermEventType, TermStatus } from '@/types';

import {
  daysBetween,
  EVENT_TYPES,
  evenTerms,
  fmtDate,
  fmtRange,
  isIso,
  suggestEvents,
} from './dates';

interface EventRow extends TermEvent {
  key: string;
}
interface TermRow {
  key: string;
  id?: string;
  name: string;
  start: string;
  end: string;
  status: TermStatus;
  events: EventRow[];
}

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const id = computed(() => String(route.params.id));
const fromSetup = computed(() => route.query.from === 'setup');
const { data, isPending } = useSessionsQuery();
const { data: calendar } = useCalendarQuery();
const save = useSaveTermsMutation(id);

const session = computed(() => data.value?.sessions.find((s) => s.id === id.value) ?? null);
const readOnly = computed(() => ['Closed', 'Archived'].includes(session.value?.status ?? ''));

const terms = ref<TermRow[]>([]);
const original = ref('');
const showErrors = ref(false);
let seq = 0;
const key = () => `k${++seq}`;
const snapshot = () =>
  JSON.stringify(
    terms.value.map((t) => [
      t.name,
      t.start,
      t.end,
      t.events.map((e) => [e.type, e.name, e.start, e.end]),
    ]),
  );

watch(
  session,
  (s) => {
    if (!s) return;
    terms.value = s.terms.map((t) => ({
      key: key(),
      id: t.id,
      name: t.name,
      start: t.start,
      end: t.end,
      status: t.status,
      events: t.events.map((e) => ({ ...e, key: key() })),
    }));
    original.value = snapshot();
  },
  { immediate: true },
);
const dirty = computed(() => !!session.value && snapshot() !== original.value);
useUnsavedChanges(dirty);

/* ---------- Validation (mirrors the server) ---------- */

function termErrors(t: TermRow) {
  const s = session.value!;
  const e = { name: '', start: '', end: '' };
  const name = t.name.trim();
  if (!name) e.name = 'Name the term.';
  else if (terms.value.some((x) => x !== t && x.name.trim().toLowerCase() === name.toLowerCase()))
    e.name = 'Term names must be different.';
  if (!isIso(t.start)) e.start = 'Choose the start date.';
  else if (t.start < s.start) e.start = `Starts before the session (${fmtDate(s.start)}).`;
  if (!isIso(t.end)) e.end = 'Choose the end date.';
  else if (t.end <= t.start) e.end = 'Ends before it starts.';
  else if (t.end > s.end) e.end = `Ends after the session (${fmtDate(s.end)}).`;
  else if (daysBetween(t.start, t.end) < 28) e.end = 'A term runs at least 4 weeks.';
  else {
    const other = terms.value.find(
      (x) => x !== t && isIso(x.start) && isIso(x.end) && t.start <= x.end && t.end >= x.start,
    );
    if (other) e.end = `Overlaps ${other.name || 'another term'}.`;
  }
  return e;
}
function eventError(t: TermRow, ev: EventRow) {
  if (!ev.name.trim()) return 'Name the event.';
  if (!isIso(ev.start) || !isIso(ev.end)) return 'Choose its dates.';
  if (ev.end < ev.start) return 'Ends before it starts.';
  if (isIso(t.start) && isIso(t.end) && (ev.start < t.start || ev.end > t.end))
    return `Must fall within ${t.name || 'the term'} (${fmtRange(t.start, t.end, false)}).`;
  return '';
}
const invalid = computed(
  () =>
    !terms.value.length ||
    terms.value.length > 4 ||
    terms.value.some(
      (t) => Object.values(termErrors(t)).some(Boolean) || t.events.some((e) => eventError(t, e)),
    ),
);
const tErr = (t: TermRow, k: 'name' | 'start' | 'end') =>
  showErrors.value ? termErrors(t)[k] : '';
const eErr = (t: TermRow, e: EventRow) => (showErrors.value ? eventError(t, e) : '');

/* ---------- Helpers ---------- */

const holidaysIn = (t: TermRow) =>
  calendar.value?.session === session.value?.name
    ? (calendar.value?.holidays ?? []).filter((h) => h.date >= t.start && h.date <= t.end)
    : [];

function addEvent(t: TermRow) {
  t.events.push({ key: key(), id: '', type: 'custom', name: '', start: t.start, end: t.start });
}
function onType(ev: EventRow, type: TermEventType) {
  const wasDefault = !ev.name || EVENT_TYPES.some((x) => x.label === ev.name);
  ev.type = type;
  if (wasDefault && type !== 'custom') ev.name = EVENT_TYPES.find((x) => x.value === type)!.label;
}
function suggest(t: TermRow) {
  const s = suggestEvents(t.start, t.end);
  if (!s.length) return toast.error(`Set ${t.name || 'the term'}’s dates first.`);
  const apply = () => {
    t.events = s.map((e) => ({ ...e, id: '', key: key() }));
    toast.success(
      `${s.length} events suggested for ${t.name}. Adjust the dates to match your school.`,
    );
  };
  if (!t.events.length) return apply();
  void confirm({
    title: `Replace ${t.name}’s events?`,
    description: 'Suggested events replace the ones you’ve added for this term.',
    confirmLabel: 'Replace events',
    action: apply,
  });
}
function fillEvenly() {
  const s = session.value!;
  const spread = evenTerms(s.start, s.end, terms.value.length);
  const apply = () => {
    terms.value.forEach((t, i) => {
      t.start = spread[i]!.start;
      t.end = spread[i]!.end;
      t.events = t.events.filter((e) => e.start >= t.start && e.end <= t.end);
    });
  };
  void confirm({
    title: 'Fill term dates evenly?',
    details: spread.map((d, i) => [
      terms.value[i]!.name || `Term ${i + 1}`,
      fmtRange(d.start, d.end),
    ]),
    description: 'Events that fall outside their new term dates are removed.',
    confirmLabel: 'Fill dates',
    action: apply,
  });
}
function addTerm() {
  terms.value.push({
    key: key(),
    name: `Term ${terms.value.length + 1}`,
    start: '',
    end: '',
    status: 'Upcoming',
    events: [],
  });
}
function removeTerm(i: number) {
  const t = terms.value[i]!;
  if (t.status !== 'Upcoming')
    return void toast.error(`${t.name} has started and can’t be removed.`);
  terms.value.splice(i, 1);
}

/* ---------- Timeline ---------- */

const timeline = computed(() => {
  const s = session.value;
  if (!s) return [];
  const total = daysBetween(s.start, s.end) || 1;
  const pos = (d: string) => Math.max(0, Math.min(100, (daysBetween(s.start, d) / total) * 100));
  return terms.value
    .filter((t) => isIso(t.start) && isIso(t.end) && t.end > t.start)
    .flatMap((t) => [
      {
        key: t.key,
        label: t.name,
        left: pos(t.start),
        width: pos(t.end) - pos(t.start),
        kind: 'term',
      },
      ...t.events
        .filter((e) => e.type === 'midterm' && isIso(e.start) && isIso(e.end))
        .map((e) => ({
          key: e.key,
          label: '',
          left: pos(e.start),
          width: Math.max(0.8, pos(e.end) - pos(e.start)),
          kind: 'break',
        })),
    ]);
});

async function submit() {
  showErrors.value = true;
  if (invalid.value) return void toast.error('Fix the highlighted dates first.');
  try {
    await save.mutateAsync(
      terms.value.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        start: t.start,
        end: t.end,
        events: t.events.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name.trim(),
          start: e.start,
          end: e.end,
        })),
      })),
    );
    original.value = snapshot();
    showErrors.value = false;
    toast.success(`Terms and calendar saved for ${session.value!.name}.`);
    if (fromSetup.value) await router.push({ name: routesPath.setup.name });
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-96" />
  <InlineNotice
    v-else-if="!session"
    tone="warning"
    title="Session not found"
    description="It may have been removed. Go back to Sessions & Terms."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.academics.sessions.name }"
          >Sessions & Terms</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <template v-else>
    <PageHeader
      :title="`Terms & calendar · ${session.name}`"
      :description="`${fmtRange(session.start, session.end)} · term dates, breaks, exams and key events.`"
      :status="session.status"
    >
      <template v-if="!readOnly" #actions>
        <Button variant="outline" :disabled="!terms.length" @click="fillEvenly"
          >Fill dates evenly</Button
        >
        <Button :disabled="save.isPending.value || (!dirty && !fromSetup)" @click="submit"
          >Save terms</Button
        >
      </template>
    </PageHeader>

    <SetupStepBar step="terms" auto />
    <InlineNotice
      v-if="readOnly"
      tone="neutral"
      :title="`${session.name} is ${session.status.toLowerCase()}`"
      description="Closed sessions are read-only."
    />

    <SectionCard v-if="timeline.length" title="Session at a glance">
      <div class="relative h-9 overflow-hidden rounded-md bg-muted" aria-hidden="true">
        <div
          v-for="b in timeline"
          :key="b.key"
          class="absolute top-0 flex h-full items-center overflow-hidden px-2 text-xs font-medium"
          :class="
            b.kind === 'term'
              ? 'border-x border-primary bg-brand-tint text-brand-strong'
              : 'z-10 bg-warning opacity-80'
          "
          :style="{ left: `${b.left}%`, width: `${b.width}%` }"
        >
          <span class="truncate">{{ b.label }}</span>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5"
          ><span class="size-2.5 rounded-sm bg-brand-tint ring-1 ring-primary" />Term</span
        >
        <span class="flex items-center gap-1.5"
          ><span class="size-2.5 rounded-sm bg-warning" />Mid-term break</span
        >
        <span>{{ fmtDate(session.start) }} – {{ fmtDate(session.end) }}</span>
      </div>
    </SectionCard>

    <SectionCard
      v-for="(t, i) in terms"
      :key="t.key"
      :title="t.name || `Term ${i + 1}`"
      :description="
        isIso(t.start) && isIso(t.end) && t.end > t.start
          ? `${fmtRange(t.start, t.end)} · ${Math.round(daysBetween(t.start, t.end) / 7)} weeks`
          : 'Set the dates'
      "
    >
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <StatusBadge :label="t.status" />
          <Button
            v-if="!readOnly && t.status === 'Upcoming' && terms.length > 1"
            variant="ghost"
            size="sm"
            @click="removeTerm(i)"
            ><Trash2Icon class="size-3.5" />Remove term</Button
          >
        </div>
        <fieldset :disabled="readOnly" class="grid gap-3 sm:grid-cols-3">
          <FieldShell :id="`t-name-${t.key}`" label="Name" required :error="tErr(t, 'name')">
            <Input :id="`t-name-${t.key}`" v-model="t.name" />
          </FieldShell>
          <FieldShell :id="`t-start-${t.key}`" label="Starts" required :error="tErr(t, 'start')">
            <Input :id="`t-start-${t.key}`" v-model="t.start" type="date" />
          </FieldShell>
          <FieldShell :id="`t-end-${t.key}`" label="Ends" required :error="tErr(t, 'end')">
            <Input :id="`t-end-${t.key}`" v-model="t.end" type="date" />
          </FieldShell>
        </fieldset>

        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[13px] font-semibold">Breaks and events</span>
            <span v-if="!readOnly" class="flex gap-2">
              <Button variant="outline" size="sm" @click="suggest(t)"
                ><SparklesIcon class="size-3.5" />Suggest events</Button
              >
              <Button variant="outline" size="sm" @click="addEvent(t)"
                ><PlusIcon class="size-3.5" />Add event</Button
              >
            </span>
          </div>
          <p v-if="!t.events.length" class="text-[13px] text-faint">
            No events yet. Suggest the usual ones (resumption, PTA, CA week, mid-term, exams) or add
            your own.
          </p>
          <fieldset
            v-for="ev in t.events"
            :key="ev.key"
            :disabled="readOnly"
            class="grid items-start gap-2 rounded-md border p-2.5 sm:grid-cols-[150px_minmax(0,1fr)_140px_140px_36px]"
          >
            <select
              :value="ev.type"
              aria-label="Event type"
              class="h-9 rounded-md border bg-card px-2.5 text-sm"
              @change="onType(ev, ($event.target as HTMLSelectElement).value as TermEventType)"
            >
              <option v-for="o in EVENT_TYPES" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <Input v-model="ev.name" aria-label="Event name" placeholder="Event name" />
            <Input v-model="ev.start" type="date" aria-label="Starts" />
            <Input v-model="ev.end" type="date" aria-label="Ends" />
            <Button
              variant="ghost"
              size="icon"
              :aria-label="`Remove ${ev.name || 'event'}`"
              @click="t.events.splice(t.events.indexOf(ev), 1)"
              ><Trash2Icon class="size-4"
            /></Button>
            <p v-if="eErr(t, ev)" role="alert" class="text-xs text-destructive sm:col-span-5">
              {{ eErr(t, ev) }}
            </p>
          </fieldset>
        </div>

        <div v-if="holidaysIn(t).length" class="rounded-md bg-muted px-3.5 py-2.5 text-[13px]">
          <span class="font-medium">Public holidays this term:</span>
          {{
            holidaysIn(t)
              .map((h) => `${h.name} (${fmtDate(h.date, { year: false })})`)
              .join(' · ')
          }}
        </div>
      </div>
    </SectionCard>

    <div v-if="!readOnly" class="flex flex-wrap justify-between gap-2">
      <Button variant="outline" :disabled="terms.length >= 4" @click="addTerm"
        ><PlusIcon class="size-3.5" />Add term</Button
      >
      <span class="flex gap-2">
        <Button as-child variant="ghost"
          ><RouterLink
            :to="{ name: fromSetup ? routesPath.setup.name : routesPath.academics.sessions.name }"
            >{{ fromSetup ? 'Back to Setup Center' : 'Back to Sessions & Terms' }}</RouterLink
          ></Button
        >
        <Button :disabled="save.isPending.value || (!dirty && !fromSetup)" @click="submit"
          >Save terms</Button
        >
      </span>
    </div>
  </template>
</template>
