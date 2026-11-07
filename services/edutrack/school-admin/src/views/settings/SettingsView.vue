<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { HistoryIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';

import type { SettingsTab } from '@/types';
import NotificationSettingsPanel from '@/views/communication/NotificationSettingsPanel.vue';

import ChangeHistoryDrawer from './ChangeHistoryDrawer.vue';
import AcademicTab from './tabs/AcademicTab.vue';
import FinanceTab from './tabs/FinanceTab.vue';
import ModulesTab from './tabs/ModulesTab.vue';
import SchoolTab from './tabs/SchoolTab.vue';
import SecurityTab from './tabs/SecurityTab.vue';
import SubscriptionTab from './tabs/SubscriptionTab.vue';

const TABS: [SettingsTab, string][] = [
  ['school', 'School'],
  ['academic', 'Academic'],
  ['finance', 'Finance'],
  ['notifications', 'Notifications'],
  ['subscription', 'Subscription'],
  ['modules', 'Modules'],
  ['security', 'Security'],
];

const route = useRoute();
const tab = computed<SettingsTab>(() => {
  const t = route.query.tab;
  return TABS.some(([k]) => k === t) ? (t as SettingsTab) : 'school';
});
const tabs = computed(() =>
  TABS.map(([key, label]) => ({
    label,
    to: { query: { ...route.query, tab: key === 'school' ? undefined : key } },
    active: tab.value === key,
  })),
);

const DESCRIPTIONS: Record<SettingsTab, string> = {
  school: 'Regional settings and how record numbers are written.',
  academic: 'How results are calculated and how promotion decisions are made.',
  finance: 'How payments are confirmed. More billing rules are in Fees → Billing settings.',
  notifications: 'Which messages go out automatically, and on which channels.',
  subscription: 'Your Edutrack plan and what you’re using.',
  modules: 'What your plan includes and what’s coming next.',
  security: 'Your password and devices, and the sign-in rules for staff.',
};

const historyOpen = ref(false);
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeader
      title="Settings"
      :description="`Changes here are configuration, not records. Each change is logged. ${DESCRIPTIONS[tab]}`"
    >
      <template #actions>
        <Button variant="outline" @click="historyOpen = true">
          <HistoryIcon class="size-4" /> Change history
        </Button>
      </template>
    </PageHeader>

    <TabNav :tabs="tabs" label="Settings sections" />

    <SchoolTab v-if="tab === 'school'" />
    <AcademicTab v-else-if="tab === 'academic'" />
    <FinanceTab v-else-if="tab === 'finance'" />
    <NotificationSettingsPanel v-else-if="tab === 'notifications'" />
    <SubscriptionTab v-else-if="tab === 'subscription'" />
    <ModulesTab v-else-if="tab === 'modules'" />
    <SecurityTab v-else />

    <ChangeHistoryDrawer v-model:open="historyOpen" />
  </div>
</template>
