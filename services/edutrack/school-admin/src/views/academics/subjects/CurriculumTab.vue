<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { SlidersHorizontalIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useSaveCurriculumMutation } from '@/api/services/academics';
import { useCan } from '@/composables/useCan';
import { useContextStore } from '@/stores/context';
import type { CurriculumArms, CurriculumPeriods, CurriculumView, Offering, Subject } from '@/types';

const props = defineProps<{ view: CurriculumView }>();
defineEmits<{ add: [] }>();
const confirm = useConfirm();
const context = useContextStore();
const save = useSaveCurriculumMutation();
const can = useCan();

/** What this tab edits: offerings, lessons per week that differ by level, and arm-only subjects. */
interface Draft {
  curriculum: CurriculumView['curriculum'];
  periods: CurriculumPeriods;
  arms: CurriculumArms;
}
const fromView = (v: CurriculumView): Draft =>
  JSON.parse(
    JSON.stringify({ curriculum: v.curriculum, periods: v.periods ?? {}, arms: v.arms ?? {} }),
  );
const local = ref<Draft>(fromView(props.view));
const saved = computed(() => JSON.stringify(fromView(props.view)));
const dirty = computed(() => JSON.stringify(local.value) !== saved.value);
watch(saved, () => {
  if (!dirty.value) local.value = fromView(props.view);
});
useUnsavedChanges(dirty);

const section = ref(
  props.view.mySections?.find((s) => props.view.levels.some((l) => l.section === s)) ??
    props.view.levels[0]?.section ??
    '',
);
const info = computed(() => props.view.levels.find((l) => l.section === section.value));
const levels = computed(() => info.value?.levels ?? []);
/** Sections this admin doesn't manage are shown but can't be changed. */
const otherSection = computed(() => !!info.value && !info.value.canEdit);
/** Also read-only for users who can't configure academics. */
const readonly = computed(() => otherSection.value || !can('academics.configure'));
/** Shared subjects, plus the ones that belong to this section. */
const subjects = computed(() =>
  props.view.subjects.filter(
    (s) => s.status === 'Active' && (!s.section || s.section === section.value),
  ),
);
const armsOf = (lv: string) => info.value?.arms?.[lv] ?? [];
const multiBranch = computed(
  () =>
    new Set(Object.values(info.value?.arms ?? {}).flatMap((a) => a.map((x) => x.branch))).size > 1,
);
const armLabel = (a: { name: string; branch: string }) =>
  multiBranch.value ? `${a.name} · ${a.branch}` : a.name;

const cell = (lv: string, code: string): Offering | '' =>
  local.value.curriculum[section.value]?.[lv]?.[code] ?? '';

/** Removes a key and any maps left empty above it. */
function drop(
  map: Record<string, Record<string, Record<string, unknown>>>,
  lv: string,
  code: string,
) {
  const sec = map[section.value];
  if (!sec?.[lv]) return;
  delete sec[lv][code];
  if (!Object.keys(sec[lv]).length) delete sec[lv];
  if (!Object.keys(sec).length) delete map[section.value];
}

function set(lv: string, code: string, v: Offering | '') {
  if (readonly.value) return;
  const sec = (local.value.curriculum[section.value] ??= {});
  const m = (sec[lv] ??= {});
  if (v) m[code] = v;
  else {
    delete m[code];
    // Not offered: its lessons per week and arms go with it.
    drop(local.value.periods, lv, code);
    drop(local.value.arms, lv, code);
  }
}
const cycle = (lv: string, code: string) => {
  const cur = cell(lv, code);
  set(lv, code, cur === '' ? 'C' : cur === 'C' ? 'E' : '');
};
function setRow(code: string, v: string) {
  if (!v) return;
  levels.value.forEach((lv) => set(lv, code, v === 'none' ? '' : (v as Offering)));
}

/* Lessons per week for one level, when it differs from the subject's default. */
const periodsAt = (lv: string, code: string) => local.value.periods[section.value]?.[lv]?.[code];
function setPeriods(s: Subject, lv: string, raw: string | number) {
  if (readonly.value) return;
  const text = String(raw ?? '').trim();
  const n = Number(text);
  if (!text) return drop(local.value.periods, lv, s.code);
  ((local.value.periods[section.value] ??= {})[lv] ??= {})[s.code] = n;
}
/** Only levels that differ from the subject's default are sent. */
function periodsToSend(): CurriculumPeriods {
  const out: CurriculumPeriods = {};
  for (const [sec, lvs] of Object.entries(local.value.periods))
    for (const [lv, m] of Object.entries(lvs))
      for (const [code, n] of Object.entries(m))
        if (n !== props.view.subjects.find((s) => s.code === code)?.periods)
          ((out[sec] ??= {})[lv] ??= {})[code] = n;
  return out;
}
const badPeriods = (n: number | undefined) =>
  n !== undefined && (!Number.isInteger(n) || n < 1 || n > 10);

