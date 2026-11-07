<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useAccountsQuery,
  useFeesQuery,
  useFinanceOptionsQuery,
  useStartFeesMutation,
} from '@/api/services/finance';
import SetupStepBar from '@/components/academics/SetupStepBar.vue';
import { routesPath } from '@/router/routes-path';

import BillingSettingsTab from './BillingSettingsTab.vue';
import DiscountsTab from './DiscountsTab.vue';
import FeeItemsTab from './FeeItemsTab.vue';
import FeeStructuresTab from './FeeStructuresTab.vue';
import PlansTab from './PlansTab.vue';

type Tab = 'structures' | 'items' | 'discounts' | 'plans' | 'settings';
const TABS: [Tab, string][] = [
  ['structures', 'Fee structures'],
  ['items', 'Fee items'],
  ['discounts', 'Discounts'],
  ['plans', 'Payment plans'],
  ['settings', 'Billing settings'],
];

const route = useRoute();
const confirm = useConfirm();
const { data, isPending, isError, refetch } = useFeesQuery({});
const { data: options } = useFinanceOptionsQuery();
const { data: accounts } = useAccountsQuery();
const start = useStartFeesMutation();

const tab = computed<Tab>(() => {
  const t = route.query.tab;
  return TABS.some(([k]) => k === t) ? (t as Tab) : 'structures';
});
const tabs = computed(() =>
  TABS.map(([key, label]) => ({
    label,
    to: { query: { ...route.query, tab: key === 'structures' ? undefined : key } },
    active: tab.value === key,
  })),
);

const currentTerm = computed(() =>
  options.value?.terms.find((t) => t.id === options.value?.currentTermId),
);
const currentStructures = computed(
  () => data.value?.structures.filter((s) => s.termId === options.value?.currentTermId) ?? [],
);
const hasParentAccount = computed(
  () => !!accounts.value?.rows.some((a) => a.status === 'Active' && a.showToParents),
);

/** Mirrors the server: published current-term fees at every branch, and an account for parents. */
const blocked = computed(() => {
  if (!data.value?.started) return 'Add your fee items first, starting with Tuition.';
  const unpublished = currentStructures.value.filter((s) => s.status !== 'Published');
  if (unpublished.length)
    return `Publish ${currentTerm.value?.name ?? 'this term’s'} fees for ${unpublished.map((s) => s.branch).join(', ')} first.`;
  if (accounts.value && !hasParentAccount.value)
    return 'Add the bank account parents pay into in Bank & Cash Accounts and mark it “Shown to parents”.';
  return undefined;
});
const stepDetails = computed<[string, string][]>(() => [
  ['Fee items', String(data.value?.items.filter((i) => i.status === 'Active').length ?? 0)],
  [
    currentTerm.value ? `${currentTerm.value.name} fees` : 'This term',
    currentStructures.value.map((s) => `${s.branch}: ${s.status}`).join(' · ') || '—',
  ],
  [
    'Parents pay into',
    accounts.value?.rows
      .filter((a) => a.showToParents)
      .map((a) => `${a.bank} ${a.accountNumber}`)
      .join(', ') || '—',
  ],
]);

function begin(mode: 'suggested' | 'tuition') {
  void confirm({
    title: mode === 'suggested' ? 'Use the suggested fee items?' : 'Start with Tuition only?',
    description:
      mode === 'suggested'
        ? 'We add typical items for Nigerian private schools and a draft of this term’s amounts. Every amount is yours to change before you publish.'
        : 'We add Tuition. Add other items and enter amounts afterwards.',
    confirmLabel: 'Add fee items',
    action: async () => {
      await start.mutateAsync(mode);
      toast.success(
        mode === 'suggested'
          ? 'Fee items added with draft amounts. Review them, then publish.'
          : 'Tuition added. Enter amounts per class, then publish.',
      );
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Fees"
      description="Fee structure → student charge → invoice. Structures are set per term and branch, and vary by class."
    >
      <template v-if="data?.started" #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.finance.invoices.name }"
            >Invoices</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink :to="{ name: routesPath.finance.feeStructure.name }"
            >Edit amounts</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <SetupStepBar step="fees" :details="stepDetails" :blocked="blocked" />
    <InlineNotice
      v-if="data?.started && accounts && !hasParentAccount"
      tone="warning"
      title="Parents have no account to pay into"
      description="Invoices and reminders show the school’s bank details. Add the account in Bank & Cash Accounts."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.finance.accounts.name }"
            >Bank & Cash Accounts</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>

    <div v-if="isPending" class="flex flex-col gap-3">
      <Skeleton class="h-10 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
    <InlineNotice
      v-else-if="isError || !data"
      tone="error"
      title="Fees couldn’t load"
      description="Check your connection and try again."
    >
      <template #action
        ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
      >
    </InlineNotice>

    <!-- First time: choose how to start. -->
    <template v-else-if="!data.started">
      <InlineNotice
        v-if="data.prerequisites.length"
        tone="warning"
        :title="`Needs: ${data.prerequisites.join(', ')}`"
        description="Fees are set per term and class, so the academic session and classes come first."
      >
        <template #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink
              :to="{
                name: data.prerequisites.includes('Academic Session')
                  ? routesPath.academics.sessions.name
                  : routesPath.academics.classes.name,
              }"
              >Open {{ data.prerequisites[0] }}</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>
      <SectionCard
        title="How do you want to start?"
        description="Suggested items and amounts are typical for Nigerian private schools. They’re a starting point only; every amount is yours to change."
      >
        <ul class="flex flex-col divide-y divide-divider rounded-md border text-[13px]">
          <li
            v-for="s in data.suggested"
            :key="s.name"
            class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
          >
            <span class="flex items-center gap-2 font-medium">
              <span
                class="size-2 rounded-full"
                :class="s.type === 'Compulsory' ? 'bg-primary' : 'bg-faint'"
              />
              {{ s.name }}
            </span>
            <span class="text-muted-foreground">{{ s.type }} · {{ s.charged }}</span>
          </li>
        </ul>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            :disabled="!!data.prerequisites.length || start.isPending.value"
            @click="begin('suggested')"
            ><Spinner v-if="start.isPending.value" />Use suggested fee items</Button
          >
          <Button
            variant="outline"
            :disabled="!!data.prerequisites.length || start.isPending.value"
            @click="begin('tuition')"
            >Start with Tuition only</Button
          >
        </div>
      </SectionCard>
    </template>

    <template v-else>
      <TabNav :tabs="tabs" label="Fees sections" />
      <FeeStructuresTab v-if="tab === 'structures'" :overview="data" />
      <FeeItemsTab v-else-if="tab === 'items'" :items="data.items" />
      <DiscountsTab v-else-if="tab === 'discounts'" />
      <PlansTab v-else-if="tab === 'plans'" />
      <BillingSettingsTab v-else />
    </template>
  </div>
</template>
