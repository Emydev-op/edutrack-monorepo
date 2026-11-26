<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import {
  getApiErrorCode,
  getApiErrorFields,
  getApiErrorMessage,
  messageOf,
} from '@edutrack/web-core/http';
import { CheckCheckIcon, LockIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useRollCallSheetQuery, useSaveRollCallMutation } from '@/api/services/boarding-house';
import { useLayoutStore } from '@/stores/layout';
import type { RollCallBoarder, RollCallMark, RollCallPayload } from '@/types';

import { dayLabel, lagosToday, timeLabel } from './house-format';

/**
 * One roll call: every boarder in the hostel (or the floor master’s floor), grouped by floor and
 * room, marked Present, Absent or Excused. Boarders on exeat or in the sick bay are marked
 * automatically. Absences alert parents and house staff.
 */
const route = useRoute();
const layoutStore = useLayoutStore();
const hostelId = computed(() => String(route.params.hostelId ?? ''));
const today = lagosToday();
const date = useRouteQuery<string>('date', today);
const slotQuery = useRouteQuery<string>('slot', '');

const {
  data: sheet,
  isPending,
  isError,
  error,
  refetch,
} = useRollCallSheetQuery(hostelId, () => ({
  date: date.value,
  slot: slotQuery.value || undefined,
}));
const save = useSaveRollCallMutation();

watch(sheet, (s) => layoutStore.setRecordLabel(s ? `${s.hostel.name} · ${s.slot}` : null), {
  immediate: true,
});

const slot = computed({
  get: () => slotQuery.value || sheet.value?.slot || '',
  set: (v: string) => (slotQuery.value = v),
});
const slotOptions = computed(() => (sheet.value?.slots ?? []).map((s) => ({ value: s, label: s })));

/* Marks being edited, by student. */
interface Draft {
  mark: RollCallMark | '';
  note: string;
}
const drafts = ref<Record<string, Draft>>({});
const saved = ref('');
const rowErrors = ref<Record<string, string>>({});
const formError = ref('');
const locked = ref(false);
const showMissing = ref(false);

const snapshot = () => JSON.stringify(drafts.value);
function reset() {
  const s = sheet.value;
  if (!s) return;
  drafts.value = Object.fromEntries(
    s.boarders
      .filter((b) => !b.automatic)
      .map((b) => [
        b.studentId,
        {
          mark: (b.mark === 'Present' || b.mark === 'Absent' || b.mark === 'Excused'
            ? b.mark
            : '') as Draft['mark'],
          note: b.note ?? '',
        },
      ]),
  );
  saved.value = snapshot();
  rowErrors.value = {};
  formError.value = '';
  locked.value = false;
  showMissing.value = false;
}
// A new sheet (hostel, day or slot), or a saved one, replaces the edits.
watch(
  () =>
    sheet.value
      ? [sheet.value.hostel.id, sheet.value.date, sheet.value.slot, sheet.value.takenAt].join('|')
      : '',
  reset,
  { immediate: true },
);
const dirty = computed(() => !!sheet.value && snapshot() !== saved.value);
useUnsavedChanges(dirty);

const editable = computed(() => !!sheet.value?.editable && !locked.value);

/* Grouped by floor, then room. */
const groups = computed(() => {
  const out: { floor: string; rooms: { room: string; boarders: RollCallBoarder[] }[] }[] = [];
  for (const b of sheet.value?.boarders ?? []) {
    const floorName = b.floor ?? 'Rooms';
    let f = out.find((x) => x.floor === floorName);
    if (!f) out.push((f = { floor: floorName, rooms: [] }));
    const roomName = b.room ?? 'No room yet';
    let r = f.rooms.find((x) => x.room === roomName);
    if (!r) f.rooms.push((r = { room: roomName, boarders: [] }));
    r.boarders.push(b);
  }
  return out;
});

const counts = computed(() => {
  const c = { total: 0, present: 0, absent: 0, excused: 0, automatic: 0, unmarked: 0 };
  for (const b of sheet.value?.boarders ?? []) {
    c.total++;
    if (b.automatic) {
      c.automatic++;
      continue;
    }
    const m = drafts.value[b.studentId]?.mark;
    if (m === 'Present') c.present++;
    else if (m === 'Absent') c.absent++;
    else if (m === 'Excused') c.excused++;
    else c.unmarked++;
  }
  return c;
});

