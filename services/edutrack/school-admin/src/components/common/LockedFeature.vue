<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { LockKeyholeIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { planModule } from '@/config/plan-modules';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

/**
 * A page whose module isn't in the school's plan: what the feature does, that the plan doesn't
 * include it, and how to get it. Nothing is loaded for it.
 */
const props = defineProps<{ module: string }>();
const auth = useAuthStore();
const info = computed(() => planModule(props.module));
</script>

<template>
  <section
    class="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-14 text-center"
    aria-labelledby="locked-title"
  >
    <span
      class="flex size-14 items-center justify-center rounded-full bg-brand-subtle text-brand-strong"
      aria-hidden="true"
    >
      <LockKeyholeIcon class="size-6" />
    </span>
    <div class="flex flex-col gap-1.5">
      <p class="text-xs font-medium tracking-[0.04em] text-faint uppercase">
        {{ info?.group ?? 'Feature' }} · Not in your plan
      </p>
      <h1 id="locked-title" class="text-xl font-semibold">
        {{ info?.name ?? 'This feature' }}
      </h1>
      <p class="text-pretty text-muted-foreground">
        {{ info?.description }}. It isn’t included in your
        {{ auth.school?.plan ? `${auth.school.plan.split(' · ')[0]} ` : '' }}plan. Upgrade to unlock
        it for your school.
      </p>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <Button as-child>
        <RouterLink :to="{ name: routesPath.supportNew.name }">Request an upgrade</RouterLink>
      </Button>
      <Button as-child variant="outline">
        <RouterLink :to="{ name: routesPath.settings.name, query: { tab: 'subscription' } }"
          >See what your plan includes</RouterLink
        >
      </Button>
    </div>
  </section>
</template>
