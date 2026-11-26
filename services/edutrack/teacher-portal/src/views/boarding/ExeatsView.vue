<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { PlusIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref } from 'vue';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import { useExeatsQuery } from '@/api/services/boarding';
import { EXEAT_STATUSES } from '@/components/boarding/boarding-format';
import ExeatRow from '@/components/boarding/ExeatRow.vue';
import GiveExeatDrawer from '@/components/boarding/GiveExeatDrawer.vue';
import { useExeatActions } from '@/components/boarding/useExeatActions';
import { getApiErrorMessage } from '@/lib/api-errors';
import type { Exeat, ExeatStatus } from '@/types';

const status = useRouteQuery<ExeatStatus | ''>('status', '');
const search = ref('');
const q = refDebounced(search, 300);

const { data, isPending, error } = useExeatsQuery(() => ({
  status: status.value,
  q: q.value.trim(),
}));
const actions = useExeatActions();
const giving = ref(false);

const ORDER: Record<ExeatStatus, number> = {
  Requested: 0,
  Out: 1,
  Approved: 2,
  Returned: 3,
  Declined: 4,
  Cancelled: 5,
};
/** Requests first, then overdue and out, then the rest by leaving time. */
const sorted = computed(() =>
  [...(data.value?.exeats ?? [])].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      Number(b.overdue) - Number(a.overdue) ||
      a.leaveAt.localeCompare(b.leaveAt),
  ),
);
const requested = computed(() => sorted.value.filter((e) => e.status === 'Requested'));
const others = computed(() => sorted.value.filter((e) => e.status !== 'Requested'));
const totals = computed(() => data.value?.totals);

const canCancel = (e: Exeat) => e.status === 'Requested' || e.status === 'Approved';
</script>

<template>
  <PageHeader
    title="Exeats"
    description="Leave out of school for boarders in the hostels you look after. Parents are told about every decision."
  >
    <template #actions>
      <Button class="h-10" @click="giving = true"><PlusIcon class="size-4" /> Give exeat</Button>
    </template>
  </PageHeader>

  <div v-if="totals" class="flex flex-wrap gap-1.5 text-xs">
    <span class="rounded-sm border bg-card px-2 py-0.5"
      ><span class="text-faint">Requested</span> {{ totals.requested }}</span
    >
    <span class="rounded-sm border bg-card px-2 py-0.5"
      ><span class="text-faint">Out</span> {{ totals.out }}</span
    >
    <span
      class="rounded-sm border px-2 py-0.5"
      :class="totals.overdue ? 'border-error bg-error-subtle text-error-strong' : 'bg-card'"
      ><span :class="!totals.overdue && 'text-faint'">Overdue</span> {{ totals.overdue }}</span
    >
  </div>

  <div class="flex flex-col gap-2 sm:flex-row">
    <div class="flex-1">
      <SearchInput v-model="search" placeholder="Search boarders" />
    </div>
    <NativeSelect v-model="status" aria-label="Status" class="h-10 sm:w-48">
      <NativeSelectOption value="">All statuses</NativeSelectOption>
      <NativeSelectOption v-for="s in EXEAT_STATUSES" :key="s" :value="s">{{
        s
      }}</NativeSelectOption>
    </NativeSelect>
  </div>

  <InlineNotice
    v-if="error"
    tone="error"
    title="Exeats couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
  </div>
  <EmptyState
    v-else-if="!sorted.length"
    illustrated
    :title="status || q ? 'No exeats match' : 'No exeats yet'"
    description="Parents request exeats in the Parent Portal; you can also give one here."
  />
  <template v-else>
    <SectionCard
      v-if="requested.length"
      title="Waiting for a decision"
      :description="`${requested.length} request${requested.length === 1 ? '' : 's'} from parents`"
      flush
    >
      <ul class="flex flex-col divide-y divide-divider">
        <ExeatRow v-for="e in requested" :key="e.id" :exeat="e">
          <Button class="h-10" @click="actions.approve(e)">Approve</Button>
          <Button variant="outline" class="h-10" @click="actions.decline(e)">Decline</Button>
        </ExeatRow>
      </ul>
    </SectionCard>
    <SectionCard v-if="others.length" :title="requested.length ? 'Other exeats' : 'Exeats'" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <ExeatRow v-for="e in others" :key="e.id" :exeat="e">
          <Button v-if="canCancel(e)" variant="outline" class="h-10" @click="actions.cancel(e)"
            >Cancel</Button
          >
        </ExeatRow>
      </ul>
    </SectionCard>
  </template>

  <GiveExeatDrawer v-model:open="giving" />
</template>
