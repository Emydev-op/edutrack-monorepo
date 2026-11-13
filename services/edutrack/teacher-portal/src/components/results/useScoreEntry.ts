import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch, type Ref } from 'vue';

import { getApiErrorMessage } from '@/lib/api-errors';
import type { ResultSheet, SaveScoresPayload, ScoreValue } from '@/types';

import { formatScore, missingOf, parseScore, scoreRow, statsOf, type ParsedScore } from './scoring';

export interface EntryRow {
  studentId: string;
  name: string;
  admissionNo: string;
  /** What is typed in each component's cell. */
  raw: string[];
  remark: string;
}

export interface Blocker {
  studentId: string;
  name: string;
  /** Component key to focus, or "remark". */
  focus: string;
  message: string;
  kind: 'missing' | 'invalid';
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Autosave this long after typing stops. */
export const AUTOSAVE_MS = 2000;

/**
 * The score sheet's editing state: what is typed, the parsed values and live totals, blockers,
 * and autosave. The grid (desktop) and the cards (phone) both render from it.
 *
 * Saving sends only changed rows; a cell that doesn't parse is never sent (the last saved value
 * stays on the server) and keeps the sheet "unsaved" until it's fixed or cleared.
 */
export function useScoreEntry(
  sheet: Ref<ResultSheet | undefined>,
  save: (payload: SaveScoresPayload) => Promise<ResultSheet>,
) {
  const rows = ref<EntryRow[]>([]);
  /** Last values the server has, by student. */
  const saved = ref<Record<string, { scores: ScoreValue[]; remark: string }>>({});
  const state = ref<SaveState>('idle');
  const savedAt = ref<string | null>(null);
  const error = ref('');
  let queued = false;

  const components = computed(() => sheet.value?.components ?? []);
  const scale = computed(() => sheet.value?.scale ?? []);
  const editable = computed(() => Boolean(sheet.value?.editable));

  function reset(s: ResultSheet) {
    rows.value = s.rows.map((r) => ({
      studentId: r.studentId,
      name: r.name,
      admissionNo: r.admissionNo,
      raw: r.scores.map(formatScore),
      remark: r.teacherRemark,
    }));
    saved.value = Object.fromEntries(
      s.rows.map((r) => [r.studentId, { scores: [...r.scores], remark: r.teacherRemark }]),
    );
    savedAt.value = s.savedAt;
    state.value = s.savedAt ? 'saved' : 'idle';
    error.value = '';
  }

  // Start again when another sheet opens or the sheet becomes (un)editable; never while typing.
  watch(
    () => [sheet.value?.id, sheet.value?.editable] as const,
    () => sheet.value && reset(sheet.value),
    { immediate: true },
  );

  const parsed = computed(() =>
    rows.value.map((r) => {
      const cells: ParsedScore[] = r.raw.map((t, i) =>
        parseScore(t, components.value[i]?.max ?? 0),
      );
      const values = cells.map((c) => (c.error ? null : c.value));
      const scored = scoreRow(components.value, scale.value, values);
      return {
        ...r,
        cells,
        /** Parsed values; a cell that doesn't parse counts as missing. */
        values,
        scores: values,
        invalid: cells.some((c) => c.error),
        total: scored.total,
        grade: scored.grade,
        /** The grade band's remark ("Very good"); `remark` is the teacher's. */
        bandRemark: scored.remark,
        flag: scored.flag,
      };
    }),
  );

  const stats = computed(() =>
    statsOf(components.value, scale.value, parsed.value, sheet.value?.passMark ?? 40),
  );
  const invalidCount = computed(
    () => parsed.value.flatMap((r) => r.cells.filter((c) => c.error)).length,
  );

  const blockers = computed<Blocker[]>(() =>
    parsed.value.flatMap((r) => {
      const out: Blocker[] = [];
      r.cells.forEach((c, i) => {
        const comp = components.value[i]!;
        if (c.error)
          out.push({
            studentId: r.studentId,
            name: r.name,
            focus: comp.key,
            message: `${comp.name}: “${r.raw[i]}” isn’t a score (${c.error})`,
            kind: 'invalid',
          });
      });
      const missing = missingOf(
        components.value,
        r.values.map((v, i) => (r.cells[i]!.error ? 'ABS' : v)),
      );
      if (missing.length)
        out.push({
          studentId: r.studentId,
          name: r.name,
          focus: components.value.find((c) => missing.includes(c.name))!.key,
          message: `${missing.join(', ')} missing`,
          kind: 'missing',
        });
      return out;
    }),
  );

  /** Rows whose valid values or remark differ from what the server has. */
  function changedRows() {
    return parsed.value
      .map((r) => {
        const last = saved.value[r.studentId];
        const scores = r.cells.map((c, i) => (c.error ? (last?.scores[i] ?? null) : c.value));
        const remark = r.remark.trim();
        const same =
          last && last.remark === remark && scores.every((v, i) => v === (last.scores[i] ?? null));
        return same ? null : { studentId: r.studentId, scores, remark };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  const dirty = computed(() => invalidCount.value > 0 || changedRows().length > 0);

  async function flush(): Promise<boolean> {
    if (!editable.value) return true;
    if (state.value === 'saving') {
      queued = true;
      return true;
    }
    const changes = changedRows();
    if (!changes.length) return true;
    state.value = 'saving';
    error.value = '';
    try {
      const res = await save({ rows: changes });
      for (const c of changes) saved.value[c.studentId] = { scores: c.scores, remark: c.remark };
      savedAt.value = res.savedAt;
      state.value = 'saved';
      return true;
    } catch (e) {
      state.value = 'error';
      error.value = getApiErrorMessage(e, 'Couldn’t save. Check your connection and retry.');
      return false;
    } finally {
      if (queued) {
        queued = false;
        if (state.value !== 'error') void flush();
      }
    }
  }

  const scheduleSave = useDebounceFn(() => void flush(), AUTOSAVE_MS);

  function setCell(rowIndex: number, col: number, text: string) {
    const row = rows.value[rowIndex];
    if (!row || !editable.value) return;
    row.raw[col] = text;
    void scheduleSave();
  }
  function setRemark(rowIndex: number, text: string) {
    const row = rows.value[rowIndex];
    if (!row || !editable.value) return;
    row.remark = text.slice(0, 300);
    void scheduleSave();
  }

  return {
    rows,
    parsed,
    stats,
    blockers,
    invalidCount,
    components,
    scale,
    editable,
    dirty,
    state,
    savedAt,
    error,
    flush,
    setCell,
    setRemark,
    /** Saves now if anything changed (on blur). */
    saveSoon: () => dirty.value && void flush(),
  };
}

export type ScoreEntry = ReturnType<typeof useScoreEntry>;
