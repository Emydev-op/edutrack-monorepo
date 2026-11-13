<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { PlusIcon } from '@lucide/vue';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';

import AssignmentsTable from '@/components/assignments/AssignmentsTable.vue';
import { routesPath as r } from '@/router/routes-path';
import type { TeachingClassDetail } from '@/types';

/** The class page's Assignments tab: this class's assignments for the subject. */
const props = defineProps<{ detail: TeachingClassDetail }>();
const page = ref(1);
const pageSize = ref(10);
const c = props.detail.class;
</script>

<template>
  <AssignmentsTable
    v-model:page="page"
    v-model:page-size="pageSize"
    :arm-id="c.armId"
    :subject="c.subject"
    title="Assignments"
    :description="`Work set for ${c.armName} · ${c.subjectName}, with submissions to grade.`"
    :empty-text="
      detail.readOnly
        ? 'No assignments were set for this class in this term.'
        : 'No assignments for this class yet. Create one to set work.'
    "
  >
    <template #toolbar>
      <Button v-if="!detail.readOnly" as-child size="sm"
        ><RouterLink
          :to="{ name: r.assignments.new.name, query: { class: c.armId, subject: c.subject } }"
          ><PlusIcon /> Create assignment</RouterLink
        ></Button
      >
      <Button v-else size="sm" disabled :title="detail.lockReason ?? undefined"
        ><PlusIcon /> Create assignment</Button
      >
    </template>
  </AssignmentsTable>
</template>
