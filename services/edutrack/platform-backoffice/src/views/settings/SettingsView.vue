<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { routesPath } from '@/router/routes-path';

const route = useRoute();
const { settings: s } = routesPath;
const tabs = computed(() =>
  [
    ['My profile', s.profile.name],
    ['Users & Access', s.access.name],
    ['Notifications', s.notifications.name],
    ['Security', s.security.name],
  ].map(([label, name]) => ({ label: label!, to: { name }, active: route.name === name })),
);
const description = computed(() =>
  route.name === s.profile.name
    ? 'Your own account details. Changes apply only to you.'
    : 'Platform-wide configuration. Every change is recorded in the audit log.',
);
</script>

<template>
  <PageHeader title="Settings" :description="description" />
  <TabNav :tabs="tabs" label="Settings sections" />
  <RouterView />
</template>
