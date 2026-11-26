<script setup lang="ts">
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { ChevronRightIcon } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useRollCallsQuery } from '@/api/services/boarding';
import { timeOf } from '@/components/boarding/boarding-format';
import { useTermContext } from '@/composables/useTermContext';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatWeekday } from '@/lib/dates';
import { routesPath as r } from '@/router/routes-path';
import type { RollCallSlotSummary } from '@/types';

const { today } = useTermContext();
const dateQuery = useRouteQuery<string>('date', '');
const date = computed({
  get: () => dateQuery.value || today.value,
  set: (v) => (dateQuery.value = v === today.value ? '' : v),
});

const { data, isPending, error } = useRollCallsQuery(date);
const hostels = computed(() => data.value?.hostels ?? []);

const summary = (s: RollCallSlotSummary) =>
  [
    `${s.present} present`,
    s.absent && `${s.absent} absent`,
    s.exeat && `${s.exeat} on exeat`,
    s.sickBay && `${s.sickBay} in sick bay`,
    s.excused && `${s.excused} excused`,
  ]
    .filter(Boolean)
    .join(' · ');

const sheetLink = (hostelId: string, slot: string) => ({
  name: r.boarding.rollCall.name,
  params: { hostelId },
  query: { slot, ...(date.value !== today.value ? { date: date.value } : {}) },
});
</script>

<template>
  <PageHeader
    title="Roll call"
    :description="`${formatWeekday(date)}. Absent boarders’ parents and house staff are alerted.`"
  >
    <template #actions>
      <Input
        v-model="date"
        type="date"
        :max="today"
        aria-label="Roll call date"
        class="h-10 w-44"
      />
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Roll calls couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 2" :key="i" class="h-40 w-full" />
  </div>
  <EmptyState
    v-else-if="!hostels.length"
    illustrated
    title="No roll calls for you"
    description="House staff take roll call for the hostels (or floors) they look after."
  />
  <template v-else>
    <SectionCard v-for="h in hostels" :key="h.id" :title="h.name" :description="h.campus" flush>
      <p v-if="!h.slots.length" class="px-4 py-3.5 text-[13px] text-faint">
        No roll call times are set for this hostel.
      </p>
      <ul v-else class="flex flex-col divide-y divide-divider">
        <li v-for="s in h.slots" :key="s.slot">
          <RouterLink
            :to="sheetLink(h.id, s.slot)"
            class="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
          >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-[15px] font-medium">{{ s.slot }}</span>
                <StatusBadge
                  :label="s.taken ? `Taken ${timeOf(s.takenAt)}`.trim() : 'Not taken'"
                  :tone="s.taken ? 'success' : 'warning'"
                />
              </span>
              <span class="text-xs text-muted-foreground">
                {{ s.total }} boarders<template v-if="s.taken"> · {{ summary(s) }}</template
                ><template v-else-if="s.exeat || s.sickBay">
                  · {{ s.exeat }} on exeat, {{ s.sickBay }} in sick bay</template
                >
              </span>
            </span>
            <ChevronRightIcon class="size-4 shrink-0 text-faint" />
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </template>
</template>
