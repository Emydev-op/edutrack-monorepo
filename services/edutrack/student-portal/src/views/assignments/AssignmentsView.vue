<script setup lang="ts">
import { computed } from 'vue';

import { useHomeworkQuery, useOverviewQuery } from '@/api/services/student';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { formatDeadline } from '@/lib/dates';
import { homeworkTone } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';

/** The student's assignments this term, what's waiting first. */
const overview = useOverviewQuery();
const q = useHomeworkQuery();
const waiting = (s: string) => s === 'Not submitted';
const list = computed(() => {
  const all = q.data.value?.assignments ?? [];
  return {
    todo: all.filter((a) => waiting(a.status) && !a.pastDue && a.assignmentStatus !== 'Closed'),
    rest: all.filter((a) => !(waiting(a.status) && !a.pastDue && a.assignmentStatus !== 'Closed')),
  };
});
</script>

<template>
  <PageTitle
    title="Assignments"
    :sub="
      [overview.data.value?.student.className, overview.data.value?.term?.name]
        .filter(Boolean)
        .join(' · ')
    "
  />
  <QueryState
    v-if="!q.data.value"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <template v-else>
    <ListSection v-if="list.todo.length" title="To hand in">
      <ListRow
        v-for="a in list.todo"
        :key="a.id"
        :title="a.title"
        :sub="`${a.subjectName} · ${a.teacherName} · due ${formatDeadline(a.dueAt)}`"
        :badge="a.status"
        :tone="homeworkTone(a.status, a.pastDue)"
        :to="{ name: routesPath.assignments.detail.name, params: { assignmentId: a.id } }"
      />
    </ListSection>
    <ListSection
      title="This term"
      :empty="
        list.rest.length
          ? undefined
          : list.todo.length
            ? undefined
            : 'No assignments this term yet.'
      "
    >
      <ListRow
        v-for="a in list.rest"
        :key="a.id"
        :title="a.title"
        :sub="`${a.subjectName} · ${a.teacherName} · due ${formatDeadline(a.dueAt)}`"
        :badge="a.status"
        :tone="homeworkTone(a.status, a.pastDue)"
        :to="{ name: routesPath.assignments.detail.name, params: { assignmentId: a.id } }"
      />
    </ListSection>
  </template>
</template>
