<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@edutrack/ui/components/sheet';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import type { StatusTone } from '@edutrack/ui/lib/status';
import { CheckIcon, PlusIcon, XIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import { messageOf } from '@edutrack/web-core/http';

import {
  useBoardingQuery,
  useCancelExeatMutation,
  useRemovePickupMutation,
} from '@/api/services/boarding';
import ExeatSheet from '@/components/boarding/ExeatSheet.vue';
import PickupSheet from '@/components/boarding/PickupSheet.vue';
import AlertCard from '@/components/common/AlertCard.vue';
import ListRow from '@/components/common/ListRow.vue';
import ListSection from '@/components/common/ListSection.vue';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { getApiErrorMessage } from '@/lib/api-errors';
import { formatDay, formatWeekday } from '@/lib/dates';
import type { Exeat, ExeatStatus, PickupPerson, PropertyCheck } from '@/types';

/**
 * Boarding for the selected child: exeats (and asking for one), the pickup list, sick bay
 * visits, visiting days, notes from the boarding house and this term's property checks.
 */
const { child, id } = useCurrentChild();
const q = useBoardingQuery(id);
const b = computed(() => q.data.value);
const canAct = computed(() => child.value?.access === 'full');
const firstName = computed(() => child.value?.firstName ?? 'your child');

const ACTIVE: ExeatStatus[] = ['Requested', 'Approved', 'Out'];
const STATUS_TONE: Record<ExeatStatus, StatusTone> = {
  Requested: 'warning',
  Approved: 'success',
  Declined: 'error',
  Out: 'info',
  Returned: 'neutral',
  Cancelled: 'neutral',
};
const current = computed(() =>
  (b.value?.exeats ?? [])
    .filter((e) => ACTIVE.includes(e.status))
    .sort((x, y) => x.leaveAt.localeCompare(y.leaveAt)),
);
const past = computed(() => (b.value?.exeats ?? []).filter((e) => !ACTIVE.includes(e.status)));
const overdue = computed(() => current.value.filter((e) => e.overdue));
const inSickBay = computed(() => (b.value?.sickBay ?? []).filter((v) => v.inSickBay));

const collector = (e: Exeat) =>
  e.pickup ? `${e.pickup.name} (${e.pickup.relationship}) collects` : 'A parent collects';
const canCancel = (e: Exeat) => e.status === 'Requested' || e.status === 'Approved';

const exeatOpen = ref(false);
const pickupOpen = ref(false);

// One confirm sheet for cancelling an exeat or removing a pickup person.
type Confirm = { kind: 'cancel'; exeat: Exeat } | { kind: 'remove'; person: PickupPerson };
const confirm = ref<Confirm | null>(null);
const confirmOpen = computed({
  get: () => !!confirm.value,
  set: (v) => {
    if (!v) confirm.value = null;
  },
});
const cancelExeat = useCancelExeatMutation(id);
const removePickup = useRemovePickupMutation(id);
const busy = computed(() => cancelExeat.isPending.value || removePickup.isPending.value);
async function onConfirm() {
  const c = confirm.value;
  if (!c) return;
  try {
    if (c.kind === 'cancel') {
      const res = await cancelExeat.mutateAsync(c.exeat.id);
      toast.success(messageOf(res, 'Exeat cancelled.'));
    } else {
      const res = await removePickup.mutateAsync(c.person.id);
      toast.success(messageOf(res, `${c.person.name} was removed from the pickup list.`));
    }
    confirm.value = null;
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'That didn’t work. Try again.'));
  }
}

const checks = computed(() => {
  const p = b.value?.property;
  if (!p) return [];
  return [
    { label: 'Check-in', check: p.checkIn },
    { label: 'Check-out', check: p.checkOut },
  ].filter((c): c is { label: string; check: PropertyCheck } => !!c.check);
});
</script>

