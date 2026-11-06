<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';

import { useRolesQuery } from '@/api/services/users';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PermissionMatrix from '@/components/common/PermissionMatrix.vue';
import type { PlatformUser } from '@/types';

const props = defineProps<{ user: PlatformUser }>();
const { data: roles, isPending } = useRolesQuery();
const role = computed(() => roles.value?.find((r) => r.id === props.user.roleId));
</script>

<template>
  <Skeleton v-if="isPending" class="h-60" />
  <template v-else-if="role">
    <KeyValueCard
      title="Role"
      class="max-w-2xl"
      :rows="[
        { label: 'Role', value: role.name },
        { label: 'Description', value: role.description },
        {
          label: 'Access level',
          value: role.id === 'admin' ? 'Full · including settings' : 'Limited by role',
        },
      ]"
    />
    <PermissionMatrix :model-value="role.permissions" readonly />
  </template>
</template>
