<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import { useBranchesQuery } from '@/api/services/school';
import { useCompleteSetupStepMutation, useSetupQuery } from '@/api/services/setup';
import { routesPath } from '@/router/routes-path';
import type { Branch } from '@/types';

/** Setup Center step 2: check the branches Edutrack created and confirm them. */
const router = useRouter();
const confirm = useConfirm();
const { data: list, isPending } = useBranchesQuery();
const { data: setup } = useSetupQuery();
const complete = useCompleteSetupStepMutation();

const branches = computed(() => list.value?.branches ?? []);
const active = computed(() => branches.value.filter((b) => b.status === 'Active'));
const full = computed(() => !!list.value && branches.value.length >= list.value.branchLimit);
const done = computed(() => !!setup.value?.steps.find((s) => s.id === 'branches')?.done);
const stepIndex = computed(
  () => (setup.value?.steps.findIndex((s) => s.id === 'branches') ?? 1) + 1,
);
const nextAfter = computed(() => {
  const steps = setup.value?.steps ?? [];
  return steps.slice(steps.findIndex((s) => s.id === 'branches') + 1).find((s) => !s.done)?.name;
});

const issues = (b: Branch) => [
  ...(!b.street || !b.city ? ['Address incomplete'] : []),
  ...(!b.sections.length ? ['No sections'] : []),
];
const bad = computed(() => active.value.filter((b) => issues(b).length));
const editTo = (b: Branch) => ({
  name: routesPath.school.branchEdit.name,
  params: { id: b.id },
  query: { from: 'setup' },
});
const addTo = { name: routesPath.school.branchNew.name, query: { from: 'setup' } };

function addBranch() {
  if (!full.value) return void router.push(addTo);
  void confirm({
    title: `Your ${list.value!.planName} plan allows ${list.value!.branchLimit} branches`,
    description: 'You’re using all of them. Ask Edutrack to upgrade your plan to add more.',
    confirmLabel: 'OK',
  });
}

function finish() {
  if (done.value) return void router.push({ name: routesPath.setup.name });
  if (!active.value.length)
    return void confirm({
      title: 'Add at least one active branch',
      description: 'Every school needs one campus to hold its classes, staff and students.',
      confirmLabel: 'Add branch',
      action: () => router.push(addTo),
    });
  if (bad.value.length) {
    const first = bad.value[0]!;
    return void confirm({
      title: `${bad.value.length} branch${bad.value.length > 1 ? 'es need' : ' needs'} details`,
      description: `Complete these before marking the step done: ${bad.value.map((b) => `${b.name} (${issues(b).join(', ').toLowerCase()})`).join('; ')}.`,
      confirmLabel: `Fix ${first.name}`,
      action: () => router.push(editTo(first)),
    });
  }
  const noHead = active.value.filter((b) => !b.headId).length;
  void confirm({
    title: 'Mark Branches complete?',
    details: [
      ['Branches', active.value.map((b) => `${b.name} · ${b.code}`).join(', ')],
      ['Sections', [...new Set(active.value.flatMap((b) => b.sections))].join(', ')],
      [
        'Heads of campus',
        noHead ? `${noHead} not assigned yet · add them after Staff` : 'All assigned',
      ],
      [
        'Plan',
        `${branches.value.length} of ${list.value!.branchLimit} branches on ${list.value!.planName}`,
      ],
      ...(nextAfter.value ? ([['Next step', nextAfter.value]] as [string, string][]) : []),
    ],
    confirmLabel: 'Mark complete',
    action: async () => {
      await complete.mutateAsync('branches');
      toast.success(`Branches complete.${nextAfter.value ? ` Next: ${nextAfter.value}.` : ''}`);
      await router.push({ name: routesPath.setup.name });
    },
  });
}
</script>

<template>
  <PageHeader
    title="Branches"
    :description="
      list
        ? `Setup Center · step ${stepIndex} of ${setup?.steps.length ?? 16} · ${branches.length} of ${list.branchLimit} branches on your ${list.planName} plan`
        : undefined
    "
  >
    <template #actions>
      <Button variant="outline" @click="addBranch">Add branch</Button>
      <Button @click="finish">{{ done ? 'Save and return' : 'Mark Branches complete' }}</Button>
    </template>
  </PageHeader>

  <Skeleton v-if="isPending" class="h-64" />
  <template v-else-if="list">
    <InlineNotice
      v-if="done"
      tone="success"
      title="Branches step complete"
      description="You can still edit branches here or from School → Branches."
    />
    <InlineNotice
      tone="info"
      :title="`Edutrack created ${branches.length === 1 ? branches[0]!.name : `${branches.length} branches`} from your provisioning details`"
      description="Check each address and the sections it runs. A single-campus school only needs one branch, and you can add more later."
    />
    <InlineNotice
      v-if="bad.length"
      tone="error"
      :title="`${bad.length} branch${bad.length > 1 ? 'es are' : ' is'} missing details`"
      :description="bad.map((b) => `${b.name}: ${issues(b).join(', ').toLowerCase()}`).join(' · ')"
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="editTo(bad[0]!)">Fix {{ bad[0]!.name }}</RouterLink></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="full"
      tone="warning"
      title="Branch limit reached"
      :description="`You’re using ${list.branchLimit} of ${list.branchLimit} branches on the ${list.planName} plan.`"
    />

    <div class="grid gap-3 md:grid-cols-2">
      <RouterLink
        v-for="b in branches"
        :key="b.id"
        :to="editTo(b)"
        class="flex flex-col gap-1.5 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
      >
        <span class="flex items-start justify-between gap-2">
          <span class="flex flex-col">
            <span class="font-semibold">{{ b.name }}</span>
            <span class="text-xs text-muted-foreground"
              >{{ b.code }} ·
              {{ [b.street, b.city].filter(Boolean).join(', ') || 'Address missing' }}</span
            >
          </span>
          <StatusBadge
            :label="b.status !== 'Active' ? 'Inactive' : issues(b).length ? 'Missing' : 'Ready'"
            :tone="b.status !== 'Active' ? 'neutral' : issues(b).length ? 'warning' : 'success'"
          />
        </span>
        <span class="text-[13px] text-body">Sections: {{ b.sections.join(', ') || 'none' }}</span>
        <span class="text-[13px] text-body"
          >Head of campus: {{ b.headName ?? 'assign after adding staff' }}</span
        >
        <span class="text-[13px] text-body">{{ b.hasStore ? `${b.name} Store` : 'No store' }}</span>
        <span class="text-xs" :class="issues(b).length ? 'text-error-strong' : 'text-faint'">{{
          issues(b).length ? `Needs: ${issues(b).join(', ')}` : 'Ready · click to review'
        }}</span>
      </RouterLink>
    </div>
  </template>
</template>
