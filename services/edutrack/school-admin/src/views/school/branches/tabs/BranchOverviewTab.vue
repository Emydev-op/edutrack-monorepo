<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import { formatCount } from '@edutrack/app-kit/lib/format';

import { routesPath } from '@/router/routes-path';
import type { BranchDetail } from '@/types';

const props = defineProps<{ branch: BranchDetail }>();
defineEmits<{ reactivate: [] }>();

const b = computed(() => props.branch);
const editTo = computed(() => ({
  name: routesPath.school.branchEdit.name,
  params: { id: b.value.id },
}));
const missing = computed(() => [
  ...(!b.value.street || !b.value.city ? ['Address incomplete'] : []),
  ...(!b.value.sections.length ? ['No sections'] : []),
]);
const profile = computed(() => [
  { label: 'Code', value: b.value.code },
  { label: 'Address', value: [b.value.street, b.value.city].filter(Boolean).join(', ') },
  { label: 'LGA / State', value: [b.value.lga, b.value.state].filter(Boolean).join(', ') },
  { label: 'Phone', value: b.value.phone },
  { label: 'Email', value: b.value.email },
  {
    label: 'Head of campus',
    value: b.value.headName ?? 'Not assigned',
    emphasis: b.value.headName ? undefined : ('error' as const),
  },
  { label: 'Sections', value: b.value.sections.join(', ') },
  { label: 'Store', value: b.value.hasStore ? `${b.value.name} Store` : 'None' },
]);
const term = computed(() => [
  { label: 'Students', value: formatCount(b.value.students) },
  { label: 'Staff', value: formatCount(b.value.staff) },
  { label: 'Class arms', value: formatCount(b.value.classArms) },
]);
</script>

<template>
  <InlineNotice
    v-if="b.status !== 'Active'"
    tone="neutral"
    :title="`${b.name} is inactive`"
    description="No new classes, enrollments, invoices or stock movements. Its records are still here."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="$emit('reactivate')"
        >Reactivate</Button
      ></template
    >
  </InlineNotice>
  <InlineNotice
    v-else-if="!b.students"
    tone="info"
    :title="`${b.name} has no classes or students yet`"
    :description="`Set up classes for ${b.sections.join(', ') || 'its sections'}, then admit or import students.`"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: routesPath.academics.classes.name }"
          >Set up classes</RouterLink
        ></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="b.status === 'Active' && !b.headId"
    tone="warning"
    title="No head of campus"
    description="Branch approvals fall back to the Principal until someone is assigned."
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="editTo">Assign head</RouterLink></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="missing.length"
    tone="error"
    title="Details missing"
    :description="`${missing.join(', ')}. Parents won’t see a full address for this campus.`"
  >
    <template #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="editTo">Complete details</RouterLink></Button
      >
    </template>
  </InlineNotice>
  <InlineNotice
    v-if="!b.canDelete && (b.students || b.classArms)"
    tone="neutral"
    title="Branches with records can’t be deleted"
    description="Deactivate it instead. Its history stays intact."
  />

  <div class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard title="Profile" :rows="profile">
      <template #action>
        <RouterLink :to="editTo" class="text-[13px] font-medium text-primary hover:underline"
          >Edit</RouterLink
        >
      </template>
    </KeyValueCard>
    <div class="flex flex-col gap-4">
      <KeyValueCard title="2026/2027 · First Term" :rows="term" />
      <KeyValueCard
        v-if="b.scopedUsers.length"
        title="Users scoped to this branch"
        :rows="b.scopedUsers.map((u) => ({ label: u.name, value: u.roles.join(', ') }))"
      />
    </div>
  </div>
  <ActivityTimeline
    title="Recent changes"
    :items="b.history"
    empty-text="No changes recorded yet."
  />
</template>
