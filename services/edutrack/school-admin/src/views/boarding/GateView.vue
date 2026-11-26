<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { LogInIcon, LogOutIcon, RefreshCwIcon, UserPlusIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';
import { pluralize } from '@edutrack/app-kit/lib/format';

import { useBoardingSettingsQuery } from '@/api/services/boarding';
import { useGateQuery, useVisitorOutMutation } from '@/api/services/boarding-house';
import type { Exeat, GateVisitor } from '@/types';

import {
  boardingCampuses,
  pickupLabel,
  SELECT_CLASS,
  studentPlace,
  timeLabel,
} from './house-format';
import SignOutDialog from './SignOutDialog.vue';
import { useExeatActions } from './use-exeat-actions';
import VisitorDialog from './VisitorDialog.vue';

/**
 * The gate desk: boarders leaving today (sign them out to whoever collects), boarders out now
 * (overdue first; sign them back in) and visitors on site. Refreshes every 30 seconds.
 */
const { data: settings } = useBoardingSettingsQuery();
const campuses = computed(() => boardingCampuses(settings.value));
const campusId = useRouteQuery<string>('campus', '');
// Start on the first boarding campus.
watch(
  campuses,
  (list) => {
    if (!campusId.value && list.length) campusId.value = list[0]!.branchId;
  },
  { immediate: true },
);
const campusName = computed(
  () => campuses.value.find((c) => c.branchId === campusId.value)?.name ?? 'Campus',
);

const { data, isPending, isError, isFetching, refetch, dataUpdatedAt } = useGateQuery(campusId);
const actions = useExeatActions();
const visitorOut = useVisitorOutMutation();

const out = computed(() =>
  [...(data.value?.out ?? [])].sort((a, b) => Number(b.overdue) - Number(a.overdue)),
);
const updated = computed(() =>
  dataUpdatedAt.value ? timeLabel(new Date(dataUpdatedAt.value).toISOString()) : '',
);

const signOutOpen = ref(false);
const leaving = ref<Exeat | null>(null);
function openSignOut(e: Exeat) {
  leaving.value = e;
  signOutOpen.value = true;
}
const visitorOpen = ref(false);

async function logOut(v: GateVisitor) {
  try {
    const r = await visitorOut.mutateAsync({ id: v.id, branchId: campusId.value });
    toast.success(messageOf(r, `${v.name} logged out.`));
  } catch (e) {
    toast.error(getApiErrorMessage(e, `${v.name} wasn’t logged out. Try again.`));
  }
}
</script>

<template>
  <PageHeader title="Gate" description="Sign boarders out and in, and log visitors.">
    <template #actions>
      <select
        v-if="campuses.length > 1"
        v-model="campusId"
        :class="[SELECT_CLASS, 'w-auto']"
        aria-label="Campus"
      >
        <option v-for="c in campuses" :key="c.branchId" :value="c.branchId">{{ c.name }}</option>
      </select>
      <Button variant="outline" :disabled="isFetching" @click="refetch()"
        ><RefreshCwIcon :class="isFetching && 'animate-spin'" />Refresh</Button
      >
      <Button @click="visitorOpen = true"><UserPlusIcon />Log visitor</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="isError"
    tone="error"
    title="The gate list couldn’t load"
    description="Check your connection. It tries again every 30 seconds."
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>
  <InlineNotice
    v-if="data?.overdue"
    tone="error"
    :title="`${pluralize(data.overdue, 'boarder')} overdue`"
    description="Past their return time and not signed back in. Tell the house master / mistress."
  />

  <p v-if="updated" class="text-xs text-faint">{{ campusName }} · updated {{ updated }}</p>

  <div class="grid items-start gap-4 lg:grid-cols-2">
    <SectionCard
      title="Leaving"
      :description="`Approved exeats leaving within a day · ${data?.leaving.length ?? 0}`"
      flush
    >
      <Skeleton v-if="isPending" class="m-4 h-24" />
      <p v-else-if="!data?.leaving.length" class="px-4 py-6 text-[13px] text-muted-foreground">
        Nobody is due to leave.
      </p>
      <ul v-else class="flex flex-col">
        <li
          v-for="e in data.leaving"
          :key="e.id"
          class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 last:border-b-0"
        >
          <span class="flex min-w-0 flex-col text-[13px]">
            <span class="font-medium">{{ e.student.name }}</span>
            <span class="text-xs text-muted-foreground">{{ studentPlace(e.student) }}</span>
            <span class="text-xs text-faint"
              >{{ e.kind }} · leaves {{ e.leaves }} · {{ pickupLabel(e) }}</span
            >
          </span>
          <Button size="sm" @click="openSignOut(e)"><LogOutIcon />Sign out</Button>
        </li>
      </ul>
    </SectionCard>

    <SectionCard title="Out now" :description="`Boarders away on exeat · ${out.length}`" flush>
      <Skeleton v-if="isPending" class="m-4 h-24" />
      <p v-else-if="!out.length" class="px-4 py-6 text-[13px] text-muted-foreground">
        Every boarder is in school.
      </p>
      <ul v-else class="flex flex-col">
        <li
          v-for="e in out"
          :key="e.id"
          class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 last:border-b-0"
          :class="e.overdue && 'bg-error-subtle'"
        >
          <span class="flex min-w-0 flex-col text-[13px]">
            <span class="flex items-center gap-2 font-medium"
              >{{ e.student.name }}
              <StatusBadge v-if="e.overdue" label="Overdue" tone="error" />
            </span>
            <span class="text-xs text-muted-foreground">{{ studentPlace(e.student) }}</span>
            <span class="text-xs" :class="e.overdue ? 'text-error-strong' : 'text-faint'"
              >Back by {{ e.returns
              }}{{ e.collectedBy ? ` · collected by ${e.collectedBy}` : '' }}</span
            >
          </span>
          <Button size="sm" variant="outline" @click="actions.signIn(e)"
            ><LogInIcon />Sign in</Button
          >
        </li>
      </ul>
    </SectionCard>

    <SectionCard
      title="Visitors on site"
      :description="`Logged in at the gate · ${data?.visitors.length ?? 0}`"
      flush
      class="lg:col-span-2"
    >
      <Skeleton v-if="isPending" class="m-4 h-16" />
      <p v-else-if="!data?.visitors.length" class="px-4 py-6 text-[13px] text-muted-foreground">
        No visitors on site.
      </p>
      <ul v-else class="flex flex-col">
        <li
          v-for="v in data.visitors"
          :key="v.id"
          class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 last:border-b-0"
        >
          <span class="flex min-w-0 flex-col text-[13px]">
            <span class="font-medium"
              >{{ v.name
              }}<span v-if="v.phone" class="font-normal text-muted-foreground">
                · {{ v.phone }}</span
              ></span
            >
            <span class="text-xs text-muted-foreground"
              >{{ v.purpose }}{{ v.visiting ? ` · visiting ${v.visiting}` : '' }}</span
            >
            <span class="text-xs text-faint">In at {{ timeLabel(v.inAt) }}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            :disabled="visitorOut.isPending.value"
            @click="logOut(v)"
            >Logged out</Button
          >
        </li>
      </ul>
    </SectionCard>
  </div>

  <SignOutDialog v-model:open="signOutOpen" :exeat="leaving" />
  <VisitorDialog v-model:open="visitorOpen" :branch-id="campusId" :campus="campusName" />
</template>
