<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';

import AccessDenied from '@/components/common/AccessDenied.vue';
import { getApiErrorMessage, isForbidden, isNotFound } from '@/lib/api-errors';

/**
 * The error states of a teaching record page: 403 → "You don't have access to …" (with what the
 * teacher does teach), 404 → not found with a way back, anything else → retry.
 */
const props = defineProps<{
  error: unknown;
  /** What was asked for, when the API's 403 message doesn't name it. */
  what: string;
  notFoundTitle: string;
  back: { label: string; to: RouteLocationRaw };
  /** Overrides AccessDenied's default "isn't one of your classes" line. */
  reason?: string;
}>();
defineEmits<{ retry: [] }>();

/** The API's 403 names what was asked for ("You don’t have access to JSS 3A · Mathematics. …"). */
const named = computed(
  () =>
    /^You don’t have access to (.+?)\. /.exec(getApiErrorMessage(props.error, ''))?.[1] ??
    props.what,
);
</script>

<template>
  <AccessDenied v-if="isForbidden(error)" :what="named" :reason="reason" />
  <EmptyState
    v-else-if="isNotFound(error)"
    illustrated
    :title="notFoundTitle"
    :description="getApiErrorMessage(error, 'It may have been removed, or the link is wrong.')"
  >
    <Button as-child variant="outline"
      ><RouterLink :to="back.to">{{ back.label }}</RouterLink></Button
    >
  </EmptyState>
  <EmptyState
    v-else
    title="This page couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <Button variant="outline" @click="$emit('retry')">Try again</Button>
  </EmptyState>
</template>
