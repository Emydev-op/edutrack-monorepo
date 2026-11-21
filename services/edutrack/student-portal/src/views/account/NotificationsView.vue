<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  useNotificationsQuery,
  useReadAllNotificationsMutation,
  useReadNotificationMutation,
} from '@/api/services/student';
import ChipPicker from '@/components/common/ChipPicker.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { notificationTarget } from '@/lib/notifications';
import type { StudentNotification } from '@/types';

/** Notifications from the school: results, assignments, attendance and announcements. */
const router = useRouter();
const filter = ref<'all' | 'unread'>('all');
const q = useNotificationsQuery(filter);
const read = useReadNotificationMutation();
const readAll = useReadAllNotificationsMutation();
const page = computed(() => q.data.value);
const filterModel = computed({
  get: () => filter.value,
  set: (v: string | undefined) => (filter.value = v === 'unread' ? 'unread' : 'all'),
});

async function open(n: StudentNotification) {
  if (!n.read) read.mutate(n.id);
  await router.push(notificationTarget(n));
}
</script>

<template>
  <div class="flex items-end justify-between gap-3">
    <PageTitle title="Notifications" :sub="page ? `${page.unread} unread` : null" />
    <Button
      v-if="page?.unread"
      variant="outline"
      size="sm"
      :disabled="readAll.isPending.value"
      @click="readAll.mutate()"
      >Mark all read</Button
    >
  </div>
  <ChipPicker
    v-model="filterModel"
    :options="[
      { value: 'all', label: 'All' },
      { value: 'unread', label: 'Unread' },
    ]"
    label="Show"
  />
  <QueryState
    v-if="!page"
    :loading="q.isPending.value"
    :error="q.error.value"
    @retry="q.refetch()"
  />
  <p
    v-else-if="!page.rows.length"
    class="rounded-lg border bg-card px-3.5 py-4 text-muted-foreground"
  >
    {{ filter === 'unread' ? 'You’re all caught up.' : 'No notifications yet.' }}
  </p>
  <div v-else class="overflow-hidden rounded-lg border bg-card">
    <button
      v-for="n in page.rows"
      :key="n.id"
      type="button"
      class="flex w-full items-start gap-3 border-t border-divider px-3.5 py-3 text-left first:border-t-0 hover:bg-surface-warm"
      @click="open(n)"
    >
      <span
        class="mt-1.5 size-2 shrink-0 rounded-full"
        :class="n.read ? 'bg-transparent' : 'bg-primary'"
        :aria-label="n.read ? undefined : 'Unread'"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm" :class="!n.read && 'font-semibold'">{{ n.title }}</span>
        <span v-if="n.body" class="line-clamp-2 text-xs text-muted-foreground">{{ n.body }}</span>
      </span>
      <span class="text-xs whitespace-nowrap text-faint">{{ n.when }}</span>
    </button>
  </div>
</template>
