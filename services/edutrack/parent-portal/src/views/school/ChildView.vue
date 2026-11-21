<script setup lang="ts">
import { computed } from 'vue';

import { useChildQuery } from '@/api/services/parent';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { feeLine, resultLine } from '@/lib/summaries';
import { routesPath } from '@/router/routes-path';

/** My children: the selected child's enrolment, this term at a glance, guardians on record. */
const { id } = useCurrentChild();
const q = useChildQuery(id);
const d = computed(() => q.data.value);
const attendanceText = computed(() => {
  const a = d.value?.thisTerm.attendance;
  if (!a || !a.schoolDays) return 'No register taken yet';
  return `${a.percent}% present · ${a.absent} absent of ${a.schoolDays} school days`;
});
</script>

<template>
  <QueryState v-if="!d" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <template v-else>
    <PageTitle
      :title="d.child.name"
      :sub="`${d.enrolment.className} · ${d.enrolment.branch} · ${d.enrolment.session}`"
    />
    <ListSection title="Enrolment">
      <ListRow title="Session" :right="`${d.enrolment.session} · ${d.enrolment.term}`" />
      <ListRow title="Class" :right="d.enrolment.className || 'Not placed yet'" />
      <ListRow title="Class teacher" :right="d.enrolment.classTeacher ?? 'Not assigned'" />
      <ListRow title="Admission no." :right="d.enrolment.admissionNo" />
      <ListRow title="Admitted" :right="d.enrolment.admittedOn" />
      <ListRow title="Status" :right="d.enrolment.status" />
    </ListSection>
    <ListSection :title="`This term · ${d.thisTerm.term}`">
      <ListRow
        title="Fees"
        :sub="feeLine(d.thisTerm.fees).text"
        :badge="feeLine(d.thisTerm.fees).status"
        :to="{ name: routesPath.fees.view.name }"
      />
      <ListRow
        title="Results"
        :sub="resultLine(d.thisTerm.results).title"
        :to="{ name: routesPath.results.name }"
      />
      <ListRow
        title="Assignments"
        :sub="
          d.thisTerm.assignmentsToDo
            ? `${d.thisTerm.assignmentsToDo} not handed in yet`
            : 'Nothing waiting to be handed in'
        "
        :to="{ name: routesPath.assignments.list.name }"
      />
      <ListRow
        title="Attendance"
        :sub="attendanceText"
        :to="{ name: routesPath.attendance.name }"
      />
    </ListSection>
    <ListSection title="Guardians on record">
      <ListRow
        v-for="g in d.guardians"
        :key="g.name"
        :title="g.you ? `${g.name} (you)` : g.name"
        :sub="
          g.you
            ? `${g.relationship} · ${g.paysFees ? 'pays fees' : 'doesn’t pay fees'} · portal active`
            : g.relationship
        "
      />
    </ListSection>
    <p class="text-xs text-muted-foreground">
      Something wrong in these details? Contact the school office; only the school can change them.
    </p>
  </template>
</template>
