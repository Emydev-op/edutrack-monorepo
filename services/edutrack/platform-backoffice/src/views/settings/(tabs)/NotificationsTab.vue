<script setup lang="ts">
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Skeleton } from '@edutrack/ui/components/skeleton';

import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferenceMutation,
} from '@/api/services/settings';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@/types';

const LABELS: Record<NotificationChannel, string> = {
  'in-app': 'System (in-app)',
  email: 'Email',
  sms: 'SMS',
};
const { data: preferences, isPending } = useNotificationPreferencesQuery();
const update = useUpdateNotificationPreferenceMutation();
const grid = { gridTemplateColumns: 'minmax(200px,1.6fr) repeat(3, minmax(0, 1fr))' };
</script>

<template>
  <InlineNotice
    tone="neutral"
    title="Security alerts always go to Platform Administrators by email"
    description="You can add SMS, but you can't turn email off for security alerts."
  />
  <Skeleton v-if="isPending" class="h-72 max-w-[820px]" />
  <div
    v-else
    role="table"
    aria-label="Notification channels"
    class="max-w-[820px] overflow-hidden rounded-lg border bg-card"
  >
    <div
      role="row"
      class="grid gap-2 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"
      :style="grid"
    >
      <span role="columnheader">Event</span>
      <span v-for="c in NOTIFICATION_CHANNELS" :key="c" role="columnheader" class="text-center">{{
        LABELS[c]
      }}</span>
    </div>
    <div
      v-for="p in preferences"
      :key="p.event"
      role="row"
      class="grid items-center gap-2 border-t border-divider px-4 py-2.5 text-[13px]"
      :style="grid"
    >
      <span role="rowheader" class="font-medium">{{ p.event }}</span>
      <span v-for="c in NOTIFICATION_CHANNELS" :key="c" role="cell" class="flex justify-center">
        <Checkbox
          :model-value="p.channels[c]"
          :disabled="p.locked.includes(c)"
          :aria-label="`${p.event} via ${LABELS[c]}`"
          @update:model-value="update.mutate({ event: p.event, channel: c, enabled: !!$event })"
        />
      </span>
    </div>
  </div>
</template>
