<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { cn } from '@edutrack/ui/lib/utils';
import { BellIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '@/api/services/notifications';
import { routesPath } from '@/router/routes-path';
import type { NotificationItem } from '@/types';

const open = ref(false);
const { data } = useNotificationsQuery({ filter: 'all', page: 1, pageSize: 8 });
const markAll = useMarkAllNotificationsReadMutation();
const markRead = useMarkNotificationReadMutation();
const unread = computed(() => data.value?.unread ?? 0);
const latest = computed(() => data.value?.rows ?? []);

function opened(n: NotificationItem) {
  open.value = false;
  if (!n.read) markRead.mutate(n.id);
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger
      :aria-label="unread ? `Notifications, ${unread} unread` : 'Notifications'"
      class="relative flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <BellIcon class="size-4.5" />
      <span
        v-if="unread"
        class="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
      >
        {{ unread }}
      </span>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      class="flex max-h-[460px] w-[380px] max-w-[calc(100vw-1.5rem)] flex-col p-0 shadow-popover"
    >
      <div class="flex items-center justify-between border-b px-3.5 py-3">
        <span class="font-semibold">Notifications</span>
        <button
          type="button"
          class="text-xs font-medium text-primary hover:underline disabled:opacity-45"
          :disabled="!unread"
          @click="markAll.mutate()"
        >
          Mark all as read
        </button>
      </div>
      <p v-if="!latest.length" class="px-3.5 py-6 text-center text-[13px] text-muted-foreground">
        No notifications yet.
      </p>
      <div class="overflow-y-auto">
        <RouterLink
          v-for="n in latest"
          :key="n.id"
          :to="n.to"
          class="grid grid-cols-[8px_1fr_auto] gap-2.5 border-b border-divider px-3.5 py-2.5 hover:bg-muted"
          @click="opened(n)"
        >
          <span
            :class="cn('mt-1.5 size-1.5 rounded-full', !n.read ? 'bg-primary' : 'bg-transparent')"
          />
          <span class="flex min-w-0 flex-col text-[13px]">
            <span :class="!n.read && 'font-medium'">{{ n.title }}</span>
            <span class="text-xs text-faint">{{ n.body }}</span>
          </span>
          <span class="text-[11px] whitespace-nowrap text-faint">{{ n.when }}</span>
        </RouterLink>
      </div>
      <div class="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
        <RouterLink
          :to="{ name: routesPath.notifications.list.name }"
          class="font-medium text-primary hover:underline"
          @click="open = false"
        >
          View all{{ data && data.total > latest.length ? ` (${data.total})` : '' }}
        </RouterLink>
        <RouterLink
          :to="{ name: routesPath.notifications.settings.name }"
          class="text-muted-foreground hover:text-foreground"
          @click="open = false"
          >Settings</RouterLink
        >
      </div>
    </PopoverContent>
  </Popover>
</template>
