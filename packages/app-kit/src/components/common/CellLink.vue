<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';

defineProps<{ to: RouteLocationRaw; label: string; detail?: string }>();
</script>

<template>
  <RouterLink :to="to" class="font-medium text-primary hover:text-brand-strong hover:underline">{{
    label
  }}</RouterLink>
  <span v-if="detail" class="text-xs text-faint">{{ detail }}</span>
</template>
