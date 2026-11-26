<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { CheckIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';

import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useExeatsQuery,
  useIncidentsQuery,
  usePickupsQuery,
  usePropertyQuery,
  useRemovePickupMutation,
  useSickBayQuery,
} from '@/api/services/boarding-house';
import type { Exeat, PickupPerson, PropertyCheck, PropertyKind, StudentDetail } from '@/types';

import ExeatDetailSheet from './ExeatDetailSheet.vue';
import GiveExeatDialog from './GiveExeatDialog.vue';
import type { PickedStudent } from './house-format';
import { exeatBadge, OUTCOME_TONE, pickupLabel, whenLabel } from './house-format';
import IncidentDialog from './IncidentDialog.vue';
import PickupDialog from './PickupDialog.vue';
import PropertyDialog from './PropertyDialog.vue';
import { useExeatActions } from './use-exeat-actions';

/**
 * A boarder’s house life on their record: who may collect them, their exeats, sick bay visits,
 * incidents and this term’s property check-in and check-out.
 */
const props = defineProps<{ student: StudentDetail; className: string }>();
const id = computed(() => props.student.id);
const confirm = useConfirm();
const exeatActions = useExeatActions();

const picked = computed<PickedStudent>(() => ({
  id: props.student.id,
  name: props.student.name,
  detail: [props.className, props.student.admissionNo].filter(Boolean).join(' · '),
}));

/* Pickup people */
const { data: pickups, isPending: pickupsPending } = usePickupsQuery(id);
const removePickup = useRemovePickupMutation();
const pickupOpen = ref(false);
function remove(p: PickupPerson) {
  void confirm({
    title: `Remove ${p.name}?`,
    description: `${p.name} can no longer collect ${props.student.name} at the gate.`,
    details: [
      ['Relationship', p.relationship],
      ['Phone', p.phone],
    ],
    confirmLabel: 'Remove',
    tone: 'destructive',
    action: async () => {
      await removePickup.mutateAsync({ studentId: id.value, id: p.id });
      toast.success(`${p.name} removed.`);
    },
  });
}

/* Exeats: searched by admission number, then kept to this student. */
const { data: exeatList, isPending: exeatsPending } = useExeatsQuery(() => ({
  q: props.student.admissionNo,
}));
const exeats = computed(() =>
  (exeatList.value?.exeats ?? []).filter((e) => e.student.id === id.value),
);
const giveOpen = ref(false);
const detailOpen = ref(false);
const selected = ref<Exeat | null>(null);
function view(e: Exeat) {
  selected.value = e;
  detailOpen.value = true;
}

/* Sick bay and incidents */
const { data: sick, isPending: sickPending } = useSickBayQuery(() => ({
  studentId: id.value,
  days: 365,
}));
const visits = computed(() => sick.value?.visits ?? []);
const { data: incidentList, isPending: incidentsPending } = useIncidentsQuery(() => ({
  studentId: id.value,
}));
const incidentOpen = ref(false);

/* Property */
const { data: property, isPending: propertyPending } = usePropertyQuery(id);
const propertyOpen = ref(false);
const propertyKind = ref<PropertyKind>('Check-in');
function editProperty(kind: PropertyKind) {
  propertyKind.value = kind;
  propertyOpen.value = true;
}
const checkSummary = (c: PropertyCheck | null) => {
  if (!c) return null;
  const have = c.items.filter((i) => i.present);
  const missing = c.items.filter((i) => !i.present).map((i) => i.item);
  return { at: whenLabel(c.checkedAt), have, missing, note: c.note };
};
const checks = computed(() => [
  { kind: 'Check-in' as const, summary: checkSummary(property.value?.checkIn ?? null) },
  { kind: 'Check-out' as const, summary: checkSummary(property.value?.checkOut ?? null) },
]);
</script>

