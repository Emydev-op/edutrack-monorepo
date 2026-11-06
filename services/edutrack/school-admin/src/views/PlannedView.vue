<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink, useRoute } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import { routesPath } from '@/router/routes-path';

/** Stands in for sidebar screens that later phases of the School Admin build will add. */
const route = useRoute();
</script>

<template>
  <PageHeader :title="String(route.meta.title)" />
  <EmptyState
    illustrated
    :title="`${route.meta.title} isn’t available yet`"
    description="This screen is planned for a later phase of School Admin. Its place in the menu and its address won’t change."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.dashboard.name }">Back to dashboard</RouterLink></Button
    >
  </EmptyState>
</template>
