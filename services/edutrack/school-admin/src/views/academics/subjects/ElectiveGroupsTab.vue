<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useSaveCurriculumMutation } from '@/api/services/academics';
import type { CurriculumView, ElectiveGroup } from '@/types';

const props = defineProps<{ view: CurriculumView }>();
defineEmits<{ add: [] }>();
const save = useSaveCurriculumMutation();

interface Draft extends Omit<ElectiveGroup, 'min' | 'max'> {
  min: string;
  max: string;
}
const toDraft = (g: ElectiveGroup): Draft => ({
  ...g,
  subjects: [...g.subjects],
  min: String(g.min),
  max: String(g.max),
});
const groups = ref<Draft[]>(props.view.groups.map(toDraft));
const original = computed(() => JSON.stringify(props.view.groups.map(toDraft)));
const dirty = computed(() => JSON.stringify(groups.value) !== original.value);
watch(
  () => props.view.groups,
  (g) => {
    if (!dirty.value) groups.value = g.map(toDraft);
  },
);
useUnsavedChanges(dirty);
const showErrors = ref(false);
const serverError = ref('');

const sections = computed(() => props.view.levels.map((l) => l.section));
/** Subjects offered (compulsory or elective) in any class of the section. */
const offeredIn = (section: string) => {
  const lvs = props.view.curriculum[section] ?? {};
  return props.view.subjects.filter((s) => Object.values(lvs).some((m) => m[s.code]));
};
const electivesIn = (section: string) => {
  const lvs = props.view.curriculum[section] ?? {};
  return props.view.subjects.filter((s) => Object.values(lvs).some((m) => m[s.code] === 'E'));
};
const free = computed(() =>
  sections.value
    .map((sec) => {
      const inGroup = new Set(
        groups.value.filter((g) => g.section === sec).flatMap((g) => g.subjects),
      );
      const loose = electivesIn(sec).filter((s) => !inGroup.has(s.code));
      return loose.length ? `${sec}: ${loose.map((s) => s.code).join(', ')}` : '';
    })
    .filter(Boolean),
);

function errorsOf(g: Draft) {
  const e: Record<string, string> = {};
  if (!g.name.trim()) e.name = 'Name the group.';
  if (g.subjects.length < 2) e.subjects = 'Pick at least 2 subjects.';
  if (!/^\d+$/.test(g.min)) e.min = 'Whole number.';
  if (!/^\d+$/.test(g.max) || +g.max < 1) e.max = 'At least 1.';
  else if (+g.max < +g.min) e.max = 'Not below the minimum.';
  else if (+g.max > g.subjects.length && g.subjects.length >= 2)
    e.max = `Only ${g.subjects.length} subjects.`;
  return e;
}
const allErrors = computed(() => groups.value.map(errorsOf));
const err = (i: number, k: string) => (showErrors.value ? allErrors.value[i]?.[k] : undefined);

function toggle(g: Draft, code: string) {
  g.subjects = g.subjects.includes(code)
    ? g.subjects.filter((c) => c !== code)
    : [...g.subjects, code];
}
function add() {
  groups.value.push({
    id: '',
    name: '',
    section: sections.value[0] ?? '',
    subjects: [],
    min: '1',
    max: '1',
    note: '',
  });
}
const rule = (g: Draft) => (g.min === g.max ? `Choose ${g.min}` : `Choose ${g.min}–${g.max}`);

async function submit() {
  showErrors.value = true;
  if (allErrors.value.some((e) => Object.keys(e).length)) return;
  serverError.value = '';
  try {
    await save.mutateAsync({
      curriculum: props.view.curriculum,
      groups: groups.value.map((g) => ({ ...g, min: +g.min, max: +g.max })),
    });
    showErrors.value = false;
    toast.success('Elective groups saved.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <InlineNotice
    v-if="serverError"
    tone="error"
    title="Something went wrong"
    :description="serverError"
    role="alert"
  />
  <InlineNotice
    v-if="free.length"
    tone="neutral"
    title="Free electives (not in a group)"
    :description="`${free.join(' · ')}. Students can take these freely.`"
  />
  <SectionCard
    title="Elective groups"
    description="Students choose from each group, e.g. one of CRS or IRS. Groups apply to every class in their section."
  >
    <p v-if="!groups.length" class="py-4 text-center text-sm text-muted-foreground">
      No elective groups. Add one if students must choose between subjects.
    </p>
    <div class="flex flex-col gap-3">
      <div
        v-for="(g, i) in groups"
        :key="i"
        class="flex flex-col gap-3 rounded-md border bg-card p-3.5"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="flex flex-col">
            <span class="font-semibold">{{ g.name || 'New group' }} · {{ g.section }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ rule(g) }} of {{ g.subjects.length }}</span
            >
          </span>
          <Button variant="ghost" size="sm" class="text-destructive" @click="groups.splice(i, 1)"
            ><Trash2Icon />Remove</Button
          >
        </div>
        <div class="grid gap-3 sm:grid-cols-[minmax(160px,1.6fr)_minmax(150px,1fr)_90px_90px]">
          <FieldShell :id="`g-name-${i}`" label="Group name" required :error="err(i, 'name')">
            <Input :id="`g-name-${i}`" v-model="g.name" placeholder="e.g. Religious Studies" />
          </FieldShell>
          <FieldShell :id="`g-sec-${i}`" label="Section">
            <select
              :id="`g-sec-${i}`"
              v-model="g.section"
              class="h-9 rounded-md border bg-card px-2.5 text-sm"
              @change="g.subjects = []"
            >
              <option v-for="s in sections" :key="s">{{ s }}</option>
            </select>
          </FieldShell>
          <FieldShell :id="`g-min-${i}`" label="Min" :error="err(i, 'min')">
            <Input :id="`g-min-${i}`" v-model="g.min" inputmode="numeric" />
          </FieldShell>
          <FieldShell :id="`g-max-${i}`" label="Max" :error="err(i, 'max')">
            <Input :id="`g-max-${i}`" v-model="g.max" inputmode="numeric" />
          </FieldShell>
        </div>
        <FieldShell
          :id="`g-subs-${i}`"
          label="Subjects in this group"
          :error="err(i, 'subjects')"
          :hint="`Only subjects offered in ${g.section} are listed.`"
        >
          <div :id="`g-subs-${i}`" class="flex flex-wrap gap-1.5">
            <button
              v-for="s in offeredIn(g.section)"
              :key="s.code"
              type="button"
              :aria-pressed="g.subjects.includes(s.code)"
              class="h-7 rounded-sm border px-2.5 text-xs transition-colors"
              :class="
                g.subjects.includes(s.code)
                  ? 'border-primary bg-brand-subtle font-medium text-brand-strong'
                  : 'bg-card hover:bg-muted'
              "
              @click="toggle(g, s.code)"
            >
              {{ s.name }}
            </button>
          </div>
        </FieldShell>
        <FieldShell
          :id="`g-note-${i}`"
          label="Approval note"
          hint="Optional, e.g. Requires Academic Head approval"
        >
          <Input :id="`g-note-${i}`" v-model="g.note" />
        </FieldShell>
      </div>
    </div>
    <div class="mt-3 flex items-center gap-2">
      <Button variant="outline" size="sm" :disabled="!sections.length" @click="add"
        ><PlusIcon />Add elective group</Button
      >
      <span class="flex-1" />
      <Button variant="ghost" :disabled="!dirty" @click="groups = view.groups.map(toDraft)"
        >Discard</Button
      >
      <Button :disabled="!dirty || save.isPending.value" @click="submit">Save groups</Button>
    </div>
  </SectionCard>
</template>
