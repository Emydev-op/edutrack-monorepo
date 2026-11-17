<script setup lang="ts">
import { LockKeyholeIcon } from '@lucide/vue';

/**
 * Shown in place of a page the signed-in role can't open: what the page is, what the role is
 * missing, and who can change it. Actions (back, dashboard…) go in the default slot.
 */
withDefaults(
  defineProps<{
    /** The page or area, e.g. "Subscriptions". */
    area: string;
    /** The person's role, e.g. "Support Agent". */
    roleName?: string;
    /** Permissions the role lacks, as people read them: "Subscriptions · View". */
    missing?: string[];
    /** Who can grant access, e.g. "a Platform Administrator". */
    contact?: string;
  }>(),
  { roleName: '', missing: () => [], contact: 'an administrator' },
);
</script>

<template>
  <section
    role="alert"
    aria-live="polite"
    class="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border bg-card px-6 py-12 text-center sm:px-10"
  >
    <div class="relative grid size-28 place-items-center" aria-hidden="true">
      <span class="absolute inset-0 rounded-full bg-brand-subtle/60" />
      <span class="absolute inset-3 rounded-full bg-brand-subtle" />
      <span
        class="relative grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm ring-4 ring-card"
      >
        <LockKeyholeIcon class="size-7" />
      </span>
    </div>

    <div class="flex flex-col gap-1.5">
      <p class="text-xs font-medium tracking-wide text-brand-strong uppercase">Restricted</p>
      <h1 class="text-xl font-semibold">You don't have access to {{ area }}</h1>
      <p class="max-w-md text-sm text-muted-foreground">
        <template v-if="roleName"
          >Your role, <span class="font-medium text-foreground">{{ roleName }}</span
          >, doesn't include this page.</template
        >
        <template v-else>Your role doesn't include this page.</template>
        Ask {{ contact }} if you need it for your work.
      </p>
    </div>

    <div v-if="missing.length" class="flex flex-col items-center gap-2">
      <span class="text-xs text-faint">Needs</span>
      <ul class="flex flex-wrap justify-center gap-1.5">
        <li
          v-for="item in missing"
          :key="item"
          class="rounded-md border border-dashed bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {{ item }}
        </li>
      </ul>
    </div>

    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </section>
</template>
