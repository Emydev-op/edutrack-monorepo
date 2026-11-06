<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';

import { useUserSecurityQuery } from '@/api/services/users';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import type { PlatformUser } from '@/types';

import { inject } from 'vue';

import { userActionsKey } from '../../components/useUserActions';

const props = defineProps<{ user: PlatformUser }>();
const actions = inject(userActionsKey)!;
const { data: security, isPending } = useUserSecurityQuery(() => props.user.id);
</script>

<template>
  <Skeleton v-if="isPending" class="h-40 max-w-2xl" />
  <KeyValueCard
    v-else-if="security"
    title="Security"
    class="max-w-2xl"
    :status="user.status === 'Active' ? 'Healthy' : user.status"
    :rows="[
      { label: 'Last password change', value: security.lastPasswordChange },
      { label: 'Active sessions', value: security.activeSessions },
      { label: 'Failed sign-ins (30 days)', value: security.failedSignIns },
      { label: 'Two-factor', value: security.twoFactor },
    ]"
  />
  <div v-if="!['Invited', 'Deactivated'].includes(user.status)" class="flex flex-wrap gap-2">
    <Button variant="outline" @click="actions.resetPassword()">Send password reset</Button>
    <Button variant="outline" @click="actions.signOutEverywhere()">Sign out all sessions</Button>
    <Button v-if="user.status === 'Suspended'" variant="outline" @click="actions.reactivate()"
      >Reactivate user</Button
    >
    <Button v-else variant="destructive-outline" @click="actions.suspend()">Suspend user</Button>
    <Button variant="destructive-outline" @click="actions.deactivate()">Deactivate user</Button>
  </div>
</template>
