<script setup lang="ts">
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import ToggleList from '@edutrack/app-kit/components/common/ToggleList.vue';

import {
  useEmailPreferencesQuery,
  useSaveEmailPreferencesMutation,
} from '@/api/services/notifications';
import { useMeQuery } from '@/api/services/shell';
import { getApiErrorMessage } from '@/lib/api-errors';

const { data, isPending, error } = useEmailPreferencesQuery();
const { data: me } = useMeQuery();
const save = useSaveEmailPreferencesMutation();

/** Review emails only matter to reviewers; class reminders to everyone who teaches. */
const items = computed(() =>
  (data.value ?? [])
    .filter((p) => p.key !== 'review-waiting' || me.value?.isReviewer)
    .map((p) => ({ ...p, disabled: save.isPending.value })),
);

async function toggle(key: string, enabled: boolean) {
  try {
    await save.mutateAsync({ [key]: enabled });
    toast.success(enabled ? 'You’ll get these by email too.' : 'Email turned off for this.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Your setting wasn’t saved. Try again.'));
  }
}
</script>

<template>
  <PageHeader
    title="Notification settings"
    description="Choose which events also send you an email."
  />
  <InlineNotice
    tone="info"
    title="In-app notifications are always on."
    :description="`Everything below also appears in your notifications here. Emails go to ${me?.teacher.email ?? 'your work email'}.`"
  />
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Your settings couldn’t load. Refresh to try again.') }}
  </p>
  <Skeleton v-else-if="isPending" class="h-80 w-full" />
  <ToggleList v-else title="Email me when" :items="items" @toggle="toggle" />
</template>
