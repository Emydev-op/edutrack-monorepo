<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CopyIcon, FileSpreadsheetIcon, PencilIcon, PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import RowActions, { type RowAction } from '@edutrack/app-kit/components/common/RowActions.vue';
import { formatCount, pluralize } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery, useHostelsQuery } from '@/api/services/boarding';
import { useCan } from '@/composables/useCan';
import { routesPath } from '@/router/routes-path';
import type { Hostel } from '@/types';

import { GENDER_TONE, HOUSE_MASTER } from './boarding-format';
import CopyHostelDialog from './CopyHostelDialog.vue';
import HostelFormDialog from './HostelFormDialog.vue';
import ImportRoomsPanel from './ImportRoomsPanel.vue';

/** Hostels by campus, with the totals, adding a hostel, copying a layout and bulk upload. */
const b = routesPath.boarding;
const router = useRouter();
const can = useCan();
const { data, isPending, isError, refetch } = useHostelsQuery();
const { data: settings } = useBoardingSettingsQuery();

const enabled = computed(() => !!settings.value?.enabled);
const boardingCampuses = computed(() =>
  (settings.value?.campuses ?? []).filter((c) => c.sections.some((s) => s.boarding)),
);

/** Hostels grouped by campus, boarding campuses first in the settings' order. */
const groups = computed(() => {
  const hostels = data.value?.hostels ?? [];
  const order = (settings.value?.campuses ?? []).map((c) => c.branchId);
  const ids = [...new Set(hostels.map((h) => h.branchId))].sort(
    (x, y) => (order.indexOf(x) + 1 || 999) - (order.indexOf(y) + 1 || 999),
  );
  return ids.map((id) => {
    const list = hostels.filter((h) => h.branchId === id);
    return {
      id,
      name: list[0]!.campus,
      hostels: list,
      places: list.reduce((n, h) => n + h.totals.places, 0),
    };
  });
});

const houseMaster = (h: Hostel) =>
  h.staff
    .filter((s) => s.role === HOUSE_MASTER)
    .map((s) => s.name)
    .join(', ');
const layout = (h: Hostel) =>
  [
    h.totals.floors ? pluralize(h.totals.floors, 'floor') : '',
    pluralize(h.totals.rooms, 'room'),
    pluralize(h.totals.places, 'place'),
  ]
    .filter(Boolean)
    .join(' · ');
const hostelLink = (h: Hostel) => ({ name: b.hostel.name, params: { id: h.id } });

const formOpen = ref(false);
const editing = ref<Hostel | null>(null);
const formBranch = ref<string | undefined>();
function addHostel(branchId?: string) {
  editing.value = null;
  formBranch.value = branchId;
  formOpen.value = true;
}
function editHostel(h: Hostel) {
  editing.value = h;
  formOpen.value = true;
}
const onSaved = (h: Hostel) => !editing.value && router.push(hostelLink(h));

const copyOpen = ref(false);
const copying = ref<Hostel | null>(null);
function copyHostel(h: Hostel) {
  copying.value = h;
  copyOpen.value = true;
}
const onCopied = (h: Hostel) => router.push(hostelLink(h));

const importOpen = ref(false);

const actions = (h: Hostel): RowAction[] => [
  { label: 'Edit hostel', icon: PencilIcon, onSelect: () => editHostel(h) },
  { label: 'Copy layout', icon: CopyIcon, onSelect: () => copyHostel(h) },
];
</script>

