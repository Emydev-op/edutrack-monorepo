<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useCompleteSetupStepMutation, useSetupQuery } from '@/api/services/setup';
import { routesPath } from '@/router/routes-path';

/**
 * Shown on an Academics screen that is also a Setup Center step. Opened from the Setup Center
 * (`?from=setup`) it says which step this is and offers "Mark … complete"; once the step is done
 * it confirms that and links back. Steps the server completes on save (session, terms) pass
 * `auto` and get no button.
 */
const props = defineProps<{
  step: string;
  /** What completing confirms, shown in the dialog. */
  details?: [string, string][];
  /** Why the step can't be completed yet; disables the button with this hint. */
  blocked?: string;
  auto?: boolean;
  /** Run before marking complete, e.g. save unsaved edits. Return false to stop. */
  before?: () => Promise<boolean> | boolean;
}>();

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const { data: setup } = useSetupQuery();
const complete = useCompleteSetupStepMutation();

const fromSetup = computed(() => route.query.from === 'setup');
const steps = computed(() => setup.value?.steps ?? []);
const index = computed(() => steps.value.findIndex((s) => s.id === props.step));
const current = computed(() => steps.value[index.value]);
const nextStep = computed(() => steps.value.slice(index.value + 1).find((s) => !s.done));
const show = computed(() => !!current.value && (fromSetup.value || !current.value.done));
const setupFinished = computed(() => !!setup.value?.finished);

defineExpose({ fromSetup });

async function markComplete() {
  if (props.before && !(await props.before())) return;
  void confirm({
    title: `Mark ${current.value!.name} complete?`,
    details: [
      ...(props.details ?? []),
      ...(nextStep.value ? ([['Next step', nextStep.value.name]] as [string, string][]) : []),
    ],
    confirmLabel: 'Mark complete',
    action: async () => {
      await complete.mutateAsync(props.step);
      toast.success(
        `${current.value!.name} complete.${nextStep.value ? ` Next: ${nextStep.value.name}.` : ''}`,
      );
      if (fromSetup.value) await router.push({ name: routesPath.setup.name });
    },
  });
}
</script>

<template>
  <template v-if="show && !setupFinished">
    <InlineNotice
      v-if="current!.done"
      tone="success"
      :title="`${current!.name} step complete`"
      description="Changes you make here keep the Setup Center up to date."
    >
      <template v-if="fromSetup" #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.setup.name }"
            >Back to Setup Center</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-else
      tone="info"
      :title="`Setup Center · step ${index + 1} of ${steps.length} · ${current!.name}`"
      :description="
        blocked ||
        (auto
          ? 'This step completes when you save.'
          : `When everything here looks right, mark ${current!.name} complete to move on.`)
      "
    >
      <template #action>
        <div class="flex shrink-0 gap-2">
          <Button v-if="fromSetup" as-child variant="ghost" size="sm"
            ><RouterLink :to="{ name: routesPath.setup.name }">Setup Center</RouterLink></Button
          >
          <Button
            v-if="!auto"
            size="sm"
            :disabled="!!blocked || complete.isPending.value"
            @click="markComplete"
            >Mark {{ current!.name }} complete</Button
          >
        </div>
      </template>
    </InlineNotice>
  </template>
</template>
