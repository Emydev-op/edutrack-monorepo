<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { TONE_CLASSES, type StatusTone } from '@edutrack/ui/lib/status';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useCalendarQuery,
  useDeleteEventMutation,
  useSaveEventMutation,
  useSectionsQuery,
  useSessionsQuery,
} from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { AcadEventType, CalendarEvent } from '@/types';

import { fmtDate, fmtRange, isIso, todayIso } from '../sessions/dates';

const TYPE_TONE: Record<AcadEventType, StatusTone> = {
  Term: 'brand',
  Break: 'warning',
  Exam: 'error',
  Holiday: 'neutral',
  Meeting: 'info',
  Event: 'success',
};
const TYPES = Object.keys(TYPE_TONE) as AcadEventType[];
const CUSTOM_TYPES: AcadEventType[] = ['Event', 'Meeting', 'Exam', 'Break', 'Holiday'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const confirm = useConfirm();
const context = useContextStore();
const { data, isPending } = useCalendarQuery();
const { data: sections } = useSectionsQuery();
const { data: sessions } = useSessionsQuery();
const saveEvent = useSaveEventMutation();
const deleteEvent = useDeleteEventMutation();

const today = todayIso();
const month = ref(''); // "YYYY-MM"
watch(
  data,
  (d) => {
    if (!d?.session || month.value) return;
    const anchor = today >= d.start && today <= d.end ? today : d.start;
    month.value = anchor.slice(0, 7);
  },
  { immediate: true },
);

const monthDate = computed(() => new Date(`${month.value}-01T00:00:00Z`));
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
const shift = (n: number) => {
  const d = new Date(monthDate.value);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const canPrev = computed(() => !!data.value && shift(-1) >= data.value.start.slice(0, 7));
const canNext = computed(() => !!data.value && shift(1) <= data.value.end.slice(0, 7));

const cells = computed(() => {
  if (!month.value) return [];
  const first = monthDate.value;
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const out: { iso: string; day: number; events: CalendarEvent[] }[] = [];
  for (let i = 0; i < lead; i++) out.push({ iso: '', day: 0, events: [] });
  for (let d = 1; d <= days; d++) {
    const iso = `${month.value}-${String(d).padStart(2, '0')}`;
    out.push({
      iso,
      day: d,
      events: (data.value?.events ?? []).filter((e) => iso >= e.start && iso <= e.end),
    });
  }
  while (out.length % 7) out.push({ iso: '', day: 0, events: [] });
  return out;
});

const upcoming = computed(() =>
  (data.value?.events ?? []).filter((e) => e.end >= today).slice(0, 8),
);
const monthEvents = computed(() =>
  (data.value?.events ?? []).filter(
    (e) => e.start.slice(0, 7) <= month.value && e.end.slice(0, 7) >= month.value,
  ),
);
const currentSessionId = computed(() => sessions.value?.currentId ?? null);

/* ---------- Drawer ---------- */

const AUDIENCES = computed(() => [
  'Everyone',
  'Staff',
  'Parents',
  'Students',
  ...(sections.value?.sections.map((s) => s.name) ?? []),
]);
const open = ref(false);
const viewing = ref<CalendarEvent | null>(null);
const editingId = ref<string | null>(null);
const form = reactive({
  title: '',
  type: 'Event' as AcadEventType,
  start: '',
  end: '',
  audience: 'Everyone',
  notes: '',
});
const initial = ref('');
const showErrors = ref(false);
const dirty = computed(
  () => open.value && !viewing.value && JSON.stringify(form) !== initial.value,
);

function openNew(date?: string) {
  const d =
    date ??
    (today >= (data.value?.start ?? '') && today <= (data.value?.end ?? '')
      ? today
      : data.value!.start);
  viewing.value = null;
  editingId.value = null;
  Object.assign(form, {
    title: '',
    type: 'Event',
    start: d,
    end: d,
    audience: 'Everyone',
    notes: '',
  });
  initial.value = JSON.stringify(form);
  showErrors.value = false;
  open.value = true;
}
function openEvent(e: CalendarEvent) {
  showErrors.value = false;
  if (e.source !== 'custom') {
    viewing.value = e;
    editingId.value = null;
  } else {
    viewing.value = null;
    editingId.value = e.id;
    Object.assign(form, {
      title: e.title,
      type: e.type,
      start: e.start,
      end: e.end,
      audience: e.audience,
      notes: e.notes,
    });
    initial.value = JSON.stringify(form);
  }
  open.value = true;
}

const errors = computed(() => {
  const d = data.value;
  const e = { title: '', start: '', end: '' };
  if (!form.title.trim()) e.title = 'Give the event a title.';
  if (!isIso(form.start)) e.start = 'Choose the start date.';
  if (!isIso(form.end)) e.end = 'Choose the end date.';
  else if (form.end < form.start) e.end = 'Ends before it starts.';
  else if (d && (form.start < d.start || form.end > d.end))
    e.end = `Must fall within ${d.session} (${fmtRange(d.start, d.end)}).`;
  return e;
});
const err = (k: keyof typeof errors.value) => (showErrors.value ? errors.value[k] : '');

async function submit() {
  showErrors.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  try {
    await saveEvent.mutateAsync({
      ...form,
      title: form.title.trim(),
      id: editingId.value ?? undefined,
    });
    toast.success(
      editingId.value ? 'Event updated.' : `${form.title.trim()} added to the calendar.`,
    );
    initial.value = JSON.stringify(form);
    open.value = false;
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}
function remove() {
  const id = editingId.value!;
  void confirm({
    title: `Delete ${form.title}?`,
    description: 'It is removed from the calendar for everyone.',
    confirmLabel: 'Delete event',
    tone: 'destructive',
    action: async () => {
      await deleteEvent.mutateAsync(id);
      initial.value = JSON.stringify(form);
      open.value = false;
      toast.success('Event deleted.');
    },
  });
}
const chip = (t: AcadEventType) =>
  cn(TONE_CLASSES[TYPE_TONE[t]].surface, TONE_CLASSES[TYPE_TONE[t]].text);
</script>

<template>
  <PageHeader
    title="Academic Calendar"
    :description="
      data?.session
        ? `${month ? monthLabel(month) : ''} · ${data.session} · ${context.current.branch}`
        : 'Term dates, breaks, exams and school events.'
    "
  >
    <template v-if="data?.session" #actions>
      <Button variant="outline" :disabled="!canPrev" @click="month = shift(-1)"
        ><ChevronLeftIcon class="size-4" />{{ monthLabel(shift(-1)).split(' ')[0] }}</Button
      >
      <Button variant="outline" :disabled="!canNext" @click="month = shift(1)"
        >{{ monthLabel(shift(1)).split(' ')[0] }}<ChevronRightIcon class="size-4"
      /></Button>
      <Button @click="openNew()">Add event</Button>
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-[520px]" />
  <EmptyState
    v-else-if="!data?.session"
    illustrated
    title="No session yet"
    description="The calendar follows your academic session. Create a session and its terms first."
  >
    <Button as-child
      ><RouterLink :to="{ name: routesPath.academics.sessionNew.name }"
        >Create session</RouterLink
      ></Button
    >
  </EmptyState>
  <div v-else class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <SectionCard flush>
      <div
        class="grid grid-cols-7 border-b bg-muted text-center text-xs font-medium text-muted-foreground"
      >
        <span v-for="d in DAYS" :key="d" class="py-2">{{ d }}</span>
      </div>
      <div class="grid grid-cols-7">
        <div
          v-for="(c, i) in cells"
          :key="i"
          :class="
            cn(
              'flex min-h-24 flex-col gap-1 border-r border-b border-divider p-1.5',
              !c.iso && 'bg-surface-warm',
              c.iso === today && 'ring-2 ring-primary ring-inset',
              i % 7 === 6 && 'border-r-0',
            )
          "
        >
          <template v-if="c.iso">
            <button
              type="button"
              :class="
                cn(
                  'flex size-6 items-center justify-center self-start rounded-full text-xs hover:bg-muted',
                  c.iso === today
                    ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary'
                    : i % 7 >= 5
                      ? 'text-faint'
                      : '',
                )
              "
              :aria-label="`Add an event on ${fmtDate(c.iso)}`"
              @click="openNew(c.iso)"
            >
              {{ c.day }}
            </button>
            <button
              v-for="e in c.events.slice(0, 3)"
              :key="e.id"
              type="button"
              :class="
                cn('truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium', chip(e.type))
              "
              :title="e.title"
              @click="openEvent(e)"
            >
              {{ e.title }}
            </button>
            <span v-if="c.events.length > 3" class="px-1 text-[11px] text-faint"
              >+{{ c.events.length - 3 }} more</span
            >
          </template>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 px-4 py-3 text-xs">
        <span v-for="t in TYPES" :key="t" class="flex items-center gap-1.5">
          <span :class="cn('size-2.5 rounded-sm', TONE_CLASSES[TYPE_TONE[t]].dot)" />{{ t }}
        </span>
      </div>
    </SectionCard>

    <div class="flex flex-col gap-4">
      <SectionCard title="Upcoming">
        <p v-if="!upcoming.length" class="text-[13px] text-faint">Nothing else this session.</p>
        <ul class="flex flex-col gap-2.5">
          <li v-for="e in upcoming" :key="e.id">
            <button
              type="button"
              class="flex w-full flex-col items-start text-left"
              @click="openEvent(e)"
            >
              <span class="text-[13px] font-medium hover:text-primary">{{ e.title }}</span>
              <span class="text-xs text-muted-foreground"
                >{{ fmtRange(e.start, e.end) }} · {{ e.type }}</span
              >
            </button>
          </li>
        </ul>
      </SectionCard>
      <SectionCard :title="`In ${month ? monthLabel(month) : 'this month'}`">
        <p class="text-[13px] text-body">
          {{ monthEvents.length }} item{{ monthEvents.length === 1 ? '' : 's' }} ·
          {{ monthEvents.filter((e) => e.source === 'custom').length }} school event{{
            monthEvents.filter((e) => e.source === 'custom').length === 1 ? '' : 's'
          }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          Term dates and breaks are set in
          <RouterLink
            v-if="currentSessionId"
            class="text-primary hover:underline"
            :to="{ name: routesPath.academics.terms.name, params: { id: currentSessionId } }"
            >Sessions & Terms</RouterLink
          ><span v-else>Sessions & Terms</span>. Public holidays are added automatically.
        </p>
      </SectionCard>
    </div>
  </div>

  <SideDrawer
    v-model:open="open"
    :title="viewing ? viewing.title : editingId ? 'Edit event' : 'Add event'"
    :description="
      viewing ? `${viewing.type} · ${fmtRange(viewing.start, viewing.end)}` : data?.session
    "
    :dirty="dirty"
  >
    <template v-if="viewing">
      <StatusBadge :label="viewing.type" :tone="TYPE_TONE[viewing.type]" class="self-start" />
      <p class="text-[13px] text-body">
        {{
          viewing.source === 'holiday'
            ? 'Public holiday. School is closed and lessons on this day are skipped.'
            : `Part of ${viewing.notes || 'the term calendar'}. Change it with the term’s dates and events.`
        }}
      </p>
    </template>
    <template v-else>
      <FieldShell id="ev-title" label="Title" required :error="err('title')">
        <Input id="ev-title" v-model="form.title" placeholder="e.g. Inter-house sports" />
      </FieldShell>
      <FieldShell id="ev-type" label="Type">
        <select
          id="ev-type"
          v-model="form.type"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option v-for="t in CUSTOM_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </FieldShell>
      <div class="grid gap-3 sm:grid-cols-2">
        <FieldShell id="ev-start" label="Starts" required :error="err('start')">
          <Input id="ev-start" v-model="form.start" type="date" />
        </FieldShell>
        <FieldShell id="ev-end" label="Ends" required :error="err('end')">
          <Input id="ev-end" v-model="form.end" type="date" />
        </FieldShell>
      </div>
      <FieldShell id="ev-aud" label="Audience">
        <select
          id="ev-aud"
          v-model="form.audience"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option v-for="a in AUDIENCES" :key="a">{{ a }}</option>
        </select>
      </FieldShell>
      <FieldShell id="ev-notes" label="Notes">
        <Textarea
          id="ev-notes"
          v-model="form.notes"
          rows="3"
          placeholder="Venue, timing or what to bring"
        />
      </FieldShell>
    </template>
    <template #footer>
      <template v-if="viewing">
        <Button v-if="viewing.source === 'term' && currentSessionId" as-child
          ><RouterLink
            :to="{ name: routesPath.academics.terms.name, params: { id: currentSessionId } }"
            >Edit in Sessions & Terms</RouterLink
          ></Button
        >
        <Button v-else variant="outline" @click="open = false">Close</Button>
      </template>
      <template v-else>
        <Button v-if="editingId" variant="ghost" class="mr-auto text-destructive" @click="remove"
          >Delete</Button
        >
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button :disabled="saveEvent.isPending.value" @click="submit">{{
          editingId ? 'Save changes' : 'Add event'
        }}</Button>
      </template>
    </template>
  </SideDrawer>
</template>
