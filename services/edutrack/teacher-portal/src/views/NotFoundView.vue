<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import { routesPath } from '@/router/routes-path';
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-background p-6">
    <EmptyState
      title="Page not found"
      description="The page you are looking for doesn't exist or has moved."
      illustrated
      class="w-full max-w-md"
    >
      <Button as-child
        ><RouterLink :to="{ name: routesPath.dashboard.name }"
          >Back to dashboard</RouterLink
        ></Button
      >
    </EmptyState>
  </main>
</template>
