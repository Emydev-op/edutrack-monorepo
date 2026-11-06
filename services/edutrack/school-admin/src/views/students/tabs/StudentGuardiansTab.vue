<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';

import { routesPath } from '@/router/routes-path';
import type { StudentDetail } from '@/types';

defineProps<{ student: StudentDetail }>();
</script>

<template>
  <EmptyState
    v-if="!student.guardians.length"
    title="No guardian linked"
    description="Fee reminders and results can’t be sent until a guardian is linked."
  >
    <Button as-child
      ><RouterLink :to="{ name: routesPath.students.parents.name, query: { add: student.id } }"
        >Link guardian</RouterLink
      ></Button
    >
  </EmptyState>
  <div v-else class="grid items-start gap-4 md:grid-cols-2">
    <KeyValueCard
      v-for="g in student.guardians"
      :key="g.guardianId"
      :title="g.name"
      :rows="[
        {
          label: 'Relationship',
          value: `${g.relationship}${g.primary ? ' · primary contact' : ''}`,
        },
        { label: 'Phone', value: g.phone },
        { label: 'Email', value: g.email },
        { label: 'Financial responsibility', value: g.paysFees ? 'Yes · receives invoices' : 'No' },
        { label: 'Portal', value: g.portal },
        { label: 'Also guardian of', value: g.otherChildren.join(', ') },
      ]"
    >
      <template #action>
        <RouterLink
          :to="{ name: routesPath.students.parent.name, params: { id: g.guardianId } }"
          class="text-[13px] font-medium text-primary hover:underline"
          >Parent profile</RouterLink
        >
      </template>
    </KeyValueCard>
  </div>
</template>