const MARKS: { value: RollCallMark; label: string }[] = [
  { value: 'Present', label: 'Present' },
  { value: 'Absent', label: 'Absent' },
  { value: 'Excused', label: 'Excused' },
];
function setMark(id: string, mark: string) {
  const d = drafts.value[id];
  if (!d) return;
  d.mark = mark as RollCallMark;
  if (rowErrors.value[id])
    rowErrors.value = Object.fromEntries(Object.entries(rowErrors.value).filter(([k]) => k !== id));
}
function markAllPresent() {
  for (const d of Object.values(drafts.value)) if (!d.mark) d.mark = 'Present';
  rowErrors.value = {};
}

async function submit() {
  const s = sheet.value;
  if (!s) return;
  showMissing.value = true;
  formError.value = '';
  if (counts.value.unmarked) {
    formError.value = `Mark everyone first: ${counts.value.unmarked} not marked yet.`;
    return;
  }
  const order = Object.keys(drafts.value);
  const payload: RollCallPayload = {
    date: s.date,
    slot: s.slot,
    marks: order.map((studentId) => {
      const d = drafts.value[studentId]!;
      return {
        studentId,
        mark: d.mark as RollCallMark,
        ...(d.note.trim() ? { note: d.note.trim() } : {}),
      };
    }),
  };
  try {
    const result = await save.mutateAsync({ hostelId: s.hostel.id, ...payload });
    saved.value = snapshot();
    const absent = counts.value.absent;
    toast.success(
      messageOf(
        result,
        absent
          ? `${s.slot} roll call saved. Parents and house staff of the ${absent} absent have been alerted.`
          : `${s.slot} roll call saved. Everyone is accounted for.`,
      ),
    );
  } catch (e) {
    if (getApiErrorCode(e) === 'ROLL_CALL_LOCKED') {
      locked.value = true;
      formError.value = getApiErrorMessage(
        e,
        'This roll call is locked. It can only be changed until the next day.',
      );
      return;
    }
    const fe = getApiErrorFields(e);
    const rows: Record<string, string> = {};
    for (const [k, v] of Object.entries(fe)) {
      const m = /^marks\.(\d+)/.exec(k);
      const id = m ? order[Number(m[1])] : undefined;
      if (id) rows[id] = v;
    }
    rowErrors.value = rows;
    formError.value =
      fe.marks ??
      (Object.keys(rows).length
        ? 'Some marks need another look. They’re highlighted below.'
        : getApiErrorMessage(e, 'The roll call wasn’t saved. Try again.'));
  }
}

const AUTO_TONE = { 'On exeat': 'info', 'Sick bay': 'warning' } as const;
</script>