<template>
  <div class="grid items-start gap-4 md:grid-cols-2">
    <!-- Pickup people -->
    <SectionCard
      title="Pickup people"
      description="Besides parents, who may collect them on exeat."
    >
      <template #actions>
        <Button
          variant="outline"
          size="sm"
          :disabled="(pickups?.length ?? 0) >= 10"
          @click="pickupOpen = true"
          ><PlusIcon />Add</Button
        >
      </template>
      <Skeleton v-if="pickupsPending" class="h-14" />
      <p v-else-if="!pickups?.length" class="text-[13px] text-muted-foreground">
        Only their parents can collect them.
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="p in pickups"
          :key="p.id"
          class="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-medium"
              >{{ p.name }}
              <span class="font-normal text-muted-foreground">({{ p.relationship }})</span></span
            >
            <span class="text-xs tabular-nums">{{ p.phone }}</span>
            <span v-if="p.note" class="text-xs text-faint">{{ p.note }}</span>
          </span>
          <Button variant="ghost" size="icon" :aria-label="`Remove ${p.name}`" @click="remove(p)"
            ><Trash2Icon
          /></Button>
        </li>
      </ul>
    </SectionCard>

    <!-- Exeats -->
    <SectionCard title="Exeats" description="Leave this session.">
      <template #actions>
        <Button variant="outline" size="sm" @click="giveOpen = true"><PlusIcon />Give exeat</Button>
      </template>
      <Skeleton v-if="exeatsPending" class="h-14" />
      <p v-else-if="!exeats.length" class="text-[13px] text-muted-foreground">No exeats yet.</p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="e in exeats.slice(0, 8)"
          :key="e.id"
          class="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"
        >
          <button
            type="button"
            class="flex min-w-0 flex-col text-left hover:underline focus-visible:underline focus-visible:outline-none"
            @click="view(e)"
          >
            <span class="font-medium">{{ e.kind }}</span>
            <span class="text-xs tabular-nums text-muted-foreground"
              >{{ e.leaves }} → {{ e.returns }}</span
            >
            <span class="text-xs text-faint">{{ pickupLabel(e) }}</span>
          </button>
          <span class="flex flex-col items-end gap-1.5">
            <StatusBadge :label="exeatBadge(e).label" :tone="exeatBadge(e).tone" />
            <Button
              v-if="e.status === 'Requested'"
              size="sm"
              variant="outline"
              class="h-7"
              @click="exeatActions.approve(e)"
              ><CheckIcon />Approve</Button
            >
          </span>
        </li>
      </ul>
    </SectionCard>

    <!-- Sick bay -->
    <SectionCard title="Sick bay visits" description="The last 12 months.">
      <Skeleton v-if="sickPending" class="h-14" />
      <p v-else-if="!visits.length" class="text-[13px] text-muted-foreground">
        No sick bay visits.
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="v in visits.slice(0, 8)"
          :key="v.id"
          class="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-medium">{{ v.complaint }}</span>
            <span class="text-xs text-muted-foreground">{{
              [v.treatment, v.medication].filter(Boolean).join(' · ') || 'No treatment recorded'
            }}</span>
            <span class="text-xs tabular-nums text-faint">{{ v.seen }}</span>
          </span>
          <StatusBadge
            :label="v.inSickBay ? 'In sick bay' : v.outcome"
            :tone="v.inSickBay ? 'warning' : OUTCOME_TONE[v.outcome]"
          />
        </li>
      </ul>
    </SectionCard>

    <!-- Incidents -->
    <SectionCard title="Incidents" description="Recorded by house staff.">
      <template #actions>
        <Button variant="outline" size="sm" @click="incidentOpen = true"><PlusIcon />Record</Button>
      </template>
      <Skeleton v-if="incidentsPending" class="h-14" />
      <p v-else-if="!incidentList?.incidents.length" class="text-[13px] text-muted-foreground">
        No incidents.
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="i in incidentList.incidents.slice(0, 8)"
          :key="i.id"
          class="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-medium">{{ i.category }}</span>
            <span class="text-xs text-muted-foreground">{{ i.description }}</span>
            <span v-if="i.action" class="text-xs text-muted-foreground"
              >Action: {{ i.action }}</span
            >
            <span class="text-xs tabular-nums text-faint"
              >{{ i.when }}{{ i.sharedWithParent ? ' · shared with parents' : '' }}</span
            >
          </span>
          <StatusBadge :label="i.status" />
        </li>
      </ul>
    </SectionCard>

    <!-- Property -->
    <SectionCard
      title="Property"
      :description="`${property?.term ? `${property.term} · ` : ''}What they brought and took home.`"
      class="md:col-span-2"
    >
      <Skeleton v-if="propertyPending" class="h-20" />
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <div v-for="c in checks" :key="c.kind" class="flex flex-col gap-1.5 rounded-md border p-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold">{{ c.kind }}</h3>
            <Button
              variant="outline"
              size="sm"
              :disabled="c.kind === 'Check-out' && !property?.checkIn"
              @click="editProperty(c.kind)"
              >{{ c.summary ? 'Edit' : c.kind }}</Button
            >
          </div>
          <template v-if="c.summary">
            <span class="text-xs text-faint">{{ c.summary.at }}</span>
            <span class="text-[13px]">{{
              c.summary.have
                .map((i) => (i.quantity && i.quantity > 1 ? `${i.item} ×${i.quantity}` : i.item))
                .join(', ') || 'Nothing ticked'
            }}</span>
            <span v-if="c.summary.missing.length" class="text-xs text-warning-strong"
              >Missing: {{ c.summary.missing.join(', ') }}</span
            >
            <span v-if="c.summary.note" class="text-xs text-muted-foreground">{{
              c.summary.note
            }}</span>
          </template>
          <span v-else class="text-[13px] text-muted-foreground">{{
            c.kind === 'Check-in' ? 'Not checked in this term.' : 'Not checked out yet.'
          }}</span>
        </div>
      </div>
    </SectionCard>
  </div>

  <PickupDialog v-model:open="pickupOpen" :student-id="student.id" :student-name="student.name" />
  <GiveExeatDialog v-model:open="giveOpen" :student="picked" />
  <ExeatDetailSheet v-model:open="detailOpen" :exeat="selected" />
  <IncidentDialog
    v-model:open="incidentOpen"
    :student="picked"
    :categories="incidentList?.categories ?? []"
  />
  <PropertyDialog
    v-model:open="propertyOpen"
    :student-id="student.id"
    :student-name="student.name"
    :property="property"
    :kind="propertyKind"
  />
</template>
