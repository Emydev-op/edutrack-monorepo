<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { CheckCheckIcon, StickyNoteIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useRollCallSheetQuery, useSaveRollCallMutation } from '@/api/services/boarding';
import { dateTimeOf, ROLL_MARKS, ROLL_SELECTED } from '@/components/boarding/boarding-format';
import { useTermContext } from '@/composables/useTermContext';
import { useUnsavedWork } from '@/composables/useUnsavedWork';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { useLayoutStore } from '@/stores/layout';
import type { RollCallBoarder, RollCallMark } from '@/types';

const route = useRoute();
const layout = useLayoutStore();
const { today } = useTermContext();
const hostelId = computed(() => String(route.params.hostelId ?? ''));
const slotQuery = useRouteQuery<string>('slot', '');
const dateQuery = useRouteQuery<string>('date', '');
const date = computed(() => dateQuery.value || today.value);

const {
  data: sheet,
  isPending,
  error,
  refetch,
} = useRollCallSheetQuery(hostelId, dateQuery, slotQuery);
const save = useSaveRollCallMutation();

watch(sheet, (s) => layout.setRecordLabel(s ? `${s.hostel.name} · ${s.slot}` : null), {
  immediate: true,
});

/** The marks and notes being edited, per student. */
const marks = reactive<Record<string, RollCallMark | null>>({});
const notes = reactive<Record<string, string>>({});
const noteOpen = reactive<Record<string, boolean>>({});
const fieldErrors = ref<Record<string, string>>({});
const serverError = ref('');
const locked = ref(false);

const isManual = (mark: RollCallBoarder['mark']): mark is RollCallMark =>
  mark === 'Present' || mark === 'Absent' || mark === 'Excused';

function fill() {
  for (const key of Object.keys(marks)) delete marks[key];
  for (const key of Object.keys(notes)) delete notes[key];
  for (const key of Object.keys(noteOpen)) delete noteOpen[key];
  for (const b of sheet.value?.boarders ?? []) {
    if (b.automatic) continue;
    marks[b.studentId] = isManual(b.mark) ? b.mark : null;
    notes[b.studentId] = b.note ?? '';
    noteOpen[b.studentId] = Boolean(b.note);
  }
  fieldErrors.value = {};
  serverError.value = '';
  locked.value = false;
}
watch(sheet, fill, { immediate: true });

const editable = computed(() => Boolean(sheet.value?.editable) && !locked.value);
const manual = computed(() => (sheet.value?.boarders ?? []).filter((b) => !b.automatic));

const dirty = computed(() =>
  manual.value.some(
    (b) =>
      (marks[b.studentId] ?? null) !== (isManual(b.mark) ? b.mark : null) ||
      (notes[b.studentId] ?? '') !== (b.note ?? ''),
  ),
);
useUnsavedWork(
  () => editable.value && dirty.value,
  () => (sheet.value ? `Roll call · ${sheet.value.hostel.name} ${sheet.value.slot}` : 'Roll call'),
);

const counts = computed(() => {
  const c = { Present: 0, Absent: 0, Excused: 0, 'On exeat': 0, 'Sick bay': 0, unmarked: 0 };
  for (const b of sheet.value?.boarders ?? []) {
    if (b.automatic) c[b.automatic]++;
    else {
      const m = marks[b.studentId];
      if (m) c[m]++;
      else c.unmarked++;
    }
  }
  return c;
});

interface RoomGroup {
  key: string;
  label: string;
  boarders: RollCallBoarder[];
}
/** Boarders grouped by floor and room, in API order. */
const rooms = computed<RoomGroup[]>(() => {
  const groups: RoomGroup[] = [];
  for (const b of sheet.value?.boarders ?? []) {
    const key = `${b.floor ?? ''}|${b.room ?? ''}`;
    let g = groups.find((x) => x.key === key);
    if (!g)
      groups.push(
        (g = {
          key,
          label: [b.floor, b.room].filter(Boolean).join(' · ') || 'No room',
          boarders: [],
        }),
      );
    g.boarders.push(b);
  }
  return groups;
});

