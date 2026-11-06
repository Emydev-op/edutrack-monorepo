<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="text-3xl font-semibold">Page not found</h1>
    <p class="text-muted-foreground">The page you are looking for does not exist.</p>
    <Button as-child variant="outline">
      <RouterLink :to="{ name: 'home' }">Back home</RouterLink>
    </Button>
  </main>
</template>
