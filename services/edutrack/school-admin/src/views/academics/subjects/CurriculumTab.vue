<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useSaveCurriculumMutation } from '@/api/services/academics';
import { useContextStore } from '@/stores/context';
import type { CurriculumView, Offering } from '@/types';

const props = defineProps<{ view: CurriculumView }>();
defineEmits<{ add: [] }>();
const confirm = useConfirm();
const context = useContextStore();
const save = useSaveCurriculumMutation();

type Matrix = CurriculumView['curriculum'];
const clone = (m: Matrix): Matrix => JSON.parse(JSON.stringify(m));
const local = ref<Matrix>(clone(props.view.curriculum));
const dirty = computed(() => JSON.stringify(local.value) !== JSON.stringify(props.view.curriculum));
watch(
  () => props.view.curriculum,
  (c) => {
    if (!dirty.value) local.value = clone(c);
  },
);
useUnsavedChanges(dirty);

const section = ref(props.view.levels[0]?.section ?? '');
const levels = computed(
  () => props.view.levels.find((l) => l.section === section.value)?.levels ?? [],
);
const subjects = computed(() => props.view.subjects.filter((s) => s.status === 'Active'));
const cell = (lv: string, code: string): Offering | '' =>
  local.value[section.value]?.[lv]?.[code] ?? '';

function set(lv: string, code: string, v: Offering | '') {
  const sec = (local.value[section.value] ??= {});
  const m = (sec[lv] ??= {});
  if (v) m[code] = v;
  else delete m[code];
}
const cycle = (lv: string, code: string) => {
  const cur = cell(lv, code);
  set(lv, code, cur === '' ? 'C' : cur === 'C' ? 'E' : '');
};
function setRow(code: string, v: string) {
  if (!v) return;
  levels.value.forEach((lv) => set(lv, code, v === 'none' ? '' : (v as Offering)));
}

const counts = computed(() =>
  levels.value.map((lv) => {
    const vals = Object.values(local.value[section.value]?.[lv] ?? {});
    return { lv, c: vals.filter((x) => x === 'C').length, e: vals.filter((x) => x === 'E').length };
  }),
);
const heavy = computed(() => counts.value.filter((x) => x.c && (x.c + x.e > 18 || x.c < 5)));
const noCompulsory = computed(() => counts.value.filter((x) => !x.c).map((x) => x.lv));

const label = (v: Offering | '') => (v === 'C' ? 'Compulsory' : v === 'E' ? 'Elective' : '—');
const name = (code: string) => props.view.subjects.find((s) => s.code === code)?.name ?? code;

function changes() {
  const removed: string[] = [];
  const toElective: string[] = [];
  const added: string[] = [];
  const all = new Set([...Object.keys(props.view.curriculum), ...Object.keys(local.value)]);
  for (const sec of all) {
    const before = props.view.curriculum[sec] ?? {};
    const after = local.value[sec] ?? {};
    for (const lv of new Set([...Object.keys(before), ...Object.keys(after)]))
      for (const code of new Set([
        ...Object.keys(before[lv] ?? {}),
        ...Object.keys(after[lv] ?? {}),
      ])) {
        const b = before[lv]?.[code];
        const a = after[lv]?.[code];
        if (b && !a) removed.push(`${name(code)} in ${lv}`);
        else if (!b && a) added.push(`${name(code)} in ${lv}`);
        else if (b === 'C' && a === 'E') toElective.push(`${name(code)} in ${lv}`);
      }
  }
  return { removed, added, toElective };
}
const list = (xs: string[]) =>
  xs.length > 8 ? `${xs.slice(0, 8).join(', ')} and ${xs.length - 8} more` : xs.join(', ');

function submit() {
  const { removed, added, toElective } = changes();
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
    ],
    confirmLabel: 'Save curriculum',
    action: async () => {
      try {
        const res = await save.mutateAsync({ curriculum: local.value, groups: props.view.groups });
        toast.success(
          `Curriculum saved.${res.cleared ? ` ${pluralize(res.cleared, 'teacher assignment')} cleared.` : ''}`,
        );
      } catch (e) {
        throw new Error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
      }
    },
  });
}
const reset = () => (local.value = clone(props.view.curriculum));
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
    v-if="heavy.length"
    tone="warning"
    title="Check the load"
    :description="`${heavy.map((x) => `${x.lv} (${x.c} compulsory, ${x.e} elective)`).join('; ')}. Most schools have 5–18 subjects per class. You can still save.`"
  />
  <SectionCard
    flush
    title="Curriculum by class"
    description="Click a cell to cycle: not offered → Compulsory → Elective. Use the row menu to set a subject for every class in the section."
  >
    <div v-if="view.levels.length > 1" class="border-b border-divider px-4 py-2.5">
      <SegmentedControl
        v-model="section"
        label="Section"
        :options="view.levels.map((l) => ({ value: l.section, label: l.section }))"
      />
    </div>
    <div v-if="!subjects.length" class="p-6 text-center text-sm text-muted-foreground">
      No subjects yet. Add them in the Subjects tab.
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
              <button
                type="button"
                class="h-8 w-full rounded-sm border text-xs transition-colors"
                :class="
                  cell(lv, s.code) === 'C'
                    ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                    : cell(lv, s.code) === 'E'
                      ? 'border-info bg-info-subtle font-medium text-info'
                      : 'bg-card text-faint hover:bg-muted'
                "
                :aria-label="`${s.name} in ${lv}: ${label(cell(lv, s.code))}. Click to change.`"
                @click="cycle(lv, s.code)"
              >
                {{ label(cell(lv, s.code)) }}
              </button>
            </td>
            <td class="px-2 py-1">
              <select
                class="h-8 w-full rounded-md border bg-card px-2 text-xs"
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
    <div class="flex items-center justify-end gap-2 border-t border-divider px-4 py-3">
      <span v-if="dirty" class="mr-auto text-xs text-warning-strong">Unsaved changes</span>
      <Button variant="ghost" :disabled="!dirty" @click="reset">Discard</Button>
      <Button :disabled="!dirty || save.isPending.value || !!noCompulsory.length" @click="submit"
        >Save curriculum</Button
      >
    </div>
  </SectionCard>
</template>
