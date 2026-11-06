<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import CellLink from '@edutrack/app-kit/components/common/CellLink.vue';
import DataTable, { type Column } from '@edutrack/app-kit/components/common/DataTable.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import RowActions, { type RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatCount, pluralize } from '@edutrack/app-kit/lib/format';

import {
  useApplyDefaultLevelsMutation,
  useClassesQuery,
  useDeleteLevelMutation,
  useMoveLevelMutation,
  useSectionsQuery,
} from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ClassArm, ClassLevel } from '@/types';

import ArmDrawer from './ArmDrawer.vue';
import LevelDrawer from './LevelDrawer.vue';

const r = routesPath.academics;
const confirm = useConfirm();
const context = useContextStore();
const { data, isPending } = useClassesQuery();
const { data: sectionsView } = useSectionsQuery();
const applyDefaults = useApplyDefaultLevelsMutation();
const move = useMoveLevelMutation();
const removeLevel = useDeleteLevelMutation();

const sectionsReady = computed(() => !!sectionsView.value?.confirmed);
/** "All branches" (or a branch without classes) shows every branch. */
const branchId = computed(
  () => data.value?.branches.find((b) => b.name === context.current.branch)?.id ?? null,
);
const multiBranch = computed(() => (data.value?.branches.length ?? 0) > 1 && !branchId.value);
const levels = computed(() =>
  (data.value?.levels ?? []).filter((l) => !branchId.value || l.branchId === branchId.value),
);
const arms = computed(() => levels.value.flatMap((l) => l.arms));
const branchName = (id: string) => data.value?.branches.find((b) => b.id === id)?.name ?? '';
const tree = computed(() =>
  (data.value?.sections ?? [])
    .map((s) => ({ ...s, levels: levels.value.filter((l) => l.section === s.name) }))
    .filter((s) => s.levels.length || s.branches.length),
);
const totals = computed(() => ({
  levels: levels.value.length,
  arms: arms.value.length,
  places: arms.value.reduce((n, a) => n + a.capacity, 0),
  students: arms.value.reduce((n, a) => n + a.students, 0),
}));
const noTeacher = computed(() => arms.value.filter((a) => !a.classTeacherId));
const full = computed(() => arms.value.filter((a) => a.students >= a.capacity));
/** Branch sections with no class level yet. */
const emptySections = computed(() =>
  (data.value?.branches ?? [])
    .filter((b) => !branchId.value || b.id === branchId.value)
    .flatMap((b) =>
      b.sections
        .filter((s) => !data.value!.levels.some((l) => l.branchId === b.id && l.section === s))
        .map((s) => `${s} at ${b.name}`),
    ),
);

const blocked = computed(() =>
  !sectionsReady.value
    ? 'Finish Academic Sections first.'
    : !data.value?.levels.length
      ? 'Add at least one class level first.'
      : emptySections.value.length
        ? `Add class levels for ${emptySections.value.join(', ')}, or remove the section from the branch.`
        : undefined,
);

/* ---------------- Drawers ---------------- */

const levelOpen = ref(false);
const levelEditing = ref<ClassLevel | null>(null);
const levelPreset = ref<{ branchId?: string; section?: string }>({});
function addLevel(preset: { branchId?: string; section?: string } = {}) {
  levelEditing.value = null;
  levelPreset.value = { branchId: branchId.value ?? undefined, ...preset };
  levelOpen.value = true;
}
function renameLevel(l: ClassLevel) {
  levelEditing.value = l;
  levelOpen.value = true;
}

const armOpen = ref(false);
const armLevel = ref<ClassLevel | null>(null);
const armEditing = ref<ClassArm | null>(null);
function addArmTo(l: ClassLevel) {
  armLevel.value = l;
  armEditing.value = null;
  armOpen.value = true;
}
function editArm(a: ClassArm) {
  armLevel.value = levels.value.find((l) => l.id === a.levelId) ?? null;
  armEditing.value = a;
  armOpen.value = true;
}
function pickLevelForArm() {
  if (!levels.value.length) return addLevel();
  void confirm({
    title: 'Add an arm',
    description: 'Arms are session-specific. Adding one does not change past sessions.',
    options: levels.value.map((l) => ({
      value: l.id,
      label: multiBranch.value ? `${l.name} · ${branchName(l.branchId)}` : l.name,
      description: `Arms now: ${l.arms.map((a) => a.arm).join(', ')}`,
    })),
    confirmLabel: 'Continue',
    action: ({ option }) => {
      const l = levels.value.find((x) => x.id === option);
      if (l) setTimeout(() => addArmTo(l), 0);
    },
  });
}

/* ---------------- Level actions ---------------- */

async function moveLevel(l: ClassLevel, direction: 'up' | 'down') {
  try {
    await move.mutateAsync({ id: l.id, direction });
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t move. Try again.'));
  }
}

