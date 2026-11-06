<script setup lang="ts">
import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import type { PlatformUser } from '@/types';

defineProps<{ user: PlatformUser }>();
</script>

<template>
  <CardGrid>
    <KeyValueCard
      title="Profile"
      :rows="[
        { label: 'First name', value: user.firstName },
        { label: 'Last name', value: user.lastName },
        { label: 'Email', value: user.email },
        { label: 'Phone', value: user.phone },
        { label: 'Role', value: user.roleName },
      ]"
    />
    <KeyValueCard
      title="Account"
      :status="user.status"
      :rows="[
        { label: 'Status', value: user.status },
        { label: 'Created', value: user.createdAt },
        { label: 'Last login', value: user.lastSeen },
        { label: 'Invitation', value: user.invitation ?? 'Accepted' },
      ]"
    />
  </CardGrid>
</template>
