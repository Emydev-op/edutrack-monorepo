<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { PhoneIcon, PlusIcon, RefreshCwIcon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import TabNav from '@edutrack/app-kit/components/common/TabNav.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useRouteQuery } from '@edutrack/app-kit/composables/useRouteQuery';

import {
  useGateQuery,
  useLogVisitorMutation,
  useMyHostelQuery,
  useVisitorOutMutation,
} from '@/api/services/boarding';
import { useMeQuery } from '@/api/services/shell';
import BoarderPicker from '@/components/boarding/BoarderPicker.vue';
import { boardersOf, timeOf } from '@/components/boarding/boarding-format';
import ExeatRow from '@/components/boarding/ExeatRow.vue';
import { useExeatActions } from '@/components/boarding/useExeatActions';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import type { GateVisitor } from '@/types';

type Tab = 'leaving' | 'out' | 'visitors';
const tab = useRouteQuery<Tab>('tab', 'leaving');

const { data: me } = useMeQuery();
const branches = computed(() => me.value?.branches ?? []);
const branchId = useRouteQuery<string>('branch', '');

const { data, isPending, error, refetch, isFetching } = useGateQuery(
  () => branchId.value || undefined,
);
const actions = useExeatActions();
const visitorOut = useVisitorOutMutation();

/** Overdue first, then by return time. */
const out = computed(() =>
  [...(data.value?.out ?? [])].sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || a.returnBy.localeCompare(b.returnBy),
  ),
);
const leaving = computed(() => data.value?.leaving ?? []);
const visitors = computed(() => data.value?.visitors ?? []);

const queryBase = () => (branchId.value ? { branch: branchId.value } : {});
const tabs = computed(() => [
  {
    label: 'Leaving',
    to: { query: { ...queryBase(), tab: undefined } },
    active: tab.value === 'leaving',
    count: leaving.value.length,
  },
  {
    label: 'Out now',
    to: { query: { ...queryBase(), tab: 'out' } },
    active: tab.value === 'out',
    count: data.value?.overdue || out.value.length,
  },
  {
    label: 'Visitors',
    to: { query: { ...queryBase(), tab: 'visitors' } },
    active: tab.value === 'visitors',
    count: visitors.value.length,
  },
]);

async function signVisitorOut(v: GateVisitor) {
  try {
    await visitorOut.mutateAsync(v.id);
    toast.success(`${v.name} signed out`);
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Couldn’t sign the visitor out. Try again.'));
  }
}

/* ---------- Log visitor ---------- */

const logging = ref(false);
const log = useLogVisitorMutation();
const { data: hostel } = useMyHostelQuery();
const boarders = computed(() => boardersOf(hostel.value));
const form = reactive({ branchId: '', name: '', phone: '', purpose: '', studentId: '' });
const errors = reactive<Record<string, string>>({});
const logError = ref('');

watch(logging, (o) => {
  if (!o) return;
  Object.assign(form, {
    branchId: branchId.value || branches.value[0]?.id || '',
    name: '',
    phone: '',
    purpose: '',
    studentId: '',
  });
  for (const key of Object.keys(errors)) delete errors[key];
  logError.value = '';
});

async function submitVisitor() {
  for (const key of Object.keys(errors)) delete errors[key];
  logError.value = '';
  if (!form.name.trim()) errors.name = 'Enter the visitor’s name.';
  if (!form.purpose.trim()) errors.purpose = 'Say why they’re here.';
  if (!form.branchId) errors.branchId = 'Choose the campus.';
  if (Object.keys(errors).length) return;
  try {
    await log.mutateAsync({
      branchId: form.branchId,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      purpose: form.purpose.trim(),
      studentId: form.studentId || undefined,
    });
    toast.success(`${form.name.trim()} signed in`);
    logging.value = false;
    tab.value = 'visitors';
  } catch (e) {
    Object.assign(errors, fieldErrorsOf(e));
    logError.value = getApiErrorMessage(e, 'The visitor couldn’t be logged. Try again.');
  }
}
</script>

