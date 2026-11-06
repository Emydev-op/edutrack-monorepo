<script setup lang="ts">
import { Badge } from '@edutrack/ui/components/badge';
import { Button } from '@edutrack/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@edutrack/ui/components/card';
import { RouterLink } from 'vue-router';

import { useApiHealth } from '@/composables/useApiHealth';

const { data, isPending, isError } = useApiHealth();
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-muted p-6">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle class="text-2xl">EduTrack · Student Portal</CardTitle>
        <CardDescription>Students viewing timetables, assignments and results.</CardDescription>
      </CardHeader>
      <CardContent class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">API status</span>
        <Badge v-if="isPending" variant="secondary">Checking…</Badge>
        <Badge v-else-if="isError" variant="destructive">Unreachable</Badge>
        <Badge v-else>{{ data?.status }}</Badge>
      </CardContent>
      <CardFooter>
        <Button as-child class="w-full">
          <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
        </Button>
      </CardFooter>
    </Card>
  </main>
</template>