function deleteLevel(l: ClassLevel) {
  const students = l.arms.reduce((n, a) => n + a.students, 0);
  if (students)
    return void toast.error(
      `${l.name} has ${pluralize(students, 'student')}. Move them to another class first.`,
    );
  void confirm({
    title: `Remove ${l.name}?`,
    description:
      'Its arms, teacher assignments and timetables are removed. Students promoted from the level before it will go to the next level instead.',
    details: [
      ['Branch', branchName(l.branchId)],
      ['Arms', l.arms.map((a) => a.name).join(', ')],
    ],
    confirmLabel: 'Remove class level',
    tone: 'destructive',
    action: async () => {
      await removeLevel.mutateAsync(l.id);
      toast.success(`${l.name} removed.`);
    },
  });
}

const siblings = (l: ClassLevel) =>
  levels.value.filter((x) => x.branchId === l.branchId && x.section === l.section);
const levelActions = (l: ClassLevel): RowAction[] => {
  const sib = siblings(l);
  const i = sib.indexOf(l);
  return [
    { label: 'Add arm', icon: PlusIcon, onSelect: () => addArmTo(l) },
    { label: 'Rename', icon: PencilIcon, onSelect: () => renameLevel(l) },
    ...(i > 0 ? [{ label: 'Move up', icon: ArrowUpIcon, onSelect: () => moveLevel(l, 'up') }] : []),
    ...(i < sib.length - 1
      ? [{ label: 'Move down', icon: ArrowDownIcon, onSelect: () => moveLevel(l, 'down') }]
      : []),
    {
      label: 'Remove class level',
      icon: Trash2Icon,
      destructive: true,
      onSelect: () => deleteLevel(l),
    },
  ];
};

async function useDefaults() {
  try {
    const v = await applyDefaults.mutateAsync();
    toast.success(
      `${pluralize(v.levels.length, 'class level')} added with one arm each. Rename, add or remove anything.`,
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}

/* ---------------- Table ---------------- */

const search = ref('');
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return arms.value.filter(
    (a) =>
      !q || `${a.name} ${a.section} ${a.classTeacher ?? ''} ${a.branch}`.toLowerCase().includes(q),
  );
});
const status = (a: ClassArm) =>
  a.students >= a.capacity ? 'Full' : !a.classTeacherId ? 'No class teacher' : 'Active';
const statusTone = (a: ClassArm) =>
  a.students >= a.capacity ? 'warning' : !a.classTeacherId ? 'error' : 'success';
const columns = computed<Column[]>(() => [
  { key: 'name', label: 'Class', width: 'minmax(110px,0.8fr)' },
  { key: 'section', label: 'Section', width: 'minmax(130px,1fr)' },
  ...(multiBranch.value ? [{ key: 'branch', label: 'Branch', width: 'minmax(120px,0.9fr)' }] : []),
  { key: 'teacher', label: 'Class teacher', width: 'minmax(160px,1.4fr)' },
  { key: 'students', label: 'Students', width: 'minmax(150px,1fr)' },
  { key: 'status', label: 'Status', width: '150px' },
]);
const armLink = (a: { id: string }) => ({ name: r.classDetail.name, params: { id: a.id } });
const armActions = (a: ClassArm): RowAction[] => [
  { label: 'Open class', icon: UsersIcon, to: armLink(a) },
  { label: 'Edit arm', icon: PencilIcon, onSelect: () => editArm(a) },
];
</script>