<template>
  <PageHeader
    :title="sheet ? `${sheet.hostel.name} · ${sheet.slot} roll call` : 'Roll call'"
    :description="`${dayLabel(date)}${sheet?.scope ? ` · ${sheet.scope}` : ''}`"
  >
    <template #actions>
      <Input v-model="date" type="date" :max="today" aria-label="Day" class="w-auto bg-card" />
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-64" />
  <InlineNotice
    v-else-if="isError || !sheet"
    tone="error"
    title="The roll call couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        v-if="slotOptions.length > 1"
        v-model="slot"
        :options="slotOptions"
        label="Roll call"
      />
      <p class="text-xs text-muted-foreground">
        <template v-if="sheet.taken"
          >Taken{{ sheet.takenAt ? ` at ${timeLabel(sheet.takenAt)}` : ''
          }}{{ sheet.takenBy ? ` by ${sheet.takenBy}` : '' }}</template
        >
        <template v-else>Not taken yet</template>
      </p>
    </div>

    <InlineNotice
      v-if="!editable"
      tone="neutral"
      :title="locked ? 'This roll call is locked' : 'View only'"
      :description="
        locked
          ? 'A roll call can only be changed until the next day.'
          : 'You can’t change this roll call: it’s past the day after, or not one of your hostels.'
      "
    />
    <InlineNotice
      v-if="formError"
      tone="error"
      :title="formError"
      role="alert"
      description="Nothing was saved."
    />

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums">
      <span>{{ counts.total }} boarders</span>
      <span class="text-success-strong">{{ counts.present }} present</span>
      <span :class="counts.absent ? 'font-medium text-error-strong' : 'text-muted-foreground'"
        >{{ counts.absent }} absent</span
      >
      <span class="text-muted-foreground">{{ counts.excused }} excused</span>
      <span v-if="counts.automatic" class="text-muted-foreground"
        >{{ counts.automatic }} on exeat or in sick bay</span
      >
      <span v-if="counts.unmarked" class="text-warning-strong"
        >{{ counts.unmarked }} not marked</span
      >
    </div>

    <p v-if="!sheet.boarders.length" class="text-[13px] text-muted-foreground">
      No boarders in {{ sheet.scope ?? sheet.hostel.name }} yet.
    </p>

    <SectionCard v-for="g in groups" :key="g.floor" :title="g.floor" flush>
      <template v-for="r in g.rooms" :key="r.room">
        <h3
          class="border-b border-divider bg-surface-warm px-4 py-1.5 text-xs font-semibold text-muted-foreground"
        >
          {{ r.room }}
        </h3>
        <ul>
          <li
            v-for="b in r.boarders"
            :key="b.studentId"
            class="grid gap-2 border-b border-divider px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(180px,1fr)_auto_minmax(160px,0.8fr)] sm:items-center"
            :class="
              rowErrors[b.studentId] || (showMissing && !b.automatic && !drafts[b.studentId]?.mark)
                ? 'bg-error-subtle'
                : drafts[b.studentId]?.mark === 'Absent'
                  ? 'bg-error-subtle/60'
                  : ''
            "
          >
            <span class="flex flex-col text-[13px]">
              <span class="font-medium">{{ b.name }}</span>
              <span class="text-xs text-faint"
                >{{ b.className }} · {{ b.admissionNo }}{{ b.bed ? ` · bed ${b.bed}` : '' }}</span
              >
              <span v-if="rowErrors[b.studentId]" class="text-xs text-error-strong">{{
                rowErrors[b.studentId]
              }}</span>
            </span>
            <template v-if="b.automatic">
              <span class="flex items-center gap-1.5">
                <LockIcon class="size-3.5 text-faint" aria-hidden="true" />
                <StatusBadge :label="b.automatic" :tone="AUTO_TONE[b.automatic]" />
              </span>
              <span class="text-xs text-faint">Marked automatically</span>
            </template>
            <template v-else-if="drafts[b.studentId]">
              <SegmentedControl
                v-if="editable"
                :model-value="drafts[b.studentId]!.mark"
                :options="MARKS"
                :label="`${b.name}’s mark`"
                @update:model-value="setMark(b.studentId, $event)"
              />
              <StatusBadge
                v-else
                :label="drafts[b.studentId]!.mark || 'Not marked'"
                :tone="
                  drafts[b.studentId]!.mark === 'Absent'
                    ? 'error'
                    : drafts[b.studentId]!.mark === 'Present'
                      ? 'success'
                      : 'neutral'
                "
              />
              <Input
                v-if="editable"
                v-model="drafts[b.studentId]!.note"
                maxlength="200"
                :aria-label="`Note for ${b.name}`"
                placeholder="Note (optional)"
                class="h-8 text-[13px]"
              />
              <span v-else class="text-xs text-muted-foreground">{{
                drafts[b.studentId]!.note
              }}</span>
            </template>
          </li>
        </ul>
      </template>
    </SectionCard>

    <div
      v-if="editable && sheet.boarders.length"
      class="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur"
    >
      <span v-if="dirty" class="mr-auto text-xs text-warning-strong">Unsaved changes</span>
      <Button variant="outline" :disabled="!counts.unmarked" @click="markAllPresent"
        ><CheckCheckIcon />Mark all present</Button
      >
      <Button variant="ghost" :disabled="!dirty" @click="reset">Undo changes</Button>
      <Button :disabled="save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />Save roll call</Button
      >
    </div>
  </template>
</template>