const slotOptions = computed(() => (sheet.value?.slots ?? []).map((s) => ({ value: s, label: s })));
const slot = computed({
  get: () => sheet.value?.slot ?? slotQuery.value,
  set: (v: string) => (slotQuery.value = v),
});

function markAllPresent() {
  for (const b of manual.value) if (!marks[b.studentId]) marks[b.studentId] = 'Present';
}

function setMark(studentId: string, m: RollCallMark) {
  marks[studentId] = m;
  if (fieldErrors.value[studentId]) {
    const next = { ...fieldErrors.value };
    delete next[studentId];
    fieldErrors.value = next;
  }
}

async function submit() {
  const s = sheet.value;
  if (!s) return;
  serverError.value = '';
  const missing = manual.value.filter((b) => !marks[b.studentId]);
  if (missing.length) {
    fieldErrors.value = Object.fromEntries(missing.map((b) => [b.studentId, 'Mark this boarder.']));
    serverError.value = `${missing.length} boarder${missing.length === 1 ? '' : 's'} not marked yet.`;
    return;
  }
  const payload = manual.value.map((b) => ({
    studentId: b.studentId,
    mark: marks[b.studentId] as RollCallMark,
    note: notes[b.studentId]?.trim() || undefined,
  }));
  try {
    const saved = await save.mutateAsync({
      hostelId: s.hostel.id,
      date: s.date,
      slot: s.slot,
      marks: payload,
    });
    const absent = saved.boarders.filter((b) => b.mark === 'Absent').length;
    toast.success(`${saved.slot} roll call saved`, {
      description: absent
        ? `${absent} absent: their parents and house staff are alerted.`
        : 'Everyone is accounted for.',
    });
  } catch (e) {
    if (errorCodeOf(e) === 'ROLL_CALL_LOCKED') {
      // The read-only notice explains it.
      locked.value = true;
      return;
    }
    // `marks.<i>` → the boarder at that position in what we sent.
    const fields = fieldErrorsOf(e);
    const byStudent: Record<string, string> = {};
    for (const [key, msg] of Object.entries(fields)) {
      const i = /^marks\.(\d+)/.exec(key)?.[1];
      const row = i !== undefined ? payload[Number(i)] : undefined;
      if (row) byStudent[row.studentId] = msg;
    }
    fieldErrors.value = byStudent;
    serverError.value = fields.marks ?? getApiErrorMessage(e, 'The roll call couldn’t be saved.');
  }
}
</script>

