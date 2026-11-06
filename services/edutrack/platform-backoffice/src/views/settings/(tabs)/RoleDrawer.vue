<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';

import PermissionMatrix from '@/components/common/PermissionMatrix.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import type { Role } from '@/types';

import { useRoleActions } from '../useRoleActions';

const props = defineProps<{ role?: Role }>();
const emit = defineEmits<{ close: [] }>();
const { duplicate, deleteRole } = useRoleActions();

const open = computed({ get: () => !!props.role, set: (v) => !v && emit('close') });
</script>

<template>
  <SideDrawer v-model:open="open" :title="role?.name ?? ''" :description="role?.description">
    <template v-if="role">
      <dl
        class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 rounded-md bg-muted px-3.5 py-3 text-[13px]"
      >
        <dt class="text-faint">Users</dt>
        <dd>{{ role.activeUsers }} active</dd>
        <dt class="text-faint">Type</dt>
        <dd>{{ role.predefined ? "Predefined · can't be deleted" : 'Custom' }}</dd>
      </dl>
      <PermissionMatrix :model-value="role.permissions" readonly class="text-xs" />
    </template>
    <template #footer>
      <Button
        v-if="role && !role.predefined"
        variant="destructive-outline"
        @click="deleteRole(role, () => emit('close'))"
        >Delete role</Button
      >
      <Button v-else variant="outline" @click="emit('close')">Close</Button>
      <Button :disabled="!role" @click="role && duplicate(role)">Duplicate role</Button>
    </template>
  </SideDrawer>
</template>
