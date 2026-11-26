<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { ClockIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useRollCallsQuery } from '@/api/services/boarding-house';
import { routesPath } from '@/router/routes-path';
import type { RollCallHostel } from '@/types';

import { dayLabel, lagosToday, timeLabel } from './house-format';
import RollCallTimesDialog from './RollCallTimesDialog.vue';

/**
 * Each hostel’s roll calls for a day: which are taken, with present and absent counts. Opening
 * one shows the sheet to mark or correct.
 */
const today = lagosToday();
const date = useRouteQuery<string>('date', today);
const { data, isPending, isError, refetch } = useRollCallsQuery(date);
const hostels = computed(() => data.value?.hostels ?? []);
const multiCampus = computed(() => new Set(hostels.value.map((h) => h.campus)).size > 1);

const timesOpen = ref(false);
const timesHostel = ref<RollCallHostel | null>(null);
function editTimes(h: RollCallHostel) {
  timesHostel.value = h;
  timesOpen.value = true;
}

const sheetLink = (h: RollCallHostel, slot: string) => ({
  name: routesPath.boarding.rollCall.name,
  params: { hostelId: h.id },
  query: { date: date.value, slot },
});
</script>

<template>
  <PageHeader title="Roll calls" :description="`Hostel roll calls for ${dayLabel(date)}.`">
    <template #actions>
      <Input v-model="date" type="date" :max="today" aria-label="Day" class="w-auto bg-card" />
      <Button v-if="date !== today" variant="outline" @click="date = today">Today</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="Roll calls couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <div v-if="isPending" class="grid gap-4 lg:grid-cols-2">
    <Skeleton v-for="i in 2" :key="i" class="h-40" />
  </div>
  <EmptyState
    v-else-if="!hostels.length && !isError"
    title="No hostels to call"
    description="Add hostels and place boarders first. Each hostel’s roll calls show here."
  >
    <Button as-child variant="outline" size="sm"
      ><RouterLink :to="{ name: routesPath.boarding.hostels.name }"
        >Go to Hostels</RouterLink
      ></Button
    >
  </EmptyState>

  <div v-else class="grid items-start gap-4 lg:grid-cols-2">
    <SectionCard
      v-for="h in hostels"
      :key="h.id"
      :title="h.name"
      :description="multiCampus ? h.campus : undefined"
    >
      <template #actions>
        <Button variant="ghost" size="sm" @click="editTimes(h)"
          ><ClockIcon />Roll call times</Button
        >
      </template>
      <p v-if="!h.slots.length" class="text-[13px] text-muted-foreground">
        No roll call times set. Add them with Roll call times.
      </p>
      <ul v-else class="grid gap-2 sm:grid-cols-3">
        <li v-for="s in h.slots" :key="s.slot">
          <RouterLink
            :to="sheetLink(h, s.slot)"
            class="flex h-full flex-col gap-1 rounded-md border px-3 py-2.5 text-[13px] transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
            :class="s.absent ? 'border-error/40 bg-error-subtle' : ''"
          >
            <span class="font-medium">{{ s.slot }}</span>
            <template v-if="s.taken">
              <span class="text-xs text-success-strong"
                >Taken{{ s.takenAt ? ` at ${timeLabel(s.takenAt)}` : '' }}</span
              >
              <span class="text-xs tabular-nums text-muted-foreground"
                >{{ s.present }} of {{ s.total }} present</span
              >
              <span v-if="s.absent" class="text-xs font-medium tabular-nums text-error-strong"
                >{{ s.absent }} absent</span
              >
              <span
                v-if="s.exeat || s.sickBay || s.excused"
                class="text-[11px] tabular-nums text-faint"
                >{{
                  [
                    s.exeat ? `${s.exeat} on exeat` : '',
                    s.sickBay ? `${s.sickBay} sick bay` : '',
                    s.excused ? `${s.excused} excused` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}</span
              >
            </template>
            <template v-else>
              <span class="text-xs text-warning-strong">Not taken</span>
              <span class="text-xs tabular-nums text-muted-foreground">{{ s.total }} boarders</span>
            </template>
          </RouterLink>
        </li>
      </ul>
    </SectionCard>
  </div>

  <RollCallTimesDialog
    v-model:open="timesOpen"
    :hostel="timesHostel"
    :slots="timesHostel?.slots.map((s) => s.slot) ?? []"
  />
</template>
