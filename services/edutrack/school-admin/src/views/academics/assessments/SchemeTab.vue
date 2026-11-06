<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Switch } from '@edutrack/ui/components/switch';
import { cn } from '@edutrack/ui/lib/utils';
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from '@lucide/vue';
import { computed } from 'vue';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import ChoiceCards from '@edutrack/app-kit/components/form/ChoiceCards.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { COMPONENT_PRESETS, components, ratings, startingScheme, totalWeight } from './constants';
import { useAssessmentDraft } from './draft';

const d = useAssessmentDraft();
const confirm = useConfirm();

const cfg = computed(() => d.draft.value!);
const sectionOptions = computed(() =>
  d.sections.value.map((s) => ({
    value: s.name,
    label: `${s.name}${!cfg.value.schemes[s.name] ? ' · not set' : d.errorsFor(s.name).length ? ' · fix' : ''}`,
  })),
);
const selected = computed({
  get: () => d.selected.value,
  set: (v: string) => (d.selected.value = v),
});
const scheme = computed(() => d.scheme.value);
const code = computed(() => d.sections.value.find((s) => s.name === d.key.value)?.code ?? '');
const total = computed(() => (scheme.value ? totalWeight(scheme.value) : 0));
const weightOk = computed(() => Math.abs(total.value - 100) < 0.01);
const keyErrors = computed(() =>
  d.errorsFor(d.key.value).filter((e) => !/grade|band|gap|overlap|lowest|top/.test(e)),
);

const mode = computed({
  get: () => scheme.value?.mode ?? 'scores',
  set: (m: 'scores' | 'descriptive') => {
    const s = d.ensureScheme();
    s.mode = m;
    if (m === 'descriptive' && s.ratings.length < 2) s.ratings = ratings();
    if (m === 'scores' && !s.components.length)
      s.components = components('CA1 20 · CA2 20 · Exam 60');
  },
});

/** "A teacher enters 68 out of 100 for the exam… it contributes 40.8 to the total." */
const example = computed(() => {
  const s = scheme.value;
  const c = s?.components[s.components.length - 1];
  if (!s || s.mode !== 'scores' || !c || !(c.max > 0)) return '';
  const raw = Math.round(c.max * 0.68);
  const part = Math.round((raw / c.max) * c.weight * 10) / 10;
  return `A teacher enters ${raw} out of ${c.max} for ${c.name.toLowerCase() || 'this component'}. With a ${c.weight}% weight, it contributes ${part} to the total.`;
});

function usePreset(key: string) {
  void confirm({
    title: `Replace components with “${key}”?`,
    details: COMPONENT_PRESETS[key]!.map(([n, m, w]) => [n, `out of ${m} · ${w}%`]),
    confirmLabel: 'Use preset',
    action: () => (d.ensureScheme().components = components(key)),
  });
}
function addComponent() {
  d.ensureScheme().components.push({ name: '', max: 20, weight: 0, when: '' });
}
function removeComponent(i: number) {
  d.ensureScheme().components.splice(i, 1);
}
function addRating() {
  d.ensureScheme().ratings.push({ name: '', description: '' });
}
function moveRating(i: number, dir: -1 | 1) {
  const list = d.ensureScheme().ratings;
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
}
function useRecommended() {
  const s = d.ensureScheme();
  s.mode = 'descriptive';
  s.ratings = ratings();
}
function startDefault() {
  d.draft.value!.schemes[d.key.value] = startingScheme(code.value);
}
</script>