/* Subjects only some arms take. Not listed = every arm. */
const armsAt = (lv: string, code: string) => local.value.arms[section.value]?.[lv]?.[code];
function setEveryArm(lv: string, code: string, every: boolean) {
  if (readonly.value) return;
  if (every) return drop(local.value.arms, lv, code);
  ((local.value.arms[section.value] ??= {})[lv] ??= {})[code] ??= {};
}
function toggleArm(lv: string, code: string, armId: string, on: boolean) {
  const picked = armsAt(lv, code);
  if (readonly.value || !picked) return;
  if (on) picked[armId] ??= null;
  else delete picked[armId];
}

/** "4 a week · 2 of 3 arms", shown under the offering when a cell differs from the defaults. */
function cellNote(s: Subject, lv: string) {
  const p = periodsAt(lv, s.code);
  const a = armsAt(lv, s.code);
  return [
    p !== undefined ? `${p} a week` : '',
    a ? `${Object.keys(a).length} of ${armsOf(lv).length} arms` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const counts = computed(() =>
  levels.value.map((lv) => {
    const vals = Object.values(local.value.curriculum[section.value]?.[lv] ?? {});
    return { lv, c: vals.filter((x) => x === 'C').length, e: vals.filter((x) => x === 'E').length };
  }),
);
const heavy = computed(() => counts.value.filter((x) => x.c && (x.c + x.e > 18 || x.c < 5)));
const noCompulsory = computed(() => counts.value.filter((x) => !x.c).map((x) => x.lv));

const label = (v: Offering | '') => (v === 'C' ? 'Compulsory' : v === 'E' ? 'Elective' : '—');
const name = (code: string) => props.view.subjects.find((s) => s.code === code)?.name ?? code;

/** Lessons per week out of range, or "only some arms" with none picked, in any section. */
const problems = computed(() => {
  const out: string[] = [];
  for (const [sec, lvs] of Object.entries(local.value.periods))
    for (const [lv, m] of Object.entries(lvs))
      for (const [code, n] of Object.entries(m))
        if (badPeriods(n))
          out.push(`${name(code)} in ${lv} (${sec}): lessons per week must be 1–10`);
  for (const lvs of Object.values(local.value.arms))
    for (const [lv, m] of Object.entries(lvs))
      for (const [code, picked] of Object.entries(m))
        if (!Object.keys(picked).length) out.push(`${name(code)} in ${lv}: pick at least one arm`);
  return out;
});

function changes() {
  const removed: string[] = [];
  const toElective: string[] = [];
  const added: string[] = [];
  const adjusted: string[] = [];
  const before = fromView(props.view);
  const after = local.value;
  const keys = (...xs: (object | undefined)[]) => new Set(xs.flatMap((x) => Object.keys(x ?? {})));
  for (const sec of keys(
    before.curriculum,
    after.curriculum,
    before.periods,
    after.periods,
    before.arms,
    after.arms,
  )) {
    const lvs = keys(
      before.curriculum[sec],
      after.curriculum[sec],
      before.periods[sec],
      after.periods[sec],
      before.arms[sec],
      after.arms[sec],
    );
    for (const lv of lvs)
      for (const code of keys(
        before.curriculum[sec]?.[lv],
        after.curriculum[sec]?.[lv],
        before.periods[sec]?.[lv],
        after.periods[sec]?.[lv],
        before.arms[sec]?.[lv],
        after.arms[sec]?.[lv],
      )) {
        const b = before.curriculum[sec]?.[lv]?.[code];
        const a = after.curriculum[sec]?.[lv]?.[code];
        const where = `${name(code)} in ${lv}`;
        if (b && !a) removed.push(where);
        else if (!b && a) added.push(where);
        else {
          if (b === 'C' && a === 'E') toElective.push(where);
          if (
            a &&
            (before.periods[sec]?.[lv]?.[code] !== after.periods[sec]?.[lv]?.[code] ||
              JSON.stringify(before.arms[sec]?.[lv]?.[code] ?? null) !==
                JSON.stringify(after.arms[sec]?.[lv]?.[code] ?? null))
          )
            adjusted.push(where);
        }
      }
  }
  return { removed, added, toElective, adjusted };
}
const list = (xs: string[]) =>
  xs.length > 8 ? `${xs.slice(0, 8).join(', ')} and ${xs.length - 8} more` : xs.join(', ');

function submit() {
  if (problems.value.length) return;
  const { removed, added, toElective, adjusted } = changes();
  void confirm({
    title: 'Save curriculum?',
    description: `Applies to ${context.current.session}. Student subject enrollments update after you confirm.`,
    details: [
      ...(added.length ? ([['Added', list(added)]] as [string, string][]) : []),
      ...(removed.length
        ? ([
            ['Removed from classes', list(removed)],
            ['Teacher assignments', 'Cleared for subjects no longer taught'],
          ] as [string, string][])
        : []),
      ...(toElective.length ? ([['Now elective', list(toElective)]] as [string, string][]) : []),
      ...(adjusted.length
        ? ([['Lessons or arms changed', list(adjusted)]] as [string, string][])
        : []),
    ],
    confirmLabel: 'Save curriculum',
    action: async () => {
      try {
        const res = await save.mutateAsync({
          curriculum: local.value.curriculum,
          groups: props.view.groups,
          periods: periodsToSend(),
          arms: local.value.arms,
        });
        toast.success(
          `Curriculum saved.${res.cleared ? ` ${pluralize(res.cleared, 'teacher assignment')} cleared.` : ''}`,
        );
      } catch (e) {
        throw new Error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
      }
    },
  });
}
const reset = () => (local.value = fromView(props.view));
</script>

<template>
  <InlineNotice
    tone="info"
    title="Curriculum changes are session-specific"
    :description="`Editing the ${context.current.session} curriculum does not change what students took in earlier sessions. Subjects with scores this session can’t be removed until the session closes.`"
  />
  <InlineNotice
    v-if="noCompulsory.length"
    tone="error"
    title="Classes without a compulsory subject"
    :description="`${noCompulsory.join(', ')} ${noCompulsory.length > 1 ? 'have' : 'has'} no compulsory subjects.`"
  />
  <InlineNotice
    v-if="problems.length"
    tone="error"
    title="Fix these before saving"
    :description="list(problems)"
  />
  <InlineNotice
    v-if="heavy.length"
    tone="warning"
    title="Check the load"
    :description="`${heavy.map((x) => `${x.lv} (${x.c} compulsory, ${x.e} elective)`).join('; ')}. Most schools have 5–18 subjects per class. You can still save.`"
  />
  <SectionCard
    flush
    title="Curriculum by class"
    description="Click a cell to cycle: not offered → Compulsory → Elective. Use the sliders on an offered cell to change its lessons per week or which arms take it."
  >
    <div v-if="view.levels.length > 1" class="border-b border-divider px-4 py-2.5">
      <SegmentedControl
        v-model="section"
        label="Section"
        :options="view.levels.map((l) => ({ value: l.section, label: l.section }))"
      />
    </div>
    <p
      v-if="otherSection"
      class="border-b border-divider bg-muted px-4 py-2.5 text-[13px] text-muted-foreground"
    >
      You manage other sections, so {{ section }} is read-only.
    </p>
    <div v-if="!subjects.length" class="p-6 text-center text-sm text-muted-foreground">
      No subjects for {{ section || 'this section' }} yet. Add them in the Subjects tab.
    </div>
    <div v-else class="overflow-x-auto">
      <table
        class="w-full border-collapse text-[13px]"
        :style="{ minWidth: `${260 + levels.length * 110 + 150}px` }"
      >
        <thead>
          <tr class="bg-muted text-left text-xs text-muted-foreground">
            <th class="px-4 py-2 font-medium">Subject</th>
            <th v-for="lv in levels" :key="lv" class="px-2 py-2 text-center font-medium">
              {{ lv }}
            </th>
            <th class="w-36 px-2 py-2 font-medium">Whole row</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in subjects" :key="s.code" class="border-t border-divider">
            <th class="px-4 py-1.5 text-left font-normal">
              <span class="block font-medium">{{ s.name }}</span>
              <span class="text-xs text-faint">{{ s.code }} · {{ s.category }}</span>
            </th>
            <td v-for="lv in levels" :key="lv" class="px-1.5 py-1">
              <div
                class="flex min-h-8 w-full overflow-hidden rounded-sm border text-xs transition-colors"
                :class="
                  cell(lv, s.code) === 'C'
                    ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                    : cell(lv, s.code) === 'E'
                      ? 'border-info bg-info-subtle font-medium text-info'
                      : 'bg-card text-faint'
                "
              >
                <button
                  type="button"
                  class="flex flex-1 flex-col items-center justify-center px-1 py-0.5 enabled:hover:bg-muted/60 disabled:cursor-not-allowed"
                  :disabled="readonly"
                  :aria-label="`${s.name} in ${lv}: ${label(cell(lv, s.code))}. Click to change.`"
                  @click="cycle(lv, s.code)"
                >
                  {{ label(cell(lv, s.code)) }}
                  <span
                    v-if="cell(lv, s.code) && cellNote(s, lv)"
                    class="text-[10px] leading-tight font-normal"
                    :class="badPeriods(periodsAt(lv, s.code)) && 'text-error-strong'"
                    >{{ cellNote(s, lv) }}</span
                  >
                </button>
                <Popover v-if="cell(lv, s.code)">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="flex w-6 shrink-0 items-center justify-center border-l border-current/20 hover:bg-muted/60"
                      :aria-label="`Lessons per week and arms for ${s.name} in ${lv}`"
                    >
                      <SlidersHorizontalIcon class="size-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" class="flex w-72 flex-col gap-3 text-[13px]">
                    <p class="font-semibold">{{ s.name }} · {{ lv }}</p>
                    <label class="flex flex-col gap-1">
                      <span class="text-xs font-medium">Lessons per week</span>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        :model-value="periodsAt(lv, s.code) ?? ''"
                        :placeholder="`${s.periods} (subject default)`"
                        :disabled="readonly"
                        :aria-invalid="badPeriods(periodsAt(lv, s.code))"
                        @update:model-value="setPeriods(s, lv, $event)"
                      />
                      <span
                        class="text-xs"
                        :class="
                          badPeriods(periodsAt(lv, s.code))
                            ? 'text-error-strong'
                            : 'text-muted-foreground'
                        "
                        >{{
                          badPeriods(periodsAt(lv, s.code))
                            ? 'Between 1 and 10.'
                            : `Leave blank to use ${s.periods}, the subject’s default.`
                        }}</span
                      >
                    </label>
                    <fieldset v-if="armsOf(lv).length > 1" class="flex flex-col gap-1.5">
                      <legend class="mb-1 text-xs font-medium">Which arms take it?</legend>
                      <label class="flex items-center gap-2">
                        <input
                          type="radio"
                          :name="`arms-${lv}-${s.code}`"
                          :checked="!armsAt(lv, s.code)"
                          :disabled="readonly"
                          @change="setEveryArm(lv, s.code, true)"
                        />
                        Every arm
                      </label>
                      <label class="flex items-center gap-2">
                        <input
                          type="radio"
                          :name="`arms-${lv}-${s.code}`"
                          :checked="!!armsAt(lv, s.code)"
                          :disabled="readonly"
                          @change="setEveryArm(lv, s.code, false)"
                        />
                        Only some arms
                      </label>
                      <div v-if="armsAt(lv, s.code)" class="ml-5 flex flex-col gap-1">
                        <label v-for="a in armsOf(lv)" :key="a.id" class="flex items-center gap-2">
                          <input
                            type="checkbox"
                            :checked="a.id in armsAt(lv, s.code)!"
                            :disabled="readonly"
                            @change="
                              toggleArm(
                                lv,
                                s.code,
                                a.id,
                                ($event.target as HTMLInputElement).checked,
                              )
                            "
                          />
                          {{ armLabel(a) }}
                        </label>
                        <span
                          v-if="!Object.keys(armsAt(lv, s.code)!).length"
                          class="text-xs text-error-strong"
                          >Pick at least one arm.</span
                        >
                      </div>
                    </fieldset>
                  </PopoverContent>
                </Popover>
              </div>
            </td>
            <td class="px-2 py-1">
              <select
                class="h-8 w-full rounded-md border bg-card px-2 text-xs"
                :disabled="readonly"
                :aria-label="`Set ${s.name} for every class`"
                @change="
                  setRow(s.code, ($event.target as HTMLSelectElement).value);
                  ($event.target as HTMLSelectElement).value = '';
                "
              >
                <option value="">Set all…</option>
                <option value="C">All compulsory</option>
                <option value="E">All elective</option>
                <option value="none">Not offered</option>
              </select>
            </td>
          </tr>
          <tr class="border-t border-divider bg-muted text-xs">
            <th class="px-4 py-2 text-left font-medium">Per class</th>
            <td
              v-for="x in counts"
              :key="x.lv"
              class="px-2 py-2 text-center"
              :class="!x.c && 'text-error-strong'"
            >
              {{ x.c }} C · {{ x.e }} E
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="can('academics.configure')"
      class="flex items-center justify-end gap-2 border-t border-divider px-4 py-3"
    >
      <span v-if="dirty" class="mr-auto text-xs text-warning-strong">Unsaved changes</span>
      <Button variant="ghost" :disabled="!dirty" @click="reset">Discard</Button>
      <Button
        :disabled="
          !dirty ||
          save.isPending.value ||
          (!readonly && !!noCompulsory.length) ||
          !!problems.length
        "
        @click="submit"
        >Save curriculum</Button
      >
    </div>
  </SectionCard>
</template>
