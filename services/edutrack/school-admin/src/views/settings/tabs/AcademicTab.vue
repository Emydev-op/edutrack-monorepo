<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import ToggleList from '@edutrack/app-kit/components/common/ToggleList.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useAcademicSettingsQuery, useSaveAcademicSettingsMutation } from '@/api/services/settings';
import { routesPath } from '@/router/routes-path';
import type { AcademicPolicy } from '@/types';

const { data, isPending, isError, refetch } = useAcademicSettingsQuery();
const save = useSaveAcademicSettingsMutation();
const confirm = useConfirm();

const ITEMS: { key: keyof AcademicPolicy; label: string; description: string }[] = [
  {
    key: 'showPosition',
    label: 'Show class position on report cards',
    description:
      'Prints each student’s position in their class arm. Turn off if your school doesn’t rank.',
  },
  {
    key: 'reweightExempt',
    label: 'Re-weight exempt components',
    description:
      'A student exempt from a component (e.g. joined after CA 1) is scored on the rest, scaled to 100%. Off: the exempt component counts as 0.',
  },
  {
    key: 'promotionSuggestions',
    label: 'Suggest promotion decisions',
    description:
      'Marks each student eligible or not against your promotion rule and suggests a decision. Authorised staff always make the final call.',
  },
  {
    key: 'blockPromotionOnFees',
    label: 'Block promotion when fees are outstanding',
    description:
      'Students with an unpaid balance can’t be promoted until it’s cleared. Off by default; turn on only if your school policy requires it.',
  },
];

const items = computed(() =>
  ITEMS.map((i) => ({
    ...i,
    enabled: !!data.value?.[i.key],
    disabled: save.isPending.value,
  })),
);

/** What changes for people when a switch flips, so the impact is clear before it happens. */
const IMPACT: Partial<Record<keyof AcademicPolicy, [on: string, off: string]>> = {
  reweightExempt: [
    'Totals for students with an exempt component are recalculated on the rest of the scheme.',
    'Exempt components count as 0, which lowers those students’ totals and may change grades.',
  ],
  blockPromotionOnFees: [
    'Promotion decisions can’t be applied while a student marked Promote still owes fees.',
    'Students with outstanding fees can be promoted again.',
  ],
};

async function toggle(key: string, enabled: boolean) {
  const k = key as keyof AcademicPolicy;
  const label = ITEMS.find((i) => i.key === k)!.label;
  const impact = IMPACT[k];
  const apply = () => save.mutateAsync({ [k]: enabled });
  if (impact) {
    await confirm({
      title: `${enabled ? 'Turn on' : 'Turn off'} “${label}”?`,
      description: impact[enabled ? 0 : 1],
      details: [
        ['Applies to', 'Results not yet published and promotion decisions not yet applied'],
        ['Published results', 'Not changed. Use a correction request to change one.'],
      ],
      confirmLabel: enabled ? 'Turn on' : 'Turn off',
      action: async () => {
        await apply();
        toast.success(`${label} turned ${enabled ? 'on' : 'off'}.`);
      },
    });
    return;
  }
  try {
    await apply();
    toast.success(`${label} turned ${enabled ? 'on' : 'off'}.`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t save. Try again.'));
  }
}
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-4">
    <Skeleton class="h-36 w-full" /><Skeleton class="h-56 w-full" />
  </div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Academic settings couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
    <ToggleList title="Results & promotion" :items="items" @toggle="toggle" />

    <KeyValueCard
      title="Structure"
      :rows="[
        {
          label: 'Terms per session',
          value:
            data.termsPerSession === null
              ? 'No session yet'
              : `${data.termsPerSession} · ${data.session}`,
        },
        { label: 'Pass mark', value: `${data.passMark}%` },
        ...(data.schemes.length
          ? data.schemes.map((s) => ({ label: s.section, value: s.summary }))
          : [{ label: 'Assessment schemes', value: 'Not set up yet' }]),
        { label: 'Promotion rule', value: data.promotionRule ?? 'Set when a session is closed' },
      ]"
    >
      <template #action>
        <RouterLink
          :to="{ name: routesPath.academics.assessments.name }"
          class="text-xs font-medium text-primary hover:underline"
          >Assessments & grading</RouterLink
        >
      </template>
    </KeyValueCard>
  </div>
</template>