<template>
  <PageHeader
    :title="sheet ? `${sheet.hostel.name} · ${sheet.slot}` : 'Roll call'"
    :description="
      sheet
        ? [formatWeekday(sheet.date || date), sheet.scope].filter(Boolean).join(' · ')
        : undefined
    "
  />

  <EmptyState
    v-if="error"
    title="This roll call couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="refetch()">Try again</Button>
  </EmptyState>
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-10 w-64" />
    <Skeleton v-for="i in 3" :key="i" class="h-40 w-full" />
  </div>
  <template v-else-if="sheet">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        v-if="slotOptions.length > 1"
        v-model="slot"
        :options="slotOptions"
        label="Roll call time"
      />
      <span class="text-[13px] text-muted-foreground">
        <template v-if="sheet.taken"
          >Taken{{ sheet.takenBy ? ` by ${sheet.takenBy}` : '' }}
          {{ dateTimeOf(sheet.takenAt) }}</template
        >
        <template v-else>Not taken yet</template>
      </span>
    </div>

    <InlineNotice
      v-if="!editable"
      tone="neutral"
      title="Read-only"
      :description="
        locked
          ? 'This roll call is locked: it can only be changed until the next day.'
          : 'This roll call can no longer be changed.'
      "
    />

    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <StatusBadge :label="`${counts.Present} present`" tone="success" />
      <StatusBadge :label="`${counts.Absent} absent`" tone="error" />
      <StatusBadge v-if="counts.Excused" :label="`${counts.Excused} excused`" tone="info" />
      <StatusBadge
        v-if="counts['On exeat']"
        :label="`${counts['On exeat']} on exeat`"
        tone="neutral"
      />
      <StatusBadge
        v-if="counts['Sick bay']"
        :label="`${counts['Sick bay']} in sick bay`"
        tone="warning"
      />
      <StatusBadge v-if="counts.unmarked" :label="`${counts.unmarked} not marked`" tone="neutral" />
      <Button
        v-if="editable && counts.unmarked"
        variant="outline"
        class="ml-auto h-10"
        @click="markAllPresent"
        ><CheckCheckIcon class="size-4" /> Mark all present</Button
      >
    </div>

    <p v-if="!sheet.boarders.length" class="text-[13px] text-faint">No boarders to mark.</p>

    <SectionCard v-for="room in rooms" :key="room.key" :title="room.label" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li
          v-for="b in room.boarders"
          :key="b.studentId"
          class="flex flex-col gap-2 px-4 py-3"
          :class="fieldErrors[b.studentId] && 'bg-error-subtle/40'"
        >
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span class="flex min-w-0 flex-col">
              <span class="text-[14px] font-medium">{{ b.name }}</span>
              <span class="text-xs text-muted-foreground"
                >{{ b.className }}{{ b.bed ? ` · Bed ${b.bed}` : '' }} · {{ b.admissionNo }}</span
              >
            </span>
            <StatusBadge
              v-if="b.automatic"
              :label="b.automatic"
              :tone="b.automatic === 'Sick bay' ? 'warning' : 'neutral'"
              class="h-9 px-3 text-[13px]"
            />
            <div
              v-else
              role="radiogroup"
              :aria-label="`${b.name}’s mark`"
              class="grid w-full grid-cols-3 gap-1.5 sm:w-auto"
            >
              <button
                v-for="m in ROLL_MARKS"
                :key="m"
                type="button"
                role="radio"
                :aria-checked="marks[b.studentId] === m"
                :disabled="!editable"
                :class="
                  cn(
                    'h-11 min-w-24 rounded-md border px-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
                    marks[b.studentId] === m
                      ? ROLL_SELECTED[m]
                      : 'bg-card text-muted-foreground hover:bg-muted',
                    fieldErrors[b.studentId] && marks[b.studentId] !== m && 'border-error',
                    !editable && marks[b.studentId] !== m && 'opacity-60',
                  )
                "
                @click="setMark(b.studentId, m)"
              >
                {{ m }}
              </button>
            </div>
          </div>
          <template v-if="!b.automatic">
            <Input
              v-if="noteOpen[b.studentId]"
              v-model="notes[b.studentId]"
              :disabled="!editable"
              :aria-label="`Note for ${b.name}`"
              placeholder="Note (e.g. at prep, allowed out by the house master)"
              class="h-9 text-[13px]"
            />
            <button
              v-else-if="editable"
              type="button"
              class="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              @click="noteOpen[b.studentId] = true"
            >
              <StickyNoteIcon class="size-3.5" /> Add note
            </button>
          </template>
          <p v-else-if="b.note" class="text-xs text-muted-foreground">{{ b.note }}</p>
          <p v-if="fieldErrors[b.studentId]" role="alert" class="text-xs text-error-strong">
            {{ fieldErrors[b.studentId] }}
          </p>
        </li>
      </ul>
    </SectionCard>

    <div
      v-if="editable && manual.length"
      class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
    >
      <span class="text-[13px] text-muted-foreground">
        <template v-if="serverError"
          ><span class="text-error-strong" role="alert">{{ serverError }}</span></template
        >
        <template v-else-if="counts.unmarked">{{ counts.unmarked }} not marked yet</template>
        <template v-else-if="dirty">Unsaved changes</template>
        <template v-else-if="sheet.taken">Saved</template>
        <template v-else>Ready to save</template>
      </span>
      <Button
        :disabled="save.isPending.value || (!dirty && sheet.taken)"
        class="h-11 px-6"
        @click="submit"
      >
        <Spinner v-if="save.isPending.value" />
        {{ sheet.taken ? 'Save changes' : 'Save roll call' }}
      </Button>
    </div>
    <p v-else-if="serverError" role="alert" class="text-[13px] text-error-strong">
      {{ serverError }}
    </p>
  </template>
</template>
