<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ShieldAlertIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { useMyScopeQuery } from '@/api/services/shell';
import { useTermContext } from '@/composables/useTermContext';
import { routesPath } from '@/router/routes-path';

/**
 * "You don't have access to …": shown when a teacher opens something outside their scope (a
 * 403 from the API, or a role-only page). Lists what they *are* assigned to this term, never
 * anything about what they asked for.
 *
 * In a feature view: `<AccessDenied v-if="isForbidden(error)" what="JSS 3A · Mathematics" />`.
 */
const props = defineProps<{
  /** What they tried to open, e.g. "JSS 3A · Mathematics" or "My class". */
  what: string;
  /** Why, when there's more to say (e.g. "My class is for class teachers."). */
  reason?: string;
}>();

const { term } = useTermContext();
const { data: scope, isPending } = useMyScopeQuery();
const multi = computed(() => scope.value?.multiCampus ?? false);
const title = computed(() => `You don’t have access to ${props.what}`);
</script>

<template>
  <section
    class="flex flex-col items-center gap-4 rounded-lg border bg-card px-6 py-10 text-center max-sm:px-4"
    role="alert"
  >
    <span
      class="flex size-11 items-center justify-center rounded-full bg-warning-subtle text-warning-strong"
      aria-hidden="true"
    >
      <ShieldAlertIcon class="size-5" />
    </span>
    <div class="flex max-w-md flex-col gap-1.5">
      <h2 class="text-lg font-semibold text-balance">{{ title }}</h2>
      <p class="text-[13px] text-pretty text-muted-foreground">
        {{ reason ?? 'It isn’t one of your classes for the selected term.' }} You can only see
        classes, students and work inside your own assignments.
      </p>
    </div>
    <div class="flex w-full max-w-md flex-col gap-2 text-left">
      <span class="text-xs font-medium text-muted-foreground"
        >What you’re assigned to · {{ term?.label }}</span
      >
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p
        v-else-if="!scope?.assignments.length && !scope?.classArm"
        class="rounded-md bg-muted px-3 py-2.5 text-[13px] text-muted-foreground"
      >
        No classes yet. The academic office assigns classes; they appear here once they do.
      </p>
      <ul v-else class="flex flex-col divide-y divide-divider rounded-md border">
        <li v-if="scope?.classArm" class="px-3 py-2 text-[13px]">
          <span class="font-medium">Class teacher</span> · {{ scope.classArm.name }}
          <span class="text-faint">· {{ scope.classArm.branchName }}</span>
        </li>
        <li v-for="a in scope?.assignments" :key="a.id">
          <RouterLink
            :to="{
              name: routesPath.teaching.class.name,
              params: { armId: a.armId, subject: a.subject },
            }"
            class="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-muted"
          >
            <span class="min-w-0 truncate"
              >{{ a.armName }} · {{ a.subjectName
              }}<span v-if="multi" class="text-faint"> · {{ a.branchName }}</span></span
            >
            <span class="shrink-0 text-xs text-faint">{{ a.students }} students</span>
          </RouterLink>
        </li>
      </ul>
    </div>
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.dashboard.name }">Back to dashboard</RouterLink></Button
    >
  </section>
</template>