<template>
  <InlineNotice
    tone="info"
    title="Raw scores and weights are different"
    description="Teachers enter raw scores out of each component’s maximum. The system converts them using the weight. Published results are not recalculated if you change the scheme later."
  />
  <InlineNotice
    v-if="d.view.value?.hasPublished"
    tone="warning"
    title="Some results are already published"
    description="Changing weights or scales recalculates unpublished results only. Published report cards keep the scheme they were published with."
  />

  <SectionCard
    title="Applies to"
    description="Use one scheme everywhere, or a different one per section (e.g. descriptive ratings for Nursery, WAEC grades for Senior Secondary)."
  >
    <div class="flex flex-col gap-3.5">
      <label class="flex items-center gap-2.5 text-[13px] font-medium">
        <Switch :model-value="cfg.same" @update:model-value="(v: boolean) => d.setSame(v)" />
        Use the same scheme for every section
      </label>
      <SegmentedControl
        v-if="!cfg.same && sectionOptions.length > 1"
        v-model="selected"
        :options="sectionOptions"
        label="Section"
      />
    </div>
  </SectionCard>

  <InlineNotice
    v-if="!scheme"
    tone="warning"
    :title="
      code === 'NUR'
        ? 'Nursery uses descriptors, not scores'
        : `${d.label(d.key.value)} has no scheme yet`
    "
    :description="
      code === 'NUR'
        ? 'Set up developmental descriptors for Nursery so their reports can be generated.'
        : 'Its results can’t be scored until it has components and a grade scale.'
    "
  >
    <template #action>
      <div class="flex shrink-0 gap-2">
        <Button v-if="code === 'NUR'" size="sm" @click="useRecommended"
          >Use recommended descriptors</Button
        >
        <Button size="sm" :variant="code === 'NUR' ? 'outline' : 'default'" @click="startDefault"
          >Start from the suggested scheme</Button
        >
      </div>
    </template>
  </InlineNotice>

  <template v-else>
    <SectionCard title="How results are recorded" :description="d.label(d.key.value)">
      <ChoiceCards
        v-model="mode"
        label="Method"
        :columns="2"
        :choices="[
          {
            value: 'scores',
            label: 'Scores',
            description: 'Components are scored, weighted and graded',
          },
          {
            value: 'descriptive',
            label: 'Descriptive ratings',
            description: 'e.g. Excellent, Good; no scores or positions',
          },
        ]"
      />
    </SectionCard>

    <SectionCard
      v-if="scheme.mode === 'scores'"
      title="Assessment components"
      description="Teachers enter raw scores out of the maximum. The system converts them using the weight."
    >
      <div class="flex flex-col gap-3">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="w-8 pb-2 font-medium">#</th>
                <th class="pb-2 font-medium">Component</th>
                <th class="w-28 pb-2 font-medium">Scored out of</th>
                <th class="w-28 pb-2 font-medium">Weight %</th>
                <th class="pb-2 font-medium">When</th>
                <th class="w-10 pb-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in scheme.components" :key="i" class="border-t border-divider">
                <td class="py-2 text-muted-foreground">{{ i + 1 }}</td>
                <td class="py-2 pr-2">
                  <Input
                    v-model="c.name"
                    :aria-label="`Component ${i + 1} name`"
                    placeholder="e.g. CA 1"
                  />
                </td>
                <td class="py-2 pr-2">
                  <Input
                    v-model.number="c.max"
                    type="number"
                    min="1"
                    :aria-label="`${c.name} maximum`"
                  />
                </td>
                <td class="py-2 pr-2">
                  <Input
                    v-model.number="c.weight"
                    type="number"
                    min="0"
                    max="100"
                    :aria-label="`${c.name} weight`"
                  />
                </td>
                <td class="py-2 pr-2">
                  <Input
                    v-model="c.when"
                    :aria-label="`${c.name} timing`"
                    placeholder="e.g. Week 5"
                  />
                </td>
                <td class="py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    :aria-label="`Remove ${c.name || 'component'}`"
                    :disabled="scheme.components.length <= 1"
                    @click="removeComponent(i)"
                    ><Trash2Icon class="size-4"
                  /></Button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t border-divider">
                <td />
                <td class="pt-2 font-semibold">Total</td>
                <td />
                <td
                  :class="
                    cn(
                      'pt-2 font-semibold tabular-nums',
                      weightOk ? 'text-success-strong' : 'text-error-strong',
                    )
                  "
                >
                  {{ total }}%
                </td>
                <td
                  colspan="2"
                  :class="
                    cn('pt-2 text-xs', weightOk ? 'text-success-strong' : 'text-error-strong')
                  "
                >
                  {{
                    weightOk
                      ? 'Weights add up to 100% ✓'
                      : `Weights add up to ${total}%. They must total 100%.`
                  }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <ul
          v-if="keyErrors.length"
          class="flex flex-col gap-0.5 text-xs text-error-strong"
          role="alert"
        >
          <li v-for="e in keyErrors" :key="e">{{ e }}</li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="addComponent">Add component</Button>
          <Button
            v-for="k in Object.keys(COMPONENT_PRESETS)"
            :key="k"
            variant="ghost"
            size="sm"
            @click="usePreset(k)"
            >Use preset: {{ k }}</Button
          >
        </div>
        <p v-if="example && weightOk" class="rounded-md bg-muted px-3 py-2 text-[13px] text-body">
          {{ example }}
        </p>
      </div>
    </SectionCard>

    <SectionCard
      v-else
      title="Ratings"
      description="Teachers pick one rating per learning area. Listed from highest to lowest."
    >
      <div class="flex flex-col gap-2.5">
        <div
          v-for="(x, i) in scheme.ratings"
          :key="i"
          class="grid items-center gap-2 sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1.6fr)_auto]"
        >
          <span class="text-xs text-muted-foreground">{{ i + 1 }}</span>
          <Input v-model="x.name" :aria-label="`Rating ${i + 1}`" placeholder="e.g. Secure" />
          <Input
            v-model="x.description"
            :aria-label="`Rating ${i + 1} meaning`"
            placeholder="What it means"
          />
          <div class="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              :aria-label="`Move ${x.name} up`"
              :disabled="i === 0"
              @click="moveRating(i, -1)"
              ><ArrowUpIcon class="size-4"
            /></Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="`Move ${x.name} down`"
              :disabled="i === scheme.ratings.length - 1"
              @click="moveRating(i, 1)"
              ><ArrowDownIcon class="size-4"
            /></Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="`Remove ${x.name || 'rating'}`"
              :disabled="scheme.ratings.length <= 2"
              @click="scheme.ratings.splice(i, 1)"
              ><Trash2Icon class="size-4"
            /></Button>
          </div>
        </div>
        <ul
          v-if="keyErrors.length"
          class="flex flex-col gap-0.5 text-xs text-error-strong"
          role="alert"
        >
          <li v-for="e in keyErrors" :key="e">{{ e }}</li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="addRating">Add rating</Button>
          <Button variant="ghost" size="sm" @click="useRecommended"
            >Use recommended descriptors</Button
          >
        </div>
      </div>
    </SectionCard>
  </template>

  <SectionCard
    title="Report card options"
    description="School-wide. Change any time before results are published."
  >
    <div class="grid gap-4 sm:grid-cols-3">
      <label class="flex items-center gap-2.5 text-[13px] font-medium sm:col-span-3">
        <Switch v-model="cfg.showPosition" />
        Show class position (e.g. 3rd of 32) on report cards
      </label>
      <FieldShell id="as-round" label="Round totals to">
        <select
          id="as-round"
          v-model="cfg.rounding"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option>1 decimal place</option>
          <option>Whole number</option>
        </select>
      </FieldShell>
      <FieldShell
        id="as-pass"
        label="Pass mark"
        hint="Used for pass counts and promotion eligibility."
      >
        <Input id="as-pass" v-model.number="cfg.passMark" type="number" min="0" max="100" />
      </FieldShell>
    </div>
  </SectionCard>
</template>
