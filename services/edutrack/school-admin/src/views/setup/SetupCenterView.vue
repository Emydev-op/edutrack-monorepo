<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Progress } from '@edutrack/ui/components/progress';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { CheckIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';

import {
  useCompleteSetupStepMutation,
  useFinishSetupMutation,
  useSetupQuery,
} from '@/api/services/setup';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { SetupGroup, SetupStep } from '@/types';

const router = useRouter();
const auth = useAuthStore();
const { data: setup, isPending, isError, refetch } = useSetupQuery();
const complete = useCompleteSetupStepMutation();
const finish = useFinishSetupMutation();

const GROUPS: SetupGroup[] = ['Foundation', 'Academic structure', 'People', 'Operations'];

const stats = computed(() => {
  const steps = setup.value?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total: steps.length,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
    requiredLeft: steps.filter((s) => s.required && !s.done).length,
    optionalLeft: steps.filter((s) => !s.required && !s.done).length,
  };
});
const groups = computed(() =>
  GROUPS.map((name) => ({
    name,
    steps: (setup.value?.steps ?? []).filter((s) => s.group === name),
  })).filter((g) => g.steps.length),
);

/** The first step not done, in the Setup Center's order: where a new school goes next. */
const next = computed(() => setup.value?.steps.find((s) => !s.done) ?? null);
const lastDone = computed(
  () => [...(setup.value?.steps ?? [])].reverse().find((s) => s.done) ?? null,
);
const profileDone = computed(
  () => !!setup.value?.steps.find((s) => s.id === 'school-profile')?.done,
);
const actionLabel = (s: SetupStep) =>
  s.done ? 'Review' : setup.value?.onboarding ? 'Start' : 'Configure';

const badge = (s: SetupStep) =>
  s.done
    ? { label: 'Complete', tone: 'success' as const }
    : s.required
      ? { label: 'Required', tone: 'warning' as const }
      : { label: 'Optional', tone: 'neutral' as const };

async function markDone(step: SetupStep) {
  try {
    await complete.mutateAsync(step.id);
    toast.success(`${step.name} marked as done.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
  }
}

async function finishSetup() {
  try {
    await finish.mutateAsync();
    toast.success('Setup complete. Reopen the Setup Center from the dashboard any time.');
    await router.push({ name: routesPath.dashboard.name });
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Setup couldn’t be finished. Try again.'));
  }
}
</script>

<template>
  <PageHeader title="Setup Center" :description="setup?.intro">
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: routesPath.students.import.name }"
          >Import data</RouterLink
        ></Button
      >
      <Button v-if="setup?.onboarding && !setup.finished && next" as-child
        ><RouterLink :to="next.to">{{
          profileDone ? `Continue: ${next.name}` : 'Start with school profile'
        }}</RouterLink></Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="We couldn’t load your setup progress"
    description="Your setup isn’t affected. Try again in a moment."
    role="alert"
  >
    <template #action>
      <Button variant="outline" size="sm" @click="refetch()">Try again</Button>
    </template>
  </InlineNotice>

  <template v-else-if="isPending">
    <Skeleton class="h-24" />
    <Skeleton class="h-72" />
  </template>

  <template v-else-if="setup">
    <template v-if="setup.onboarding && !setup.finished">
      <InlineNotice
        v-if="!profileDone"
        tone="info"
        :title="`Welcome to ${auth.school?.name}, ${auth.user?.firstName}`"
        :description="`Edutrack set up your school on the ${auth.school?.plan.split(' ·')[0]} plan. Start with your school profile: it takes about 5 minutes and you can come back to it.`"
      >
        <template #action>
          <Button as-child size="sm"
            ><RouterLink
              :to="{ name: routesPath.school.profileEdit.name, query: { from: 'setup' } }"
              >Start school profile</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>
      <InlineNotice
        v-else-if="lastDone && next"
        tone="success"
        :title="`${lastDone.name} complete`"
        :description="`${stats.percent}% of setup done. Next: ${next.name}.`"
      >
        <template #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink :to="next.to">Continue to {{ next.name }}</RouterLink></Button
          >
        </template>
      </InlineNotice>
    </template>
    <InlineNotice
      v-if="setup.finished"
      tone="success"
      title="Setup is complete"
      description="You can still review or change any step. Optional steps can be finished any time."
    />
    <section
      class="flex flex-wrap items-center gap-5 rounded-lg border bg-card px-4.5 py-4"
      aria-label="Setup progress"
    >
      <div class="flex min-w-60 flex-1 flex-col gap-2">
        <div class="flex flex-wrap justify-between gap-2 text-[13px]">
          <span
            ><b class="text-base font-semibold">{{ stats.percent }}%</b> complete ·
            {{ stats.done }} of {{ stats.total }} steps</span
          >
          <span class="text-muted-foreground"
            >{{ stats.requiredLeft }} required · {{ stats.optionalLeft }} optional left</span
          >
        </div>
        <Progress
          :model-value="stats.percent"
          class="h-2"
          :aria-label="`${stats.percent}% complete`"
        />
        <span class="text-xs text-muted-foreground text-pretty">
          {{
            stats.requiredLeft
              ? `${stats.requiredLeft} required step${stats.requiredLeft > 1 ? 's' : ''} left before setup can be marked complete.`
              : 'All required steps are complete. Optional steps can be finished any time.'
          }}
          Steps don’t need to be done in order unless they depend on each other.
        </span>
      </div>
      <Button
        v-if="!setup.finished"
        size="lg"
        :disabled="stats.requiredLeft > 0 || finish.isPending.value"
        @click="finishSetup"
      >
        <Spinner v-if="finish.isPending.value" />
        Finish setup
      </Button>
    </section>

    <div class="grid items-start gap-4 xl:grid-cols-2">
      <section v-for="g in groups" :key="g.name" class="rounded-lg border bg-card">
        <h2 class="border-b border-divider px-4 py-3 text-sm font-semibold">{{ g.name }}</h2>
        <ul>
          <li
            v-for="s in g.steps"
            :key="s.id"
            class="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-3 border-t border-divider px-4 py-3 first:border-t-0"
          >
            <span
              :class="
                cn(
                  'mt-0.5 flex size-5.5 items-center justify-center rounded-full border',
                  s.done ? 'border-success bg-success text-white' : 'border-[#D9D5CD] bg-card',
                )
              "
              :aria-label="s.done ? 'Done' : 'Not done'"
              role="img"
            >
              <CheckIcon v-if="s.done" class="size-3" :stroke-width="3" />
            </span>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-2 text-[13px] font-medium"
                >{{ s.name }} <StatusBadge v-bind="badge(s)"
              /></span>
              <span class="text-xs text-muted-foreground text-pretty">{{ s.description }}</span>
              <span v-if="s.prerequisite && !s.done" class="text-xs text-faint">{{
                s.prerequisite
              }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <Button
                v-if="!s.done && !s.auto"
                variant="ghost"
                size="sm"
                :disabled="complete.isPending.value"
                @click="markDone(s)"
                >Mark done</Button
              >
              <Button as-child variant="outline" size="sm" class="text-primary"
                ><RouterLink :to="s.to">{{ actionLabel(s) }}</RouterLink></Button
              >
            </div>
          </li>
        </ul>
      </section>
    </div>
  </template>
</template>
