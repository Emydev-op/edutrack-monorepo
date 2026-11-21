<script setup lang="ts">
import { computed } from 'vue';

import { useHomeworkQuery } from '@/api/services/parent';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { formatDeadline } from '@/lib/dates';
import { homeworkTone } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';

/** The child's assignments this term, what's waiting first. */
const { overview, child, id } = useCurrentChild();
const q = useHomeworkQuery(id);
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
    :title="`Assignments · ${child?.firstName ?? ''}`"
    :sub="[child?.className, overview.data.value?.term?.name].filter(Boolean).join(' · ')"
  />
  <QueryState
    v-if="!q.data.value"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <template v-else>
    <p v-if="q.data.value.handsInThrough === 'student'" class="text-[13px] text-muted-foreground">
      {{ child?.firstName }} hands in work from the Student Portal. You can follow the status and
      feedback here.
    </p>
    <p
      v-else-if="q.data.value.handsInThrough === 'guardian'"
      class="text-[13px] text-muted-foreground"
    >
      You can hand in {{ child?.firstName }}’s work here: open an assignment and upload a photo of
      it.
    </p>
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
