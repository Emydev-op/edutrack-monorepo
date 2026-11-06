<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useSaveSectionsMutation, useSectionsQuery } from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import type { AcademicSection } from '@/types';

interface Row {
  key: string;
  id?: string;
  name: string;
  code: string;
  description: string;
  levels: number;
  branches: string[];
}

const STANDARD: [string, string, string][] = [
  ['Nursery', 'NUR', 'Early years · ages 2–5'],
  ['Primary', 'PRI', 'Primary 1–6 · ages 6–11'],
  ['Junior Secondary', 'JSS', 'JSS 1–3 · Basic Education Certificate'],
  ['Senior Secondary', 'SSS', 'SSS 1–3 · WAEC and NECO'],
];

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const { data, isPending } = useSectionsQuery();
const save = useSaveSectionsMutation();

const rows = ref<Row[]>([]);
const original = ref('');
const showErrors = ref(false);
let seq = 0;

const toRow = (s: AcademicSection): Row => ({
  key: s.id,
  id: s.id,
  name: s.name,
  code: s.code,
  description: s.description,
  levels: s.levels,
  branches: s.branches,
});
const snapshot = (list: Row[]) =>
  JSON.stringify(list.map((r) => [r.id, r.name.trim(), r.code, r.description.trim()]));

watch(
  data,
  (d) => {
    if (!d) return;
    rows.value = d.sections.map(toRow);
    original.value = snapshot(rows.value);
  },
  { immediate: true },
);

const dirty = computed(() => !!data.value && snapshot(rows.value) !== original.value);
useUnsavedChanges(dirty);

const missingStandard = computed(() =>
  STANDARD.filter(
    ([n]) => !rows.value.some((r) => r.name.trim().toLowerCase() === n.toLowerCase()),
  ),
);

function errorsFor(r: Row) {
  const name = r.name.trim();
  const e = { name: '', code: '' };
  if (!name) e.name = 'Name the section.';
  else if (rows.value.some((x) => x !== r && x.name.trim().toLowerCase() === name.toLowerCase()))
    e.name = 'Another section has this name.';
  if (!/^[A-Z]{2,5}$/.test(r.code)) e.code = '2–5 capital letters, e.g. JSS.';
  else if (rows.value.some((x) => x !== r && x.code === r.code)) e.code = 'Code already used.';
  return e;
}
const invalid = computed(
  () => !rows.value.length || rows.value.some((r) => Object.values(errorsFor(r)).some(Boolean)),
);
const err = (r: Row, k: 'name' | 'code') => (showErrors.value ? errorsFor(r)[k] : '');

function add(name = '', code = '', description = '') {
  rows.value.push({ key: `new-${++seq}`, name, code, description, levels: 0, branches: [] });
}
function move(i: number, d: -1 | 1) {
  const list = [...rows.value];
  [list[i], list[i + d]] = [list[i + d]!, list[i]!];
  rows.value = list;
}
function remove(i: number) {
  const r = rows.value[i]!;
  if (r.levels)
    return void confirm({
      title: `${r.name} still has classes`,
      description: `${r.name} has ${r.levels} class level${r.levels === 1 ? '' : 's'}. Remove them in Classes & Arms before removing the section.`,
      confirmLabel: 'Go to Classes & Arms',
      action: () => router.push({ name: routesPath.academics.classes.name }),
    });
  if (!r.branches.length) return void rows.value.splice(i, 1);
  void confirm({
    title: `Remove ${r.name || 'this section'}?`,
    details: [['Branches affected', `${r.branches.join(', ')} stop offering it when you save`]],
    confirmLabel: 'Remove section',
    tone: 'destructive',
    action: () => rows.value.splice(i, 1),
  });
}

async function submit() {
  showErrors.value = true;
  if (invalid.value) {
    toast.error(
      rows.value.length ? 'Fix the highlighted sections first.' : 'Add at least one section.',
    );
    return false;
  }
  try {
    await save.mutateAsync(
      rows.value.map((r) => ({
        id: r.id,
        name: r.name.trim(),
        code: r.code,
        description: r.description.trim(),
      })),
    );
    original.value = snapshot(rows.value);
    showErrors.value = false;
    toast.success('Academic sections saved.');
    return true;
  } catch (e) {
    toast.error(getApiErrorMessage(e));
    return false;
  }
}

/** Marking the step complete saves pending edits first. */
const beforeComplete = async () => (dirty.value ? submit() : !invalid.value);
const fromSetup = computed(() => route.query.from === 'setup');
</script>

