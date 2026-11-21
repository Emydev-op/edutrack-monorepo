<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';

import { getApiErrorMessage, isNotFound } from '@/lib/api-errors';

/** Loading skeletons, or the error with a retry, until a screen's data is in. */
defineProps<{ loading: boolean; error: unknown; rows?: number }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-3" aria-busy="true">
    <Skeleton class="h-20 w-full" />
    <Skeleton v-for="i in rows ?? 2" :key="i" class="h-32 w-full" />
  </div>
  <EmptyState
    v-else-if="error"
    :title="isNotFound(error) ? 'Not found' : 'This didn’t load'"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button v-if="!isNotFound(error)" variant="outline" size="sm" @click="$emit('retry')"
      >Try again</Button
    >
  </EmptyState>
</template>
