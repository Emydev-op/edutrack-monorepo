<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { useUsersQuery } from '@/api/services/users';
import InitialsAvatar from '@edutrack/app-kit/components/common/InitialsAvatar.vue';
import { routesPath } from '@/router/routes-path';

import PermissionMatrix from '@/components/common/PermissionMatrix.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import type { Role } from '@/types';

import { useRoleActions } from '../useRoleActions';

const props = defineProps<{ role?: Role }>();
const emit = defineEmits<{ close: [] }>();
const { duplicate, deleteRole } = useRoleActions();

// The API pages in 10s, 20s or 50s.
const PEEK = 10;
const {
  data: people,
  isPending: loadingPeople,
  isError: peopleFailed,
} = useUsersQuery(
  () => ({
    role: props.role?.name,
    page: 1,
    pageSize: PEEK,
  }),
  () => !!props.role,
);
const total = computed(() => people.value?.meta.total ?? 0);
const initialsOf = (u: { firstName: string; lastName: string }) =>
  `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();

const open = computed({ get: () => !!props.role, set: (v) => !v && emit('close') });
</script>

<template>
  <SideDrawer v-model:open="open" :title="role?.name ?? ''" :description="role?.description">
    <template v-if="role">
      <dl
        class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 rounded-md bg-muted px-3.5 py-3 text-[13px]"
      >
        <dt class="text-faint">Users</dt>
        <dd>
          {{ role.activeUsers }} {{ role.activeUsers === 1 ? 'person' : 'people' }} (not counting
          deactivated)
        </dd>
        <dt class="text-faint">Type</dt>
        <dd>{{ role.predefined ? "Predefined · can't be deleted" : 'Custom' }}</dd>
      </dl>
      <section class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between">
          <h3 class="text-[13px] font-semibold">People with this role</h3>
          <RouterLink
            v-if="total > 0"
            :to="{ name: routesPath.users.list.name, query: { role: role.name } }"
            class="text-xs font-medium text-primary hover:underline"
            >{{ total > PEEK ? `See all ${total}` : 'Open in Users' }}</RouterLink
          >
        </div>
        <Skeleton v-if="loadingPeople" class="h-24" />
        <p v-else-if="peopleFailed" class="text-[13px] text-destructive">
          We couldn't load the people with this role. Close and open the drawer to try again.
        </p>
        <p
          v-else-if="total === 0"
          class="rounded-md border border-dashed px-3.5 py-4 text-center text-[13px] text-muted-foreground"
        >
          Nobody has this role yet. Give it to someone from their profile in Users.
        </p>
        <ul v-else class="divide-y rounded-md border">
          <li v-for="u in people?.data" :key="u.id">
            <RouterLink
              :to="{ name: routesPath.users.detail.name, params: { id: u.id } }"
              class="flex items-center gap-2.5 px-3 py-2 hover:bg-muted"
            >
              <InitialsAvatar :initials="initialsOf(u)" size="sm" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[13px] font-medium"
                  >{{ u.firstName }} {{ u.lastName }}</span
                >
                <span class="truncate text-xs text-faint">{{ u.email }}</span>
              </span>
              <StatusBadge :label="u.status" />
            </RouterLink>
          </li>
        </ul>
      </section>
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