<template>
  <PageHeader
    title="Hostels"
    description="Boarding houses at each campus, with their floors or wings, rooms and house staff."
  >
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink :to="{ name: b.setup.name }">Boarding set-up</RouterLink></Button
      >
      <template v-if="can('boarding.manage')">
        <Button variant="outline" :disabled="!enabled" @click="importOpen = true"
          ><FileSpreadsheetIcon />Bulk upload rooms</Button
        >
        <Button :disabled="!enabled" @click="addHostel()"><PlusIcon />Add hostel</Button>
      </template>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="settings && !enabled"
    tone="warning"
    title="Boarding isn’t switched on"
    description="Choose which sections take boarders at each campus first. Hostels are set up for those classes."
  >
    <template v-if="can('boarding.manage')" #action>
      <Button as-child variant="outline" size="sm"
        ><RouterLink :to="{ name: b.setup.name }">Go to Boarding set-up</RouterLink></Button
      >
    </template>
  </InlineNotice>

  <Skeleton v-if="isPending" class="h-80" />
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Hostels couldn’t load"
    description="Check your connection and try again."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <template v-else>
    <MetricGrid>
      <MetricCard label="Hostels" :value="formatCount(data.totals.hostels)" />
      <MetricCard label="Rooms" :value="formatCount(data.totals.rooms)" />
      <MetricCard
        label="Places"
        :value="formatCount(data.totals.places)"
        hint="Beds for boarders"
      />
    </MetricGrid>

    <EmptyState
      v-if="!data.hostels.length"
      illustrated
      title="No hostels yet"
      :description="
        enabled
          ? 'Add a hostel for each boarding house, then its floors or wings and rooms. Or upload all your rooms at once from the Excel template.'
          : 'Switch boarding on in Boarding set-up, then add your hostels here.'
      "
    >
      <div v-if="enabled && can('boarding.manage')" class="flex flex-wrap justify-center gap-2">
        <Button @click="addHostel()"><PlusIcon />Add hostel</Button>
        <Button variant="outline" @click="importOpen = true">Bulk upload rooms</Button>
      </div>
    </EmptyState>

    <section v-for="g in groups" :key="g.id" class="flex flex-col gap-2">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-[15px] font-semibold">
          {{ g.name }}
          <span class="text-xs font-normal text-muted-foreground"
            >· {{ pluralize(g.hostels.length, 'hostel') }} ·
            {{ pluralize(g.places, 'place') }}</span
          >
        </h2>
        <Button
          v-if="can('boarding.manage') && boardingCampuses.some((c) => c.branchId === g.id)"
          variant="ghost"
          size="sm"
          @click="addHostel(g.id)"
          ><PlusIcon />Add hostel here</Button
        >
      </header>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="h in g.hostels"
          :key="h.id"
          class="relative flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 flex-col gap-1">
              <RouterLink
                :to="hostelLink(h)"
                class="truncate text-[15px] font-semibold after:absolute after:inset-0 hover:underline"
                >{{ h.name }}</RouterLink
              >
              <span class="flex flex-wrap items-center gap-1.5">
                <StatusBadge :label="h.gender" :tone="GENDER_TONE[h.gender]" />
                <span class="text-xs text-muted-foreground">{{ h.levels.join(', ') }}</span>
              </span>
            </div>
            <span v-if="can('boarding.manage')" class="relative z-10"
              ><RowActions :actions="actions(h)" :label="`${h.name} actions`"
            /></span>
          </div>
          <span class="text-[13px] tabular-nums text-body">{{ layout(h) }}</span>
          <span class="text-xs" :class="houseMaster(h) ? 'text-muted-foreground' : 'text-faint'">
            House master / mistress: {{ houseMaster(h) || 'Not assigned' }}
          </span>
        </article>
      </div>
    </section>
  </template>

  <HostelFormDialog
    v-model:open="formOpen"
    :settings="settings"
    :hostel="editing"
    :branch-id="formBranch"
    @saved="onSaved"
  />
  <CopyHostelDialog v-model:open="copyOpen" :hostel="copying" @copied="onCopied" />

  <Sheet v-model:open="importOpen">
    <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(64rem,calc(100vw-2rem))]">
      <SheetHeader class="gap-0.5 border-b px-5 py-4.5 pr-12">
        <SheetTitle class="text-[17px] font-semibold">Bulk upload rooms</SheetTitle>
        <SheetDescription class="text-xs text-muted-foreground">
          One row per room. Hostels and floors that don’t exist yet are added.
        </SheetDescription>
      </SheetHeader>
      <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4.5">
        <ImportRoomsPanel v-if="importOpen" @done="importOpen = false" />
      </div>
    </SheetContent>
  </Sheet>
</template>