<template>
  <PageHeader
    title="Classes & Arms"
    :description="`Section → Class level → Arm · ${context.current.session} · ${context.current.branch}`"
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: r.sections.name }">Academic sections</RouterLink></Button
      >
      <Button variant="outline" :disabled="!sectionsReady" @click="addLevel()"
        >Add class level</Button
      >
      <Button :disabled="!levels.length" @click="pickLevelForArm">Add arm</Button>
    </template>
  </PageHeader>

  <SetupStepBar
    step="classes-arms"
    :blocked="blocked"
    :details="[
      ['Class levels', String(totals.levels)],
      ['Arms', String(totals.arms)],
      ['Places', formatCount(totals.places)],
    ]"
  />

  <Skeleton v-if="isPending" class="h-80" />
  <template v-else-if="data">
    <InlineNotice
      v-if="!sectionsReady"
      tone="warning"
      title="Finish Academic Sections first"
      description="Classes & Arms depends on it: each class level belongs to a section, such as Junior Secondary."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: r.sections.name, query: $route.query }"
            >Go to Academic Sections</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>

    <SectionCard
      v-else-if="!data.levels.length"
      title="How do you want to start?"
      description="Nigerian defaults add the usual levels for each section (e.g. JSS 1–3) with one arm each. You can rename, add or remove anything afterwards."
    >
      <div class="flex flex-col gap-3 text-[13px]">
        <div
          v-for="b in data.branches"
          :key="b.id"
          class="rounded-md border bg-muted px-3.5 py-2.5"
        >
          <span class="font-semibold">{{ b.name }}</span>
          <ul class="mt-1 flex flex-col gap-0.5 text-body">
            <li v-for="s in b.sections" :key="s">
              {{ s }} →
              {{
                data.defaults[data.sections.find((x) => x.name === s)?.code ?? '']?.join(', ') ||
                'no default levels'
              }}
            </li>
          </ul>
        </div>
        <InlineNotice
          v-if="!data.sections.some((s) => data!.defaults[s.code])"
          tone="warning"
          title="Your sections don’t match the standard ones"
          description="Defaults only cover Nursery, Primary, Junior and Senior Secondary. Start blank and add your own levels."
        />
        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="addLevel()">Start blank</Button>
          <Button :disabled="applyDefaults.isPending.value" @click="useDefaults"
            >Use Nigerian defaults</Button
          >
        </div>
      </div>
    </SectionCard>

    <template v-else>
      <InlineNotice
        tone="info"
        :title="`${pluralize(totals.levels, 'class level')} · ${pluralize(totals.arms, 'arm')} · room for ${formatCount(totals.places)} students`"
        description="Order is the promotion path: students move from one level to the next each session, and graduate after the final class. Class teachers are assigned here or in Teacher Assignments."
      />
      <InlineNotice
        v-if="noTeacher.length"
        tone="warning"
        :title="
          noTeacher.length === 1
            ? `${noTeacher[0]!.name} has no class teacher`
            : `${noTeacher.length} arms have no class teacher`
        "
        :description="`${noTeacher.length > 1 ? `${noTeacher.map((a) => a.name).join(', ')}. ` : ''}Report card comments and promotion proposals need a class teacher.`"
      >
        <template #action>
          <Button variant="outline" size="sm" @click="editArm(noTeacher[0]!)">Assign</Button>
        </template>
      </InlineNotice>
      <InlineNotice
        v-if="emptySections.length"
        tone="warning"
        title="Sections without classes"
        :description="`${emptySections.join(', ')}. Add a class level, or remove the section from the branch.`"
      />
      <InlineNotice
        v-if="full.length"
        tone="neutral"
        :title="`${pluralize(full.length, 'arm')} at capacity`"
        :description="`${full.map((a) => a.name).join(', ')}. Raise the places or add an arm before admitting more students.`"
      />

      <div class="grid gap-3 lg:grid-cols-2">
        <SectionCard
          v-for="s in tree"
          :key="s.id"
          :title="`${s.name} · ${s.code}`"
          :description="`${pluralize(s.levels.length, 'level')} · ${pluralize(
            s.levels.reduce((n, l) => n + l.arms.length, 0),
            'arm',
          )}`"
        >
          <ul class="flex flex-col divide-y divide-divider">
            <li v-for="l in s.levels" :key="l.id" class="flex items-center gap-3 py-2">
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-sm font-medium"
                  >{{ l.name }}
                  <span v-if="multiBranch" class="text-xs font-normal text-faint"
                    >· {{ branchName(l.branchId) }}</span
                  ></span
                >
                <div class="flex flex-wrap gap-1.5">
                  <RouterLink
                    v-for="a in l.arms"
                    :key="a.id"
                    :to="armLink(a)"
                    class="rounded-sm border bg-card px-2 py-0.5 text-xs hover:border-primary"
                    :class="!a.classTeacherId && 'border-error-subtle text-error-strong'"
                    :title="`${a.students} of ${a.capacity} · ${a.classTeacher ?? 'no class teacher'}`"
                    >{{ a.arm }}</RouterLink
                  >
                </div>
                <span class="text-xs text-faint">{{
                  l.next ? `Promotes to ${l.next}` : 'Final class: students graduate after this'
                }}</span>
              </div>
              <RowActions :actions="levelActions(l)" :label="`${l.name} actions`" />
            </li>
          </ul>
          <Button
            variant="ghost"
            size="sm"
            class="mt-2 self-start"
            @click="addLevel({ section: s.name })"
            ><PlusIcon />Add class level</Button
          >
        </SectionCard>
      </div>

      <DataTable
        title="Class arms"
        :columns="columns"
        :rows="rows"
        :row-key="(a) => a.id"
        :row-label="(a) => a.name"
        :actions="armActions"
        min-width="860px"
        empty-text="No classes match your search."
      >
        <template #search><SearchInput v-model="search" placeholder="Search classes" /></template>
        <template #cell-name="{ row }"><CellLink :to="armLink(row)" :label="row.name" /></template>
        <template #cell-teacher="{ row }">
          <span :class="!row.classTeacher && 'text-error-strong'">{{
            row.classTeacher ?? 'Not assigned'
          }}</span>
        </template>
        <template #cell-students="{ row }">
          <span class="flex items-center gap-2">
            <span class="block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <span
                class="block h-full rounded-full"
                :class="row.students >= row.capacity ? 'bg-warning' : 'bg-primary'"
                :style="{ width: `${Math.min(100, (row.students / row.capacity) * 100)}%` }"
              />
            </span>
            <span class="tabular-nums">{{ row.students }} / {{ row.capacity }}</span>
          </span>
        </template>
        <template #cell-status="{ row }"
          ><StatusBadge :label="status(row)" :tone="statusTone(row)"
        /></template>
      </DataTable>
    </template>
  </template>

  <LevelDrawer
    v-if="data"
    v-model:open="levelOpen"
    :view="data"
    :level="levelEditing"
    :branch-id="levelPreset.branchId"
    :section="levelPreset.section"
  />
  <ArmDrawer v-model:open="armOpen" :level="armLevel" :arm="armEditing" />
</template>
