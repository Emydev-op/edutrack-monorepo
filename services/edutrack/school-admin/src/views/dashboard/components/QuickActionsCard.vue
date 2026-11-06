<script setup lang="ts">
import { RouterLink } from 'vue-router';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { QUICK_ACTIONS } from '../quick-actions';
</script>

<template>
  <SectionCard title="Quick actions">
    <div class="grid grid-cols-2 gap-2">
      <RouterLink
        v-for="q in QUICK_ACTIONS"
        :key="q.label"
        :to="q.to"
        class="group flex items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 text-[13px] font-medium transition hover:-translate-y-px hover:border-primary hover:shadow-[0_4px_14px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
      >
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-primary transition group-hover:bg-primary group-hover:text-white"
          aria-hidden="true"
        >
          <component :is="q.icon" class="size-4" />
        </span>
        {{ q.label }}
      </RouterLink>
    </div>
  </SectionCard>
</template>
