<script setup lang="ts">
import { computed } from 'vue';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import {
  useSecuritySettingsQuery,
  useUpdateSecuritySettingsMutation,
} from '@/api/services/settings';
import CardGrid from '@edutrack/app-kit/components/common/CardGrid.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import ToggleList from '@edutrack/app-kit/components/common/ToggleList.vue';
import type { SecuritySettings } from '@/types';

const { data: settings } = useSecuritySettingsQuery();
const update = useUpdateSecuritySettingsMutation();

const toggles = computed(() => [
  {
    key: 'newDeviceAlerts',
    label: 'Email users when they sign in from a new device',
    description: 'Recommended',
    enabled: settings.value?.newDeviceAlerts ?? false,
    disabled: !settings.value,
  },
  {
    key: 'ipRestriction',
    label: 'Restrict sign-in to approved IP ranges',
    description: 'Off · staff work remotely',
    enabled: settings.value?.ipRestriction ?? false,
    disabled: !settings.value,
  },
]);

async function toggle(key: string, enabled: boolean) {
  try {
    await update.mutateAsync({ [key]: enabled } as Partial<SecuritySettings>);
    toast.success('Security setting updated.');
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'The setting wasn’t saved. Try again.'));
  }
}
</script>

<template>
  <CardGrid>
    <KeyValueCard
      title="Password policy"
      :rows="[
        { label: 'Minimum length', value: '8 characters' },
        { label: 'Complexity', value: 'Upper and lower case, a number, a symbol' },
        { label: 'Expiry', value: 'None (NIST guidance)' },
        { label: 'Reuse', value: 'Last 5 passwords blocked' },
      ]"
    />
    <KeyValueCard
      title="Sessions"
      :rows="[
        { label: 'Idle timeout', value: '30 minutes' },
        { label: 'Maximum session', value: '12 hours' },
        { label: 'Remember this device', value: '30 days' },
      ]"
    />
    <KeyValueCard
      title="Failed sign-in protection"
      :rows="[
        { label: 'Lock after', value: '5 failed attempts' },
        { label: 'Lock duration', value: '15 minutes' },
        { label: 'Alert', value: 'Email to Platform Administrators' },
      ]"
    />
    <KeyValueCard
      title="Two-factor authentication"
      status="Coming soon"
      :rows="[
        { label: 'Status', value: 'Coming soon' },
        { label: 'Plan', value: 'Authenticator app codes for all platform users' },
      ]"
    />
  </CardGrid>
  <ToggleList title="Sign-in security" :items="toggles" class="max-w-xl" @toggle="toggle" />
</template>