<template>
  <PageTitle
    :title="`Boarding · ${child?.firstName ?? ''}`"
    :sub="
      child?.boarding?.place
        ? `${child.boarding.place.hostel} · ${/^room\b/i.test(child.boarding.place.room) ? '' : 'Room '}${child.boarding.place.room}`
        : child?.className
    "
  />
  <QueryState v-if="!b" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />
  <p
    v-else-if="!b.boarder"
    class="rounded-lg border bg-card px-3.5 py-3.5 text-[13px] text-muted-foreground"
  >
    {{ firstName }} isn’t a boarder, so there’s nothing to show here.
  </p>
  <template v-else>
    <AlertCard
      v-for="e in overdue"
      :key="`overdue-${e.id}`"
      tone="error"
      title="Late back from exeat"
      :text="`${firstName} was due back ${e.returns}. Please contact the boarding house.`"
    />
    <AlertCard
      v-for="v in inSickBay"
      :key="`sick-${v.id}`"
      tone="warning"
      title="In the sick bay now"
      :text="`Since ${v.seen} · ${v.complaint}`"
    />

    <section class="flex flex-col gap-1.5" aria-labelledby="exeats-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="exeats-title" class="text-sm font-semibold">Exeats</h2>
        <Button v-if="canAct" size="sm" class="h-10" @click="exeatOpen = true">
          <PlusIcon class="size-4" aria-hidden="true" /> Ask for an exeat
        </Button>
      </div>
      <div
        class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
      >
        <div v-for="e in current" :key="e.id" class="flex flex-col gap-1.5 px-3.5 py-3">
          <div class="flex items-start justify-between gap-3">
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="text-sm font-medium">{{ e.kind }}</span>
              <span class="text-xs text-muted-foreground">Leaves {{ e.leaves }}</span>
              <span class="text-xs text-muted-foreground">Back by {{ e.returns }}</span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge :label="e.status" :tone="STATUS_TONE[e.status]" />
              <StatusBadge v-if="e.overdue" label="Overdue" tone="error" />
            </span>
          </div>
          <span class="text-xs text-faint">{{ collector(e) }}</span>
          <span v-if="e.reason" class="text-xs text-faint">Reason: {{ e.reason }}</span>
          <span v-if="e.status === 'Out' && e.collectedBy" class="text-xs text-faint"
            >Collected by {{ e.collectedBy }}</span
          >
          <Button
            v-if="canAct && canCancel(e)"
            variant="outline"
            size="sm"
            class="h-10 self-start"
            @click="confirm = { kind: 'cancel', exeat: e }"
            >Cancel exeat</Button
          >
        </div>
        <p v-if="!current.length" class="px-3.5 py-3.5 text-[13px] text-muted-foreground">
          No exeats coming up.
        </p>
      </div>
    </section>

    <ListSection v-if="past.length" title="Past exeats">
      <ListRow
        v-for="e in past"
        :key="e.id"
        :title="`${e.kind} · ${e.leaves}`"
        :badge="e.status"
        :tone="STATUS_TONE[e.status]"
      >
        <template #sub>
          <span v-if="e.status === 'Declined'">{{
            e.decisionNote ? `Declined: ${e.decisionNote}` : 'Declined'
          }}</span>
          <span v-else-if="e.status === 'Returned'"
            >Back {{ e.lateReturn ? 'late' : 'on time' }} · due {{ e.returns }}</span
          >
          <span v-else>Back by {{ e.returns }}</span>
        </template>
      </ListRow>
    </ListSection>

    <section class="flex flex-col gap-1.5" aria-labelledby="pickups-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="pickups-title" class="text-sm font-semibold">Pickup people</h2>
        <Button
          v-if="canAct && b.pickups.length < 10"
          variant="outline"
          size="sm"
          class="h-10"
          @click="pickupOpen = true"
        >
          <PlusIcon class="size-4" aria-hidden="true" /> Add
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">
        Only parents and the people listed here can collect {{ firstName }} at the gate.
      </p>
      <div
        class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
      >
        <div
          v-for="p in b.pickups"
          :key="p.id"
          class="flex min-h-13 items-center justify-between gap-3 px-3.5 py-2.5"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium">{{ p.name }}</span>
            <span class="truncate text-xs text-muted-foreground"
              >{{ p.relationship }} · {{ p.phone }}</span
            >
            <span v-if="p.note" class="text-xs text-faint">{{ p.note }}</span>
          </span>
          <Button
            v-if="canAct"
            variant="ghost"
            size="sm"
            class="h-10 shrink-0 text-destructive"
            :aria-label="`Remove ${p.name}`"
            @click="confirm = { kind: 'remove', person: p }"
            >Remove</Button
          >
        </div>
        <p v-if="!b.pickups.length" class="px-3.5 py-3.5 text-[13px] text-muted-foreground">
          No one else yet. Add a relative or driver who may collect {{ firstName }}.
        </p>
      </div>
    </section>

    <section class="flex flex-col gap-1.5" aria-labelledby="sickbay-title">
      <h2 id="sickbay-title" class="text-sm font-semibold">Sick bay</h2>
      <div
        class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
      >
        <div
          v-for="v in b.sickBay"
          :key="v.id"
          class="flex flex-col gap-0.5 px-3.5 py-3"
          :class="v.inSickBay && 'bg-warning-subtle'"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="text-sm font-medium">{{ v.complaint }}</span>
            <StatusBadge
              :label="v.inSickBay ? 'In the sick bay now' : v.outcome"
              :tone="v.inSickBay ? 'warning' : v.outcome === 'Back to class' ? 'success' : 'info'"
            />
          </div>
          <span class="text-xs text-muted-foreground">{{ v.seen }}</span>
          <span v-if="v.treatment" class="text-xs text-faint">Treatment: {{ v.treatment }}</span>
          <span v-if="v.medication" class="text-xs text-faint">Medication: {{ v.medication }}</span>
        </div>
        <p v-if="!b.sickBay.length" class="px-3.5 py-3.5 text-[13px] text-muted-foreground">
          No sick bay visits in the last year.
        </p>
      </div>
    </section>

    <ListSection
      title="Visiting days"
      :empty="b.visitingDays.length ? undefined : 'No visiting days planned yet.'"
    >
      <ListRow
        v-for="v in b.visitingDays"
        :key="v.id"
        :title="formatWeekday(v.date)"
        :sub="[v.campus, v.note].filter(Boolean).join(' · ')"
        :right="`${v.startsAt}–${v.endsAt}`"
      />
    </ListSection>

    <section class="flex flex-col gap-1.5" aria-labelledby="notes-title">
      <h2 id="notes-title" class="text-sm font-semibold">Notes from the boarding house</h2>
      <div
        class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
      >
        <div v-for="n in b.incidents" :key="n.id" class="flex flex-col gap-0.5 px-3.5 py-3">
          <div class="flex items-start justify-between gap-3">
            <span class="text-sm font-medium">{{ n.category }}</span>
            <span class="text-xs whitespace-nowrap text-faint">{{ n.when }}</span>
          </div>
          <span class="text-[13px] text-pretty text-body">{{ n.description }}</span>
          <span v-if="n.action" class="text-xs text-muted-foreground"
            >What was done: {{ n.action }}</span
          >
        </div>
        <p v-if="!b.incidents.length" class="px-3.5 py-3.5 text-[13px] text-muted-foreground">
          No notes from the boarding house.
        </p>
      </div>
    </section>

    <section v-for="c in checks" :key="c.label" class="flex flex-col gap-1.5">
      <h2 class="text-sm font-semibold">
        Property · {{ c.label }}{{ b.property.term ? ` · ${b.property.term}` : '' }}
      </h2>
      <div
        class="overflow-hidden rounded-lg border bg-card [&>*+*]:border-t [&>*+*]:border-divider"
      >
        <div
          v-for="i in c.check.items"
          :key="i.item"
          class="flex min-h-11 items-center gap-2.5 px-3.5 py-2"
        >
          <CheckIcon v-if="i.present" class="size-4 shrink-0 text-success" aria-label="Present" />
          <XIcon v-else class="size-4 shrink-0 text-destructive" aria-label="Missing" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm" :class="!i.present && 'text-muted-foreground'">{{ i.item }}</span>
            <span v-if="i.note" class="text-xs text-faint">{{ i.note }}</span>
          </span>
          <span
            v-if="i.present && i.quantity > 1"
            class="text-[13px] text-muted-foreground tabular-nums"
            >× {{ i.quantity }}</span
          >
        </div>
        <p class="px-3.5 py-2.5 text-xs text-muted-foreground">
          Checked {{ formatDay(c.check.checkedAt.slice(0, 10))
          }}{{ c.check.note ? ` · ${c.check.note}` : '' }}
        </p>
      </div>
    </section>

    <template v-if="id && canAct">
      <ExeatSheet
        v-model:open="exeatOpen"
        :child-id="id"
        :first-name="firstName"
        :pickups="b.pickups"
      />
      <PickupSheet v-model:open="pickupOpen" :child-id="id" :first-name="firstName" />
    </template>
    <Sheet v-model:open="confirmOpen">
      <SheetContent side="bottom" class="mx-auto max-w-lg rounded-t-2xl px-5 pt-5 pb-7">
        <SheetHeader v-if="confirm" class="p-0">
          <SheetTitle>{{
            confirm.kind === 'cancel'
              ? `Cancel ${firstName}’s ${confirm.exeat.kind.toLowerCase()} exeat?`
              : `Remove ${confirm.person.name}?`
          }}</SheetTitle>
          <SheetDescription>{{
            confirm.kind === 'cancel'
              ? `${firstName} won’t be allowed out for it. You can ask again later.`
              : `They won’t be able to collect ${firstName} at the gate.`
          }}</SheetDescription>
        </SheetHeader>
        <Button variant="destructive" size="lg" :disabled="busy" @click="onConfirm">
          <Spinner v-if="busy" />
          {{ confirm?.kind === 'cancel' ? 'Cancel exeat' : 'Remove' }}
        </Button>
        <Button variant="outline" size="lg" @click="confirmOpen = false">Keep</Button>
      </SheetContent>
    </Sheet>
  </template>
</template>
