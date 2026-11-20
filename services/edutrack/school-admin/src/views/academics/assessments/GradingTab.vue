<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Switch } from '@edutrack/ui/components/switch';
import { Trash2Icon } from '@lucide/vue';
import { computed } from 'vue';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { SCALE_PRESETS, scale, scaleErrors } from './constants';
import { useAssessmentDraft } from './draft';

const d = useAssessmentDraft();
const confirm = useConfirm();

const cfg = computed(() => d.draft.value!);
const sectionOptions = computed(() =>
  d.sections.value.map((s) => ({ value: s.name, label: s.name })),
);
const selected = computed({
  get: () => d.selected.value,
  set: (v: string) => (d.selected.value = v),
});
const scheme = computed(() => d.scheme.value);
const coverage = computed(() =>
  scheme.value?.mode === 'scores' ? scaleErrors(d.label(d.key.value), scheme.value.scale) : [],
);
const sorted = computed(() =>
  scheme.value ? [...scheme.value.scale].sort((a, b) => b.max - a.max) : [],
);

function usePreset(key: string) {
  void confirm({
    title: `Replace the grade scale with ${key}?`,
    details: SCALE_PRESETS[key]!.map(([g, min, max, remark]) => [g, `${min}–${max} · ${remark}`]),
    confirmLabel: 'Use scale',
    action: () => (d.ensureScheme().scale = scale(key)),
  });
}
function addBand() {
  d.ensureScheme().scale.push({ grade: '', min: 0, max: 0, remark: '', points: 0, pass: true });
}

/* Promotion rules: always per section (subjects belong to sections). */
const EMPTY_RULE = { minAverage: null, mustPass: [] as string[] };
const rule = (section: string) => cfg.value.promotion[section] ?? EMPTY_RULE;
const subjects = (section: string) => d.view.value?.promotionSubjects?.[section] ?? [];
function setMin(section: string, value: string | number) {
  const n = value === '' || value === null ? null : Number(value);
  d.ruleOf(section).minAverage = n === null || Number.isNaN(n) ? null : n;
}
function toggleSubject(section: string, id: string, on: boolean | 'indeterminate') {
  const r = d.ruleOf(section);
  r.mustPass = on === true ? [...new Set([...r.mustPass, id])] : r.mustPass.filter((x) => x !== id);
}

const summaries = computed(() =>
  d.keys.value.map((k) => {
    const s = cfg.value.schemes[k];
    return {
      key: k,
      title: d.label(k),
      status: !s ? 'Not started' : d.errorsFor(k).length ? 'Pending' : 'Active',
      rows: !s
        ? [{ label: 'Status', value: 'Not set up', emphasis: 'error' as const }]
        : s.mode === 'descriptive'
          ? s.ratings.map((x) => ({ label: x.name || '—', value: x.description || '—' }))
          : [...s.scale]
              .sort((a, b) => b.max - a.max)
              .map((g) => ({
                label: g.grade || '—',
                value: `${g.min} – ${g.max} · ${g.remark}${g.pass ? '' : ' · fail'}`,
              })),
    };
  }),
);
</script>

