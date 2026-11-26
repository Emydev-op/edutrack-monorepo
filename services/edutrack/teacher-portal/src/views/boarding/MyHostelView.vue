<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { HeartPulseIcon, MessageSquareIcon, PhoneIcon, PrinterIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';

import { useMyHostelQuery } from '@/api/services/boarding';
import { getApiErrorMessage } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import type { HostelBoarder, HostelRoom, MyHostelEntry } from '@/types';

const { data, isPending, error } = useMyHostelQuery();
const search = ref('');

const hostels = computed(() => data.value?.hostels ?? []);
const query = computed(() => search.value.trim().toLowerCase());

const matches = (b: HostelBoarder) =>
  !query.value ||
  b.name.toLowerCase().includes(query.value) ||
  b.className.toLowerCase().includes(query.value) ||
  b.admissionNo.toLowerCase().includes(query.value);

interface FloorGroup {
  floor: string | null;
  rooms: HostelRoom[];
}

/** A hostel's rooms with only the matching boarders, grouped by floor (in API order). */
function floorsOf(h: MyHostelEntry): FloorGroup[] {
  const groups: FloorGroup[] = [];
  for (const room of h.rooms) {
    const boarders = room.boarders.filter(matches);
    // While searching, hide rooms with no matching boarder.
    if (query.value && !boarders.length) continue;
    let group = groups.find((g) => g.floor === room.floor);
    if (!group) groups.push((group = { floor: room.floor, rooms: [] }));
    group.rooms.push({ ...room, boarders });
  }
  return groups;
}

const shown = computed(() => hostels.value.map((h) => ({ hostel: h, floors: floorsOf(h) })));
const anyMatch = computed(() => shown.value.some((s) => s.floors.length));

const metaOf = (h: MyHostelEntry) => [
  { label: 'Campus', value: h.campus },
  { label: 'Hostel', value: h.gender },
  ...(h.floor ? [{ label: 'Your floor', value: h.floor }] : []),
  { label: 'Rooms', value: String(h.totals.rooms) },
  { label: 'Boarders', value: `${h.totals.boarders} of ${h.totals.places} places` },
];

const messageLink = (b: HostelBoarder) => ({
  name: r.messages.new.name,
  query: { student: b.studentId, ...(b.parent ? { guardian: b.parent.guardianId } : {}) },
});

const print = () => window.print();
</script>

<template>
  <PageHeader
    title="My hostel"
    :description="
      data?.session
        ? `${data.session}. The rooms and boarders you look after as house staff.`
        : 'The rooms and boarders you look after as house staff.'
    "
  >
    <template v-if="hostels.length" #actions>
      <Button variant="outline" class="print:hidden" @click="print"
        ><PrinterIcon class="size-4" /> Print room list</Button
      >
    </template>
  </PageHeader>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Your hostel couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-20 w-full" />
    <Skeleton v-for="i in 3" :key="i" class="h-40 w-full" />
  </div>
  <EmptyState
    v-else-if="data && !hostels.length"
    illustrated
    title="You don’t look after a hostel"
    description="House masters, floor masters and their assistants see their rooms and boarders here. The school office assigns house staff to hostels."
  />
  <template v-else-if="data">
    <div class="print:hidden">
      <SearchInput v-model="search" placeholder="Search boarders by name, class or admission no." />
    </div>

    <p v-if="query && !anyMatch" class="text-[13px] text-faint">
      No boarders match “{{ search }}”.
    </p>

    <section
      v-for="{ hostel: h, floors } in shown"
      :key="h.id"
      class="flex flex-col gap-4 print:break-before-page print:first:break-before-auto"
      :aria-labelledby="`hostel-${h.id}`"
    >
      <div class="flex flex-col gap-1.5 rounded-lg border bg-card px-5 py-4">
        <div class="flex flex-wrap items-center gap-2.5">
          <h2 :id="`hostel-${h.id}`" class="text-lg font-semibold">{{ h.name }}</h2>
          <StatusBadge :label="h.role" tone="brand" :dot="false" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="m in metaOf(h)"
            :key="m.label"
            class="rounded-sm border bg-muted px-2 py-0.5 text-xs"
          >
            <span class="text-faint">{{ m.label }}</span> {{ m.value }}
          </span>
        </div>
      </div>

      <p v-if="!h.rooms.length" class="text-[13px] text-muted-foreground">
        This hostel has no rooms yet.
      </p>

      <div v-for="group in floors" :key="group.floor ?? '—'" class="flex flex-col gap-3">
        <h3
          v-if="group.floor"
          class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {{ group.floor }}
        </h3>
        <SectionCard
          v-for="room in group.rooms"
          :key="room.id"
          :title="`${room.name} · ${room.boarders.length} of ${room.capacity}`"
          class="break-inside-avoid"
        >
          <p v-if="!room.boarders.length" class="text-[13px] text-faint">No boarders.</p>
          <ul v-else class="flex flex-col divide-y divide-divider">
            <li
              v-for="b in room.boarders"
              :key="b.studentId"
              class="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
            >
              <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                <div class="flex min-w-0 items-start gap-3">
                  <span
                    class="mt-0.5 w-14 shrink-0 text-xs text-faint"
                    :title="b.bed ? `Bed ${b.bed}` : 'No bed assigned'"
                    >{{ b.bed ? `Bed ${b.bed}` : '—' }}</span
                  >
                  <div class="flex min-w-0 flex-col">
                    <span class="text-[13px]"
                      ><span class="font-medium">{{ b.name }}</span>
                      <span class="text-muted-foreground"> · {{ b.admissionNo }}</span></span
                    >
                    <span class="text-xs text-muted-foreground">{{ b.className }}</span>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                  <span v-if="b.parent" class="flex flex-col">
                    <span
                      >{{ b.parent.name }}
                      <span class="text-xs text-muted-foreground"
                        >({{ b.parent.relationship }})</span
                      ></span
                    >
                    <a
                      v-if="b.parent.phone"
                      :href="`tel:${b.parent.phone}`"
                      class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      ><PhoneIcon class="size-3 print:hidden" />{{ b.parent.phone }}</a
                    >
                  </span>
                  <span v-else class="text-xs text-faint">No parent on record</span>
                  <Button v-if="b.parent" as-child variant="outline" size="sm" class="print:hidden"
                    ><RouterLink :to="messageLink(b)"
                      ><MessageSquareIcon class="size-3.5" /> Message</RouterLink
                    ></Button
                  >
                </div>
              </div>
              <p
                v-if="b.medicalNotes.trim()"
                class="flex items-start gap-1.5 rounded-md bg-error-subtle px-2.5 py-1.5 text-xs text-error-strong"
              >
                <HeartPulseIcon class="mt-px size-3.5 shrink-0" />
                <span><span class="font-medium">Medical:</span> {{ b.medicalNotes }}</span>
              </p>
            </li>
          </ul>
        </SectionCard>
      </div>
    </section>
  </template>
</template>
