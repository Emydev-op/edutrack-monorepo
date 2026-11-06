<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

import { FIRST_STEPS } from '../quick-actions';
</script>

<template>
  <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <li v-for="(s, i) in FIRST_STEPS" :key="s.title">
      <RouterLink
        :to="s.to"
        class="group flex h-full flex-col gap-1.5 rounded-lg border bg-card p-4 transition hover:-translate-y-px hover:border-primary hover:shadow-[0_4px_14px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
      >
        <span
          class="self-start rounded-sm bg-brand-subtle px-1.5 py-0.5 text-[11px] font-semibold text-primary transition group-hover:bg-primary group-hover:text-white"
          >Step {{ i + 1 }}</span
        >
        <span class="font-semibold">{{ s.title }}</span>
        <span class="text-[13px] text-muted-foreground">{{ s.text }}</span>
        <ArrowRightIcon
          class="mt-auto size-4 text-primary transition group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </RouterLink>
    </li>
  </ol>
</template>
