<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { useCreateGroupMutation, useGroupsQuery } from '@/api/services/groups';
import { routesPath } from '@/router/routes-path';

/** Back office › Groups: proprietors' schools grouped under one owner. */
const router = useRouter();
const { data, isPending } = useGroupsQuery();
const create = useCreateGroupMutation();
const name = ref('');

async function add() {
  if (!name.value.trim()) return;
  try {
    const g = await create.mutateAsync(name.value.trim());
    toast.success(`${g.name} created.`);
    name.value = '';
    await router.push({ name: routesPath.groups.detail.name, params: { id: g.id } });
  } catch (e) {
    toast.error(getApiErrorMessage(e));
  }
}
</script>

<template>
  <PageHeader
    title="School groups"
    description="One proprietor, several schools. Group staff get an account in every school of the group and a group overview."
  />
  <form class="flex max-w-xl gap-2" @submit.prevent="add">
    <Input v-model="name" placeholder="e.g. Greenfield Education Group" aria-label="Group name" />
    <Button type="submit" :disabled="create.isPending.value || !name.trim()">Create group</Button>
  </form>
  <Skeleton v-if="isPending" class="h-40" />
  <EmptyState
    v-else-if="!data?.length"
    title="No groups yet"
    description="Create a group, then add the proprietor’s schools and their group staff."
  />
  <ul v-else class="flex flex-col divide-y rounded-lg border bg-card">
    <li v-for="g in data" :key="g.id">
      <RouterLink
        :to="{ name: routesPath.groups.detail.name, params: { id: g.id } }"
        class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
      >
        <span class="font-medium">{{ g.name }}</span>
        <span class="text-sm text-muted-foreground"
          >{{ g.schools }} school{{ g.schools === 1 ? '' : 's' }} · {{ g.staff }} group staff</span
        >
      </RouterLink>
    </li>
  </ul>
</template>
