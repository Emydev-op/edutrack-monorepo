<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';

import { useClassesQuery } from '@/api/services/academics';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ClassDetail } from '@/types';

import ArmDrawer from '../ArmDrawer.vue';

const props = defineProps<{ detail: ClassDetail }>();
const context = useContextStore();
const { data: classes } = useClassesQuery();
const editing = ref(false);

const arm = computed(() => props.detail.arm);
const level = computed(() => classes.value?.levels.find((l) => l.id === arm.value.levelId) ?? null);
const compulsory = computed(
  () => props.detail.subjects.filter((s) => s.type === 'Compulsory').length,
);
const electives = computed(() => props.detail.subjects.length - compulsory.value);
const unassigned = computed(() => props.detail.subjects.filter((s) => !s.teacherId));
const resultCounts = computed(() => {
  const r = props.detail.results;
  const done = r.filter((x) => ['Approved', 'Published'].includes(x.status)).length;
  return r.every((x) => x.status === 'Published') && r.length
    ? 'Published'
    : `${done} of ${r.length} subjects approved`;
});
const a = routesPath.academics;
</script>

<template>
  <InlineNotice
    v-if="!arm.classTeacherId"
    tone="warning"
    :title="`${arm.name} has no class teacher`"
    description="Report card comments and promotion proposals need a class teacher."
  >
    <template #action>
      <Button variant="outline" size="sm" @click="editing = true">Assign</Button>
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="unassigned.length"
    tone="warning"
    :title="`${unassigned.length} subject${unassigned.length > 1 ? 's have' : ' has'} no teacher`"
    :description="`${unassigned.map((s) => s.name).join(', ')}. They block the timetable for those lessons.`"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: a.assignments.name }">Assign</RouterLink></Button
      >
    </template>
  </InlineNotice>
  <div class="grid gap-4 md:grid-cols-2">
    <div class="flex flex-col gap-2">
      <KeyValueCard
        title="Class"
        :rows="[
          { label: 'Section', value: arm.section },
          { label: 'Class level', value: arm.level },
          { label: 'Arm', value: arm.arm },
          { label: 'Branch', value: arm.branch },
          {
            label: 'Class teacher',
            value: arm.classTeacher ?? 'Not assigned',
            emphasis: arm.classTeacher ? undefined : 'error',
          },
          { label: 'Room', value: arm.room || '—' },
          { label: 'Places', value: `${arm.students} of ${arm.capacity} used` },
        ]"
      />
      <Button variant="outline" size="sm" class="self-start" @click="editing = true"
        >Edit arm</Button
      >
    </div>
    <KeyValueCard
      :title="`This term · ${context.current.term}`"
      :rows="[
        { label: 'Students', value: detail.students.length || arm.students },
        {
          label: 'Subjects',
          value: `${detail.subjects.length} (${compulsory} compulsory${electives ? ` + ${electives} elective` : ''})`,
        },
        {
          label: 'Timetable',
          value: detail.timetable
            ? `${detail.timetable.status} · v${detail.timetable.version}`
            : 'Not started',
          emphasis: detail.timetable ? undefined : 'error',
        },
        { label: 'Results', value: resultCounts },
      ]"
    />
  </div>
  <ArmDrawer v-model:open="editing" :level="level" :arm="arm" />
</template>
