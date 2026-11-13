<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { cn } from '@edutrack/ui/lib/utils';
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import TablePagination from '@edutrack/app-kit/components/common/TablePagination.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '@/api/services/notifications';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath } from '@/router/routes-path';
import type { NotificationCategory, NotificationItem } from '@/types';

const router = useRouter();
const filter = useRouteQuery<'all' | 'unread'>('filter', 'unread');
const page = useRouteQuery<string>('page', '1');
const pageSize = useRouteQuery<string>('pageSize', '20');
const { data, isPending, error } = useNotificationsQuery(() => ({
  filter: filter.value,
  page: Number(page.value),
  pageSize: Number(pageSize.value),
}));
const markRead = useMarkNotificationReadMutation();
const markAll = useMarkAllNotificationsReadMutation();

const tabs = computed(() => [
  {
    label: 'Unread',
    to: { query: {} },
    active: filter.value === 'unread',
    count: data.value?.unread,
  },
  {
    label: 'All',
    to: { query: { filter: 'all' } },
    active: filter.value === 'all',
    count: data.value?.total,
  },
]);

const CATEGORY: Record<NotificationCategory, string> = {
  results: 'Results',
  reviews: 'Reviews',
  assignments: 'Assignments',
  assessments: 'Assessments',
  'lesson-notes': 'Lesson notes',
  register: 'Register',
  materials: 'Materials',
  timetable: 'Timetable',
  announcements: 'Announcement',
  account: 'Account',
};

async function open(n: NotificationItem) {
  try {
    if (!n.read) await markRead.mutateAsync(n.id);
  } catch {
    // Opening the record matters more than the read marker.
  }
  void router.push(n.to);
}

async function readAll() {
  try {
    await markAll.mutateAsync();
    toast.success('All notifications marked as read.');
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.'));
  }
}
</script>

<template>
  <PageHeader
    title="Notifications"
    :description="
      data ? (data.unread ? `${data.unread} unread` : 'You’re all caught up') : undefined
    "
  >
    <template #actions>
      <Button as-child variant="ghost"
        ><RouterLink :to="{ name: routesPath.notifications.settings.name }"
          >Email settings</RouterLink
        ></Button
      >
      <Button
        variant="outline"
        :disabled="!data?.unread || markAll.isPending.value"
        @click="readAll"
        >Mark all as read</Button
      >
    </template>
  </PageHeader>
  <TabNav :tabs="tabs" label="Notification filter" />
  <p v-if="error" class="text-sm text-error-strong">
    {{ getApiErrorMessage(error, 'Notifications couldn’t load. Refresh to try again.') }}
  </p>
  <div v-else-if="isPending" class="flex flex-col gap-2">
    <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
  </div>
  <EmptyState
    v-else-if="!data?.rows.length"
    :title="filter === 'unread' ? 'No unread notifications' : 'No notifications yet'"
    description="Returned sheets, reviews, submissions and reminders appear here."
  />
  <section v-else class="overflow-hidden rounded-lg border bg-card">
    <ul class="divide-y divide-divider">
      <li v-for="n in data.rows" :key="n.id">
        <button
          type="button"
          class="grid w-full grid-cols-[8px_1fr_auto] gap-3 px-4 py-3 text-left hover:bg-muted max-sm:grid-cols-[8px_1fr]"
          @click="open(n)"
        >
          <span
            :class="cn('mt-1.5 size-2 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')"
            :aria-label="n.read ? undefined : 'Unread'"
          />
          <span class="flex min-w-0 flex-col gap-0.5">
            <span :class="cn('text-[13px]', n.read ? 'font-normal' : 'font-semibold')">{{
              n.title
            }}</span>
            <span class="text-xs text-pretty text-muted-foreground">{{ n.body }}</span>
            <span class="text-[11px] text-faint sm:hidden"
              >{{ CATEGORY[n.category] }} · {{ n.when }}</span
            >
          </span>
          <span
            class="flex flex-col items-end gap-0.5 text-[11px] whitespace-nowrap text-faint max-sm:hidden"
          >
            <span>{{ n.when }}</span>
            <span>{{ CATEGORY[n.category] }}</span>
          </span>
        </button>
      </li>
    </ul>
    <div v-if="data.meta.totalPages > 1" class="border-t px-4 py-2">
      <TablePagination
        :meta="data.meta"
        @update:page="page = String($event)"
        @update:page-size="pageSize = String($event)"
      />
    </div>
  </section>
</template>
