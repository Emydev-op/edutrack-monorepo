<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { formatNaira, initials } from '@edutrack/app-kit/lib/format';

import { useGuardianQuery } from '@/api/services/students';
import { routesPath } from '@/router/routes-path';
import { useLayoutStore } from '@/stores/layout';

import { tone } from './student-tones';

const route = useRoute();
const layout = useLayoutStore();
const id = computed(() => String(route.params.id));
const { data: g, isPending, isError } = useGuardianQuery(id);
watch(g, (x) => layout.setRecordLabel(x?.name ?? null), { immediate: true });
</script>

<template>
  <Skeleton v-if="isPending" class="h-80" />
  <EmptyState v-else-if="isError || !g" illustrated title="This guardian doesn’t exist">
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.students.parents.name }"
        >All guardians</RouterLink
      ></Button
    >
  </EmptyState>
  <template v-else>
    <PageHeader
      :title="g.name"
      :initials="initials(g.name)"
      :status="g.portal"
      :description="`Guardian of ${g.children.length} child${g.children.length === 1 ? '' : 'ren'}${g.portalSince ? ` · portal account since ${g.portalSince}` : ''}`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.communication.announcements.name }"
            >Send message</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <div class="grid gap-3 sm:grid-cols-2">
      <RouterLink
        v-for="c in g.childrenDetail"
        :key="c.id"
        :to="{ name: routesPath.students.detail.name, params: { id: c.id } }"
        class="flex flex-col gap-1.5 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
      >
        <span class="flex items-start justify-between gap-2">
          <span class="flex flex-col">
            <span class="font-semibold">{{ c.name }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ c.className || 'Awaiting arm' }} · {{ c.branch }}</span
            >
          </span>
          <StatusBadge :label="c.status" :tone="tone(c.status)" />
        </span>
        <span class="text-[13px]">Balance {{ formatNaira(c.balance) }}</span>
        <span class="text-xs text-faint">{{ c.note || `Relationship: ${c.relationship}` }}</span>
      </RouterLink>
    </div>

    <div class="grid items-start gap-4 md:grid-cols-3">
      <KeyValueCard
        title="Contact"
        :rows="[
          { label: 'Phone', value: g.phone },
          { label: 'Email', value: g.email },
          { label: 'Address', value: g.address },
          { label: 'Occupation', value: g.occupation },
        ]"
      />
      <KeyValueCard
        title="Financial responsibility"
        :rows="[
          {
            label: 'Pays for',
            value: g.paysFees ? g.children.map((c) => c.name.split(' ')[0]).join(', ') : 'No one',
          },
          {
            label: 'Combined balance',
            value: formatNaira(g.balance),
            emphasis: g.balance ? 'error' : 'success',
          },
          { label: 'Payment plan', value: g.paymentPlan },
          { label: 'Preferred method', value: g.preferredMethod },
        ]"
      />
      <KeyValueCard
        title="Notification preferences"
        :rows="g.notifications.map(([label, value]) => ({ label, value }))"
      />
    </div>
  </template>
</template>