<template>
  <PageHeader
    title="Gate"
    description="Boarders leaving and returning, and visitors on site. Refreshes every 30 seconds."
  >
    <template #actions>
      <NativeSelect
        v-if="branches.length > 1"
        v-model="branchId"
        aria-label="Campus"
        class="h-10 w-48"
      >
        <NativeSelectOption value="">All campuses</NativeSelectOption>
        <NativeSelectOption v-for="b in branches" :key="b.id" :value="b.id">{{
          b.name
        }}</NativeSelectOption>
      </NativeSelect>
      <Button
        variant="outline"
        class="h-10"
        :disabled="isFetching"
        aria-label="Refresh"
        @click="refetch()"
        ><RefreshCwIcon class="size-4" :class="isFetching && 'animate-spin'"
      /></Button>
      <Button class="h-10" @click="logging = true"><PlusIcon class="size-4" /> Log visitor</Button>
    </template>
  </PageHeader>

  <InlineNotice
    v-if="data?.overdue"
    tone="error"
    :title="`${data.overdue} boarder${data.overdue === 1 ? ' is' : 's are'} overdue`"
    description="They were due back and haven’t signed in. House staff have been told."
  />

  <TabNav :tabs="tabs" label="Gate" />

  <InlineNotice
    v-if="error"
    tone="error"
    title="The gate couldn’t load"
    :description="getApiErrorMessage(error, 'Refresh to try again.')"
  />
  <div v-else-if="isPending" class="flex flex-col gap-3">
    <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
  </div>

  <template v-else-if="tab === 'leaving'">
    <EmptyState
      v-if="!leaving.length"
      title="No one is leaving soon"
      description="Approved exeats leaving in the next day show here."
    />
    <SectionCard v-else title="Leaving" description="Approved exeats leaving within a day" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <ExeatRow v-for="e in leaving" :key="e.id" :exeat="e">
          <Button class="h-11 px-5" @click="actions.signOut(e)">Sign out</Button>
        </ExeatRow>
      </ul>
    </SectionCard>
  </template>

  <template v-else-if="tab === 'out'">
    <EmptyState v-if="!out.length" title="No boarders are out" />
    <SectionCard v-else title="Out now" description="Overdue first" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <ExeatRow v-for="e in out" :key="e.id" :exeat="e">
          <Button class="h-11 px-5" :disabled="actions.signingIn.value" @click="actions.signIn(e)"
            >Sign in</Button
          >
        </ExeatRow>
      </ul>
    </SectionCard>
  </template>

  <template v-else>
    <EmptyState
      v-if="!visitors.length"
      title="No visitors on site"
      description="Log visitors as they arrive and sign them out when they leave."
    />
    <SectionCard v-else title="Visitors on site" flush>
      <ul class="flex flex-col divide-y divide-divider">
        <li
          v-for="v in visitors"
          :key="v.id"
          class="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[14px] font-medium">{{ v.name }}</span>
            <span class="text-[13px]"
              >{{ v.purpose
              }}<template v-if="v.visiting"> · visiting {{ v.visiting }}</template></span
            >
            <span class="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>In at {{ timeOf(v.inAt) }}</span>
              <a
                v-if="v.phone"
                :href="`tel:${v.phone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
                ><PhoneIcon class="size-3" />{{ v.phone }}</a
              >
            </span>
          </div>
          <Button
            variant="outline"
            class="h-11 px-5"
            :disabled="visitorOut.isPending.value"
            @click="signVisitorOut(v)"
            >Log out</Button
          >
        </li>
      </ul>
    </SectionCard>
  </template>

  <SideDrawer
    v-model:open="logging"
    title="Log visitor"
    description="Sign a visitor in at the gate."
    :dirty="Boolean(form.name.trim() || form.purpose.trim())"
  >
    <form id="log-visitor" class="flex flex-col gap-4" novalidate @submit.prevent="submitVisitor">
      <div v-if="branches.length > 1" class="flex flex-col gap-1.5">
        <Label for="visitor-branch">Campus</Label>
        <NativeSelect id="visitor-branch" v-model="form.branchId" class="w-full">
          <NativeSelectOption v-for="b in branches" :key="b.id" :value="b.id">{{
            b.name
          }}</NativeSelectOption>
        </NativeSelect>
        <span v-if="errors.branchId" role="alert" class="text-xs text-error-strong">{{
          errors.branchId
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visitor-name">Name</Label>
        <Input
          id="visitor-name"
          v-model="form.name"
          autocomplete="off"
          :aria-invalid="Boolean(errors.name)"
        />
        <span v-if="errors.name" role="alert" class="text-xs text-error-strong">{{
          errors.name
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visitor-phone"
          >Phone <span class="font-normal text-faint">(optional)</span></Label
        >
        <Input
          id="visitor-phone"
          v-model="form.phone"
          type="tel"
          inputmode="tel"
          autocomplete="off"
        />
        <span v-if="errors.phone" role="alert" class="text-xs text-error-strong">{{
          errors.phone
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="visitor-purpose">Purpose</Label>
        <Input
          id="visitor-purpose"
          v-model="form.purpose"
          placeholder="e.g. Visiting day, delivery, meeting the bursar"
          :aria-invalid="Boolean(errors.purpose)"
        />
        <span v-if="errors.purpose" role="alert" class="text-xs text-error-strong">{{
          errors.purpose
        }}</span>
      </div>
      <BoarderPicker
        v-if="boarders.length"
        v-model="form.studentId"
        label="Visiting a boarder (optional)"
        :options="boarders"
        :error="errors.studentId"
      />
      <p
        v-if="logError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ logError }}
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="logging = false">Cancel</Button>
      <Button type="submit" form="log-visitor" :disabled="log.isPending.value">
        <Spinner v-if="log.isPending.value" />Sign in visitor
      </Button>
    </template>
  </SideDrawer>
</template>
