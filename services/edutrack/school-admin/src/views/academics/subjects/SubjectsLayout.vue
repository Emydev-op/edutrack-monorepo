<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useApplyDefaultSubjectsMutation, useCurriculumQuery } from '@/api/services/academics';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';

import SubjectDrawer from './SubjectDrawer.vue';

const a = routesPath.academics;
const route = useRoute();
const { data: view, isPending } = useCurriculumQuery();
const applyDefaults = useApplyDefaultSubjectsMutation();
const startedBlank = ref(false);
const adding = ref(false);

const noLevels = computed(() => !!view.value && !view.value.levels.length);
const choosing = computed(
  () => !!view.value && !noLevels.value && !view.value.subjects.length && !startedBlank.value,
);
/** Classes with no compulsory subject block completing the step. */
const empty = computed(() =>
  (view.value?.levels ?? []).flatMap(({ section, levels }) =>
    levels.filter(
      (lv) => !Object.values(view.value!.curriculum[section]?.[lv] ?? {}).includes('C'),
    ),
  ),
);
const blocked = computed(() =>
  noLevels.value
    ? 'Finish Classes & Arms first.'
    : !view.value?.subjects.length
      ? 'Add at least one subject first.'
      : empty.value.length
        ? `Give these classes at least one compulsory subject: ${empty.value.join(', ')}.`
        : undefined,
);

const tabs = computed(() =>
  (
    [
      [`Subjects${view.value ? ` (${view.value.subjects.length})` : ''}`, a.subjects.name],
      ['Curriculum by class', a.curriculum.name],
      [`Elective groups${view.value ? ` (${view.value.groups.length})` : ''}`, a.groups.name],
    ] as const
  ).map(([label, name]) => ({
    label,
    to: { name, query: route.query },
    active: route.name === name,
  })),
);

async function useSuggested() {
  try {
    const v = await applyDefaults.mutateAsync();
    toast.success(
      `${pluralize(v.subjects.length, 'subject')} and ${pluralize(v.groups.length, 'elective group')} added. Change anything you need.`,
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}
</script>

<template>
  <PageHeader
    title="Subjects & Curriculum"
    description="Your school owns its curriculum. Offerings are set per session, so changing them never rewrites past sessions."
  >
    <template #actions>
      <Button :disabled="noLevels" @click="adding = true">Add subject</Button>
    </template>
  </PageHeader>

  <SetupStepBar
    step="subjects-curriculum"
    :blocked="blocked"
    :details="
      view
        ? [
            ['Subjects', String(view.subjects.filter((s) => s.status === 'Active').length)],
            [
              'Elective groups',
              view.groups.map((g) => `${g.name} (${g.section})`).join(', ') || 'None',
            ],
          ]
        : []
    "
  />

  <Skeleton v-if="isPending" class="h-80" />
  <template v-else-if="view">
    <InlineNotice
      v-if="noLevels"
      tone="warning"
      title="Finish Classes & Arms first"
      description="Subjects & Curriculum depends on it: each class level gets its own compulsory and elective subjects."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: a.classes.name, query: route.query }"
            >Go to Classes & Arms</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>

    <SectionCard
      v-else-if="choosing"
      title="How do you want to start?"
      :description="`Suggested subjects follow common Nigerian timetables for ${view.levels.map((l) => l.section).join(', ')}, with compulsory and elective subjects and elective groups. Your school owns its curriculum: change anything.`"
    >
      <div class="flex flex-col gap-3 text-[13px]">
        <div
          v-for="l in view.levels"
          :key="l.section"
          class="rounded-md border bg-muted px-3.5 py-2.5"
        >
          <span class="font-semibold">{{ l.section }}</span>
          <span class="text-body"> · {{ l.levels.join(', ') }}</span>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="startedBlank = true">Start blank</Button>
          <Button :disabled="applyDefaults.isPending.value" @click="useSuggested"
            >Use suggested subjects</Button
          >
        </div>
      </div>
    </SectionCard>

    <template v-else>
      <TabNav :tabs="tabs" label="Subjects & Curriculum" />
      <RouterView v-slot="{ Component }">
        <component :is="Component" :view="view" @add="adding = true" />
      </RouterView>
    </template>
  </template>

  <SubjectDrawer v-if="view" v-model:open="adding" :subject="null" :subjects="view.subjects" />
</template>