<template>
  <SectionCard
    v-if="!cfg.same && sectionOptions.length > 1"
    title="Section"
    description="Each section can use its own grade scale."
  >
    <SegmentedControl v-model="selected" :options="sectionOptions" label="Section" />
  </SectionCard>

  <InlineNotice
    v-if="!scheme"
    tone="warning"
    :title="`${d.label(d.key.value)} has no scheme yet`"
    description="Set it up on the Assessment scheme tab first."
  />
  <InlineNotice
    v-else-if="scheme.mode === 'descriptive'"
    tone="info"
    :title="`${d.label(d.key.value)} uses descriptive ratings`"
    description="There are no scores to grade. Edit its ratings on the Assessment scheme tab."
  />
  <SectionCard
    v-else
    :title="`${d.label(d.key.value)} grade scale`"
    description="Total scores map to grades. Ranges must cover 0–100 with no gaps or overlaps. Used by report cards and promotion eligibility."
  >
    <div class="flex flex-col gap-3">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr class="text-left text-xs text-muted-foreground">
              <th class="w-20 pb-2 font-medium">Grade</th>
              <th class="w-20 pb-2 font-medium">From</th>
              <th class="w-20 pb-2 font-medium">To</th>
              <th class="pb-2 font-medium">Remark</th>
              <th class="w-20 pb-2 font-medium">Points</th>
              <th class="w-16 pb-2 font-medium">Pass</th>
              <th class="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(g, i) in scheme.scale" :key="i" class="border-t border-divider">
              <td class="py-2 pr-2">
                <Input v-model="g.grade" :aria-label="`Band ${i + 1} grade`" />
              </td>
              <td class="py-2 pr-2">
                <Input
                  v-model.number="g.min"
                  type="number"
                  min="0"
                  max="100"
                  :aria-label="`${g.grade} from`"
                />
              </td>
              <td class="py-2 pr-2">
                <Input
                  v-model.number="g.max"
                  type="number"
                  min="0"
                  max="100"
                  :aria-label="`${g.grade} to`"
                />
              </td>
              <td class="py-2 pr-2">
                <Input v-model="g.remark" :aria-label="`${g.grade} remark`" />
              </td>
              <td class="py-2 pr-2">
                <Input
                  v-model.number="g.points"
                  type="number"
                  min="0"
                  :aria-label="`${g.grade} grade points`"
                />
              </td>
              <td class="py-2"><Switch v-model="g.pass" :aria-label="`${g.grade} is a pass`" /></td>
              <td class="py-2">
                <Button
                  variant="ghost"
                  size="icon"
                  :aria-label="`Remove ${g.grade || 'band'}`"
                  :disabled="scheme.scale.length <= 2"
                  @click="scheme.scale.splice(i, 1)"
                  ><Trash2Icon class="size-4"
                /></Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!coverage.length" class="text-xs text-success-strong">
        Covers 0–100 with no gaps or overlaps ✓ · {{ sorted.filter((g) => g.pass).length }} passing
        grades
      </p>
      <ul v-else class="flex flex-col gap-0.5 text-xs text-error-strong" role="alert">
        <li v-for="e in coverage" :key="e">{{ e }}</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" @click="addBand">Add grade</Button>
        <Button
          v-for="k in Object.keys(SCALE_PRESETS)"
          :key="k"
          variant="ghost"
          size="sm"
          @click="usePreset(k)"
          >Use preset: {{ k }}</Button
        >
      </div>
    </div>
  </SectionCard>

  <SectionCard
    title="Promotion rules"
    description="Each section's rule at the end of a session: a minimum annual average (the mean of the subjects' averages across the session's terms) and subjects to pass at or above the pass mark. With suggestions on in Settings › Academic, Promotion suggests promote or repeat from it."
  >
    <div class="flex flex-col divide-y divide-divider">
      <div
        v-for="s in d.sections.value"
        :key="s.name"
        class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
      >
        <span class="text-[13px] font-semibold">{{ s.name }}</span>
        <p v-if="!d.schemeOf(s.name)" class="text-xs text-muted-foreground">
          Set up its assessment scheme first.
        </p>
        <p
          v-else-if="d.schemeOf(s.name)?.mode === 'descriptive'"
          class="text-xs text-muted-foreground"
        >
          Uses descriptive ratings, so there is no average: staff decide each student’s promotion.
        </p>
        <template v-else>
          <div class="flex flex-wrap items-center gap-2 text-[13px]">
            <span>Minimum annual average</span>
            <Input
              type="number"
              min="0"
              max="100"
              class="h-8 w-24"
              :model-value="rule(s.name).minAverage ?? ''"
              :aria-label="`${s.name} minimum annual average`"
              @update:model-value="setMin(s.name, $event)"
            />
            <span>%</span>
            <span class="text-xs text-muted-foreground">Leave blank for no minimum.</span>
          </div>
          <fieldset class="flex flex-col gap-1.5">
            <legend class="mb-1.5 text-xs text-muted-foreground">
              Must pass (at or above {{ cfg.passMark }}%)
            </legend>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <label
                v-for="sub in subjects(s.name)"
                :key="sub.id"
                class="flex items-center gap-2 text-[13px]"
              >
                <Checkbox
                  :model-value="rule(s.name).mustPass.includes(sub.id)"
                  @update:model-value="toggleSubject(s.name, sub.id, $event)"
                />
                {{ sub.name }}
              </label>
            </div>
            <p v-if="!subjects(s.name).length" class="text-xs text-muted-foreground">
              No subjects in {{ s.name }}’s curriculum yet.
            </p>
          </fieldset>
        </template>
      </div>
    </div>
  </SectionCard>

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <KeyValueCard
      v-for="s in summaries"
      :key="s.key"
      :title="s.title"
      :status="s.status"
      :rows="s.rows"
    />
  </div>
</template>
