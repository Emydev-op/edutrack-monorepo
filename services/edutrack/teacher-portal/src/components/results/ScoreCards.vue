<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';

import type { ScoreValue } from '@/types';

import type { ScoreEntry } from './useScoreEntry';

/**
 * The score sheet on phones: one student at a time, with previous / next and a jump list.
 * Enter moves to the next component, then to the next student.
 */
const props = defineProps<{
  entry: ScoreEntry;
  focusStudent?: string;
  focusComponent?: string;
}>();

const root = ref<HTMLElement | null>(null);
const index = ref(0);
const rows = computed(() => props.entry.parsed.value);
const comps = computed(() => props.entry.components.value);
const editable = computed(() => props.entry.editable.value);
const row = computed(() => rows.value[index.value]);

function go(i: number, focusCol = -1) {
  if (i < 0 || i >= rows.value.length) return;
  props.entry.saveSoon();
  index.value = i;
  if (focusCol >= 0)
    void nextTick(() => {
      const el = root.value?.querySelector<HTMLInputElement>(`[data-card-cell="${focusCol}"]`);
      el?.focus();
      el?.select();
    });
}

watch(
  () => [props.focusStudent, props.focusComponent, rows.value.length] as const,
  () => {
    const i = rows.value.findIndex((r) => r.studentId === props.focusStudent);
    const col = comps.value.findIndex((c) => c.key === props.focusComponent);
    if (i >= 0)
      go(
        i,
        editable.value
          ? props.focusComponent === 'remark'
            ? comps.value.length
            : Math.max(0, col)
          : -1,
      );
  },
  { immediate: true },
);

function onKey(e: KeyboardEvent, col: number) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const next = root.value?.querySelector<HTMLInputElement>(`[data-card-cell="${col + 1}"]`);
  if (next && col + 1 < comps.value.length) {
    next.focus();
    next.select();
  } else go(index.value + 1, 0);
}

const done = (r: (typeof rows.value)[number]) => !r.invalid && r.values.every((v) => v !== null);
const show = (v: ScoreValue) => (v === null ? '—' : String(v));
const flagTone = (flag: string) =>
  flag === 'Missing score' ? 'warning' : flag.startsWith('Absent') ? 'info' : 'neutral';
const setQuick = (col: number, value: 'ABS' | 'EXM') => {
  const current = row.value?.raw[col]?.toUpperCase();
  props.entry.setCell(index.value, col, current === value ? '' : value);
};
</script>

<template>
  <div v-if="row" ref="root" class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous student"
        :disabled="index === 0"
        @click="go(index - 1)"
        ><ChevronLeftIcon
      /></Button>
      <label class="min-w-0 flex-1">
        <span class="sr-only">Jump to a student</span>
        <select
          :value="index"
          class="h-9 w-full rounded-md border bg-card px-2 text-sm"
          @change="go(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="(r, i) in rows" :key="r.studentId" :value="i">
            {{ done(r) ? '✓' : '•' }} {{ i + 1 }}. {{ r.name
            }}{{ r.invalid ? ' (check)' : done(r) ? '' : ' (missing)' }}
          </option>
        </select>
      </label>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next student"
        :disabled="index === rows.length - 1"
        @click="go(index + 1)"
        ><ChevronRightIcon
      /></Button>
    </div>

    <section
      :class="
        cn(
          'flex flex-col gap-3.5 rounded-lg border bg-card p-4',
          row.invalid && 'border-error outline-1 outline-error',
        )
      "
      :aria-label="`${row.name}, student ${index + 1} of ${rows.length}`"
    >
      <header class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col">
          <span class="text-xs text-faint">Student {{ index + 1 }} of {{ rows.length }}</span>
          <span class="truncate text-[15px] font-semibold">{{ row.name }}</span>
          <span class="text-xs text-faint">{{ row.admissionNo }}</span>
        </div>
        <div class="flex shrink-0 flex-col items-end">
          <span class="text-xl font-semibold tabular-nums">{{ row.total ?? '—' }}</span>
          <span class="text-xs text-muted-foreground"
            >Grade <b class="text-foreground">{{ row.grade ?? '—' }}</b></span
          >
        </div>
      </header>
      <StatusBadge
        v-if="row.flag"
        :label="row.flag"
        :tone="flagTone(row.flag)"
        class="self-start"
      />

      <div v-for="(c, ci) in comps" :key="c.key" class="flex flex-col gap-1">
        <label :for="`card-${row.studentId}-${c.key}`" class="text-[13px] font-medium"
          >{{ c.name }}
          <span class="font-normal text-faint">out of {{ c.max }} · {{ c.weight }}%</span></label
        >
        <div v-if="editable" class="flex gap-2">
          <input
            :id="`card-${row.studentId}-${c.key}`"
            :data-card-cell="ci"
            :value="row.raw[ci]"
            inputmode="decimal"
            autocomplete="off"
            enterkeyhint="next"
            placeholder="—"
            :aria-invalid="row.cells[ci]!.error ? 'true' : undefined"
            :class="
              cn(
                'h-10 min-w-0 flex-1 rounded-md border bg-card px-3 text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
                row.cells[ci]!.error && 'border-error bg-error-subtle',
                !row.cells[ci]!.error && row.values[ci] === null && 'bg-warning-subtle/50',
              )
            "
            @input="entry.setCell(index, ci, ($event.target as HTMLInputElement).value)"
            @keydown="onKey($event, ci)"
            @blur="entry.saveSoon()"
          />
          <Button
            v-for="q in ['ABS', 'EXM'] as const"
            :key="q"
            type="button"
            size="sm"
            class="h-10"
            :variant="row.values[ci] === q ? 'default' : 'outline'"
            :aria-pressed="row.values[ci] === q"
            :aria-label="`${row.name} · ${c.name}: ${q === 'ABS' ? 'absent' : 'exempt'}`"
            @click="setQuick(ci, q)"
            >{{ q }}</Button
          >
        </div>
        <span v-else class="tabular-nums">{{ show(row.values[ci] ?? null) }}</span>
        <span v-if="row.cells[ci]!.error" class="text-xs text-error-strong">{{
          row.cells[ci]!.error
        }}</span>
      </div>

      <div class="flex flex-col gap-1">
        <label :for="`card-${row.studentId}-remark`" class="text-[13px] font-medium"
          >Remark <span class="font-normal text-faint">optional</span></label
        >
        <textarea
          v-if="editable"
          :id="`card-${row.studentId}-remark`"
          :data-card-cell="comps.length"
          :value="row.remark"
          rows="2"
          maxlength="300"
          placeholder="e.g. Steady improvement this term"
          class="rounded-md border bg-card px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          @input="entry.setRemark(index, ($event.target as HTMLTextAreaElement).value)"
          @blur="entry.saveSoon()"
        />
        <span v-else class="text-[13px] text-muted-foreground">{{ row.remark || '—' }}</span>
      </div>
    </section>

    <div class="flex gap-2">
      <Button variant="outline" class="flex-1" :disabled="index === 0" @click="go(index - 1)"
        >Previous</Button
      >
      <Button
        class="flex-1"
        :disabled="index === rows.length - 1"
        @click="go(index + 1, editable ? 0 : -1)"
        >Next student</Button
      >
    </div>
  </div>
  <p v-else class="rounded-lg border bg-card px-4 py-8 text-center text-muted-foreground">
    No students take this subject in this class.
  </p>
</template>