<template>
  <PageHeader
    title="Academic Sections"
    description="The sections your school runs, in promotion order. Classes, subjects and grading follow from them."
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.academics.classes.name }"
          >Classes & Arms</RouterLink
        ></Button
      >
      <Button :disabled="!dirty || save.isPending.value" @click="submit">Save sections</Button>
    </template>
  </PageHeader>

  <SetupStepBar
    step="academic-sections"
    :details="[
      ['Sections', rows.map((r) => `${r.name} (${r.code})`).join(', ') || 'None'],
      ['Order', 'Students move up through the sections in this order'],
    ]"
    :blocked="
      invalid && showErrors ? 'Fix the highlighted sections before completing this step.' : ''
    "
    :before="beforeComplete"
  />

  <Skeleton v-if="isPending" class="h-72" />
  <template v-else-if="data">
    <InlineNotice
      tone="info"
      title="Order is the promotion path"
      description="Students move from the last class of one section to the first class of the next. Renaming a section carries its classes, curriculum, grading and branches with it."
    />

    <SectionCard
      title="Sections"
      :description="`${rows.length} section${rows.length === 1 ? '' : 's'}${dirty ? ' · unsaved changes' : ''}`"
    >
      <div class="flex flex-col gap-3">
        <p v-if="!rows.length" class="text-[13px] text-muted-foreground">
          No sections yet. Add the standard ones below or create your own.
        </p>
        <div
          v-for="(r, i) in rows"
          :key="r.key"
          class="flex flex-col gap-3 rounded-lg border bg-card p-3.5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-2">
              <span
                class="flex size-6 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-primary"
                >{{ i + 1 }}</span
              >
              <span class="font-semibold">{{ r.name || 'New section' }}</span>
              <StatusBadge
                :label="
                  r.levels
                    ? `${r.levels} class level${r.levels === 1 ? '' : 's'}`
                    : 'No classes yet'
                "
                :tone="r.levels ? 'success' : 'neutral'"
                :dot="false"
              />
            </span>
            <span class="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                :disabled="i === 0"
                :aria-label="`Move ${r.name} up`"
                @click="move(i, -1)"
                ><ArrowUpIcon class="size-4"
              /></Button>
              <Button
                variant="ghost"
                size="icon"
                :disabled="i === rows.length - 1"
                :aria-label="`Move ${r.name} down`"
                @click="move(i, 1)"
                ><ArrowDownIcon class="size-4"
              /></Button>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="`Remove ${r.name}`"
                @click="remove(i)"
                ><Trash2Icon class="size-4"
              /></Button>
            </span>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,2fr)]">
            <FieldShell :id="`sec-name-${r.key}`" label="Name" required :error="err(r, 'name')">
              <Input
                :id="`sec-name-${r.key}`"
                v-model="r.name"
                placeholder="e.g. Junior Secondary"
                :aria-invalid="!!err(r, 'name')"
              />
            </FieldShell>
            <FieldShell :id="`sec-code-${r.key}`" label="Code" required :error="err(r, 'code')">
              <Input
                :id="`sec-code-${r.key}`"
                :model-value="r.code"
                maxlength="5"
                placeholder="JSS"
                :aria-invalid="!!err(r, 'code')"
                @update:model-value="
                  r.code = String($event)
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                "
              />
            </FieldShell>
            <FieldShell :id="`sec-desc-${r.key}`" label="Description">
              <Input
                :id="`sec-desc-${r.key}`"
                v-model="r.description"
                placeholder="e.g. JSS 1–3 · Basic Education Certificate"
              />
            </FieldShell>
          </div>
          <p class="text-xs text-faint">
            {{
              r.branches.length
                ? `Run at ${r.branches.join(', ')}`
                : 'No branch runs this section yet · add it to a branch in School → Branches'
            }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2 border-t border-divider pt-3">
          <Button
            v-for="[n, c, d] in missingStandard"
            :key="c"
            variant="outline"
            size="sm"
            @click="add(n, c, d)"
            ><PlusIcon class="size-3.5" />{{ n }} ({{ c }})</Button
          >
          <Button variant="outline" size="sm" @click="add()"
            ><PlusIcon class="size-3.5" />Custom section</Button
          >
        </div>
      </div>
    </SectionCard>

    <div class="flex justify-end gap-2">
      <Button v-if="fromSetup" as-child variant="ghost"
        ><RouterLink :to="{ name: routesPath.setup.name }">Back to Setup Center</RouterLink></Button
      >
      <Button :disabled="!dirty || save.isPending.value" @click="submit">Save sections</Button>
    </div>
  </template>
</template>
