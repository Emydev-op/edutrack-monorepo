<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from '@edutrack/ui/components/popover';
import { cn } from '@edutrack/ui/lib/utils';
import { BellIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { useMarkNotificationsReadMutation, useNotificationsQuery } from '@/api/services/settings';
import { routesPath } from '@/router/routes-path';

const open = ref(false);
const { data: notifications } = useNotificationsQuery();
const markAll = useMarkNotificationsReadMutation();
const unread = computed(() => notifications.value?.filter((n) => n.unread).length ?? 0);
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger
      :aria-label="unread ? `Notifications, ${unread} unread` : 'Notifications'"
      class="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <BellIcon class="size-4.5" />
      <span
        v-if="unread"
        class="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
      >
        {{ unread }}
      </span>
    </PopoverTrigger>
    <PopoverContent align="end" class="flex max-h-[460px] w-[380px] flex-col p-0 shadow-popover">
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
      <div class="overflow-y-auto">
        <RouterLink
          v-for="n in notifications"
          :key="n.id"
          :to="n.to"
          class="grid grid-cols-[8px_1fr_auto] gap-2.5 border-b border-divider px-3.5 py-2.5 hover:bg-muted"
          @click="open = false"
        >
          <span
            :class="cn('mt-1.5 size-1.5 rounded-full', n.unread ? 'bg-primary' : 'bg-transparent')"
          />
          <span class="flex flex-col text-[13px]">
            <span :class="n.unread && 'font-medium'">{{ n.title }}</span>
            <span class="text-xs text-faint">{{ n.detail }}</span>
          </span>
          <span class="text-[11px] whitespace-nowrap text-faint">{{ n.when }}</span>
        </RouterLink>
      </div>
      <RouterLink
        :to="{ name: routesPath.activity.name }"
        class="px-3.5 py-2.5 text-[13px] font-medium text-primary hover:underline"
        @click="open = false"
      >
        View all
      </RouterLink>
    </PopoverContent>
  </Popover>
</template>
