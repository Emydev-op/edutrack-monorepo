<script setup lang="ts">
import type { Component } from 'vue';

import PoweredBy from './PoweredBy.vue';

defineProps<{ icon: Component; title: string }>();
</script>

<template>
  <main class="flex min-h-svh flex-col bg-background px-4 sm:px-6">
    <div class="m-auto flex w-full max-w-[420px] flex-col items-center gap-5 py-12 text-center">
      <span
        class="flex size-14 items-center justify-center rounded-2xl bg-brand-tint text-primary ring-1 ring-brand-subtle"
      >
        <component :is="icon" class="size-6" aria-hidden="true" />
      </span>
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl font-semibold text-balance">{{ title }}</h1>
        <slot />
      </div>
      <slot name="action" />
    </div>
    <footer class="flex justify-center pb-6"><PoweredBy /></footer>
  </main>
</template>
