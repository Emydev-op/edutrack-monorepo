<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { getApiErrorCode, getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { ArrowRightLeftIcon, BedDoubleIcon, LogOutIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useSetStudentBoardingMutation,
  useStudentBoardingQuery,
  useUnplaceMutation,
} from '@/api/services/boarding';
import { routesPath } from '@/router/routes-path';
import type { StudentBoarding, StudentDetail } from '@/types';
import { placeLabel } from '@/views/boarding/boarding-format';
import PlaceBoarderDialog, { type PlaceTarget } from '@/views/boarding/PlaceBoarderDialog.vue';
import StudentBoardingHouse from '@/views/boarding/StudentBoardingHouse.vue';

/**
 * The student's boarding this session: Day student or Boarder, and for a boarder their hostel,
 * room and bed and who looks after them, then their house life: pickup people, exeats, sick bay,
 * incidents and property.
 */
const props = defineProps<{ student: StudentDetail }>();

const confirm = useConfirm();
const {
  data: b,
  isPending,
  isError,
  error,
  refetch,
} = useStudentBoardingQuery(() => props.student.id);
const setBoarding = useSetStudentBoardingMutation();
const unplace = useUnplaceMutation();

const notEnrolled = computed(() => getApiErrorCode(error.value) === 'NOT_ENROLLED');

const placeOpen = ref(false);
const target = computed<PlaceTarget | null>(() =>
  b.value
    ? {
        studentId: b.value.studentId,
        name: b.value.name,
        gender: props.student.gender,
        campus: b.value.campus,
        place: b.value.place,
      }
    : null,
);

/** What the change did to this term's boarding fees (kept fees are flagged for Finance). */
function feesToast(result: StudentBoarding) {
  const f = result.fees;
  if (!f?.note) return;
  if (f.change === 'kept') toast.warning(f.note, { duration: 10_000 });
  else toast.info(f.note);
}

function makeBoarder() {
  const s = b.value!;
  void confirm({
    title: `Make ${s.name} a boarder?`,
    description: `${s.name} boards at ${s.campus} for ${s.session}. Place them in a room next.`,
    confirmLabel: 'Make boarder',
    action: async () => {
      const result = await setBoarding.mutateAsync({ studentId: s.studentId, boarding: true });
      toast.success(messageOf(result, `${s.name} is now a boarder.`));
      feesToast(result);
      placeOpen.value = true;
    },
  });
}

function makeDay() {
  const s = b.value!;
  void confirm({
    title: `Make ${s.name} a day student?`,
    description: `${
      s.place
        ? `Their bed in ${placeLabel(s.place)} is freed for another boarder.`
        : 'They no longer need a place in a hostel.'
    } This term’s boarding fees come off the invoice only in the first two weeks of term.`,
    details: [['Session', s.session]],
    confirmLabel: 'Make day student',
    tone: 'destructive',
    action: async () => {
      const result = await setBoarding.mutateAsync({ studentId: s.studentId, boarding: false });
      toast.success(messageOf(result, `${s.name} is now a day student.`));
      feesToast(result);
    },
  });
}

function takeOut() {
  const s = b.value!;
  if (!s.place) return;
  void confirm({
    title: `Take ${s.name} out of ${s.place.room}?`,
    description: `${s.name} stays a boarder and shows as “Needs a place” until you place them again.`,
    details: [['Now in', placeLabel(s.place)]],
    confirmLabel: 'Take out of room',
    tone: 'destructive',
    action: async () => {
      await unplace.mutateAsync(s.studentId);
      toast.success(`${s.name} taken out of ${s.place!.room}.`);
    },
  });
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-48" />
  <InlineNotice
    v-else-if="notEnrolled"
    tone="neutral"
    title="Not in a class this session"
    :description="getApiErrorMessage(error, 'Place the student in a class for this session first.')"
  />
  <InlineNotice
    v-else-if="isError || !b"
    tone="error"
    title="Boarding couldn’t load"
    :description="getApiErrorMessage(error, 'Check your connection and try again.')"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Retry</Button></template
    >
  </InlineNotice>

  <template v-else>
    <InlineNotice
      v-if="!b.eligible && !b.boarding"
      tone="neutral"
      :title="`${b.className || 'This class'} at ${b.campus} doesn’t board`"
      :description="b.reason ?? 'Their campus or class doesn’t take boarders.'"
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.boarding.setup.name }"
            >Boarding set-up</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-else-if="b.boarding && !b.place"
      tone="warning"
      title="Needs a place"
      :description="`${b.name} is a boarder but has no room yet.`"
    >
      <template v-if="b.editable" #action>
        <Button size="sm" @click="placeOpen = true"><BedDoubleIcon />Place</Button>
      </template>
    </InlineNotice>

    <div class="grid items-start gap-4 md:grid-cols-2">
      <KeyValueCard
        :title="`Boarding · ${b.session}`"
        :rows="[
          { label: 'Status', value: b.boarding ? 'Boarder' : 'Day student', emphasis: 'strong' },
          { label: 'Campus', value: b.campus },
          { label: 'Class', value: b.className },
          ...(b.boarding
            ? b.place
              ? [
                  { label: 'Hostel', value: b.place.hostel },
                  ...(b.place.floor ? [{ label: 'Floor or wing', value: b.place.floor }] : []),
                  { label: 'Room', value: b.place.room },
                  ...(b.place.bed ? [{ label: 'Bed', value: b.place.bed }] : []),
                  { label: 'Since', value: b.place.since },
                ]
              : [{ label: 'Room', value: 'Needs a place', emphasis: 'error' as const }]
            : []),
        ]"
      >
        <template #action>
          <StatusBadge
            :label="b.boarding ? 'Boarder' : 'Day student'"
            :tone="b.boarding ? 'brand' : 'neutral'"
          />
        </template>
      </KeyValueCard>

      <SectionCard
        v-if="b.place"
        title="House staff"
        description="Who looks after them in the hostel."
      >
        <ul v-if="b.place.houseStaff.length" class="flex flex-col gap-2">
          <li
            v-for="s in b.place.houseStaff"
            :key="s.staffId"
            class="flex flex-col rounded-md border px-3 py-2 text-[13px]"
          >
            <span class="font-medium">{{ s.name }}</span>
            <span class="text-xs text-muted-foreground">{{ s.role }}</span>
          </li>
        </ul>
        <p v-else class="text-[13px] text-muted-foreground">
          {{ b.place.hostel }} has no house master / mistress yet.
        </p>
      </SectionCard>
    </div>

    <div v-if="b.editable" class="flex flex-wrap gap-2">
      <template v-if="b.boarding">
        <Button v-if="b.place" variant="outline" @click="placeOpen = true"
          ><ArrowRightLeftIcon />Move</Button
        >
        <Button v-else @click="placeOpen = true"><BedDoubleIcon />Place</Button>
        <Button v-if="b.place" variant="outline" @click="takeOut"
          ><LogOutIcon />Take out of room</Button
        >
        <Button variant="ghost" class="text-destructive" @click="makeDay">Make day student</Button>
      </template>
      <Button v-else-if="b.eligible" @click="makeBoarder">Make boarder</Button>
    </div>

    <StudentBoardingHouse v-if="b.boarding" :student="student" :class-name="b.className" />

    <PlaceBoarderDialog v-model:open="placeOpen" :student="target" />
  </template>
</template>
