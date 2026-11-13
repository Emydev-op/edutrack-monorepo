<script setup lang="ts">
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { ScoreValue } from '@/types';

import type { ScoreEntry } from './useScoreEntry';

/**
 * The score sheet on wide screens: students × components, then total, grade, flag and the
 * teacher's remark. Editable cells take a number, ABS or EXM; Enter / ↓ go down a row, ↑ up,
 * ← → move across at the edges of the text. Read-only when the sheet is locked.
 */
const props = defineProps<{
  entry: ScoreEntry;
  /** Focus this student's cell on open (from a "Fix" link). */
  focusStudent?: string;
  /** Focus (and highlight) this component's column. */
  focusComponent?: string;
}>();

const root = ref<HTMLElement | null>(null);
const comps = computed(() => props.entry.components.value);
const editable = computed(() => props.entry.editable.value);
const template = computed(
  () =>
    `minmax(180px,1.6fr) repeat(${comps.value.length}, minmax(96px,110px)) 64px 52px minmax(210px,1.5fr)`,
);

function move(row: number, col: number) {
  const el = root.value?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

function onKey(e: KeyboardEvent, row: number, col: number) {
  const el = e.target as HTMLInputElement;
  // At the edge of the text, or the whole value selected (as it is after moving into a cell).
  const all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
  const atStart = all || (el.selectionStart === 0 && el.selectionEnd === 0);
  const atEnd =
    all || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    move(row + 1, col);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(row - 1, col);
  } else if (e.key === 'ArrowLeft' && atStart) {
    if (move(row, col - 1)) e.preventDefault();
  } else if (e.key === 'ArrowRight' && atEnd) {
    if (move(row, col + 1)) e.preventDefault();
  }
}

async function focusRequested() {
  if (!props.focusStudent && !props.focusComponent) return;
  await nextTick();
  const rows = props.entry.parsed.value;
  const col = Math.max(
    0,
    comps.value.findIndex((c) => c.key === props.focusComponent),
  );
  let row = rows.findIndex((r) => r.studentId === props.focusStudent);
  if (row < 0) row = rows.findIndex((r) => r.values[col] === null);
  if (row < 0) row = 0;
  const el = root.value?.querySelector<HTMLElement>(`[data-row="${row}"]`);
  el?.scrollIntoView({ block: 'center' });
  if (editable.value) move(row, props.focusComponent === 'remark' ? comps.value.length : col);
}
onMounted(focusRequested);
watch(() => [props.focusStudent, props.focusComponent], focusRequested);

const show = (v: ScoreValue) => (v === null ? '—' : String(v));
const valueClass = (v: ScoreValue) =>
  v === 'ABS'
    ? 'font-medium text-info-strong'
    : v === 'EXM'
      ? 'font-medium text-neutral-strong'
      : v === null
        ? 'text-error-strong'
        : '';
const flagTone = (flag: string) =>
  flag === 'Missing score' ? 'warning' : flag.startsWith('Absent') ? 'info' : 'neutral';
</script>

<template>
  <div ref="root" class="overflow-x-auto rounded-lg border bg-card">
    <div class="min-w-[820px] text-[13px]" role="table" aria-label="Scores">
      <div
        role="row"
        class="sticky top-0 grid items-end gap-2.5 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"
        :style="{ gridTemplateColumns: template }"
      >
        <span role="columnheader">Student</span>
        <span
          v-for="c in comps"
          :key="c.key"
          role="columnheader"
          :class="cn(focusComponent === c.key && 'text-primary')"
          >{{ c.name }}
          <span class="block font-normal text-faint">/ {{ c.max }} · {{ c.weight }}%</span></span
        >
        <span role="columnheader" class="text-right">Total</span>
        <span role="columnheader">Grade</span>
        <span role="columnheader">Flag · remark</span>
      </div>
      <div
        v-for="(row, ri) in entry.parsed.value"
        :key="row.studentId"
        role="row"
        :data-row="ri"
        :class="
          cn(
            'grid items-start gap-2.5 border-t border-divider px-4 py-1.5',
            row.invalid &&
              'relative z-[1] bg-error-subtle/40 outline-2 -outline-offset-2 outline-error',
            focusStudent === row.studentId && !row.invalid && 'bg-highlight-subtle',
          )
        "
        :style="{ gridTemplateColumns: template }"
      >
        <span role="cell" class="flex min-w-0 flex-col pt-1.5">
          <span class="truncate font-medium">{{ row.name }}</span>
          <span class="text-[11px] text-faint">{{ row.admissionNo }}</span>
        </span>
        <span v-for="(c, ci) in comps" :key="c.key" role="cell" class="flex flex-col gap-0.5">
          <template v-if="editable">
            <input
              :data-cell="`${ri}:${ci}`"
              :value="row.raw[ci]"
              :aria-label="`${row.name} · ${c.name}, out of ${c.max}`"
              :aria-invalid="row.cells[ci]!.error ? 'true' : undefined"
              :aria-describedby="row.cells[ci]!.error ? `err-${row.studentId}-${c.key}` : undefined"
              autocomplete="off"
              spellcheck="false"
              :placeholder="'—'"
              :class="
                cn(
                  'h-[34px] w-full rounded-sm border bg-card px-2 tabular-nums outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20',
                  row.cells[ci]!.error && 'border-error bg-error-subtle',
                  !row.cells[ci]!.error &&
                    row.values[ci] === null &&
                    'border-[#E9D9B5] bg-warning-subtle/50',
                  (row.values[ci] === 'ABS' || row.values[ci] === 'EXM') &&
                    'font-medium text-info-strong',
                  focusComponent === c.key && 'border-primary/50',
                )
              "
              @input="entry.setCell(ri, ci, ($event.target as HTMLInputElement).value)"
              @keydown="onKey($event, ri, ci)"
              @blur="entry.saveSoon()"
            />
            <span
              v-if="row.cells[ci]!.error"
              :id="`err-${row.studentId}-${c.key}`"
              class="text-[11px] leading-tight text-error-strong"
              >{{ row.cells[ci]!.error }}</span
            >
          </template>
          <span v-else :class="cn('pt-1.5 tabular-nums', valueClass(row.values[ci] ?? null))">{{
            show(row.values[ci] ?? null)
          }}</span>
        </span>
        <span role="cell" class="pt-1.5 text-right font-semibold tabular-nums">{{
          row.total ?? '—'
        }}</span>
        <span role="cell" class="pt-1.5 font-semibold">{{ row.grade ?? '—' }}</span>
        <span role="cell" class="flex min-w-0 flex-col gap-1 pt-1">
          <StatusBadge
            v-if="row.flag"
            :label="row.flag"
            :tone="flagTone(row.flag)"
            class="self-start"
          />
          <input
            v-if="editable"
            :data-cell="`${ri}:${comps.length}`"
            :value="row.remark"
            maxlength="300"
            :aria-label="`${row.name} · remark`"
            placeholder="Remark (optional)"
            class="h-[30px] w-full rounded-sm border bg-card px-2 text-xs outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20"
            @input="entry.setRemark(ri, ($event.target as HTMLInputElement).value)"
            @keydown="onKey($event, ri, comps.length)"
            @blur="entry.saveSoon()"
          />
          <span v-else-if="row.remark" class="text-xs text-muted-foreground">{{ row.remark }}</span>
          <span v-else-if="!row.flag" class="text-xs text-faint">{{ row.remark || '—' }}</span>
        </span>
      </div>
      <p v-if="!entry.parsed.value.length" class="px-4 py-8 text-center text-muted-foreground">
        No students take this subject in this class.
      </p>
    </div>
  </div>
</template>
