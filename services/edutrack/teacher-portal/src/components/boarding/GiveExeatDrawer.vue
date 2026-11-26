<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import {
  useCreateExeatMutation,
  useBoardingStudentsQuery,
  useMyHostelQuery,
  usePickupsQuery,
} from '@/api/services/boarding';
import { useTermContext } from '@/composables/useTermContext';
import { errorCodeOf, fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { routesPath as r } from '@/router/routes-path';
import type { ExeatKind } from '@/types';

import BoarderPicker from './BoarderPicker.vue';
import { boardersOf, EXEAT_KINDS, localAt, reasonRequired } from './boarding-format';

/** Give a boarder an exeat (approved straight away). `presetId` presets the boarder (a student id). */
const props = defineProps<{ presetId?: string }>();
const open = defineModel<boolean>('open', { required: true });

const router = useRouter();
const { now } = useTermContext();
const { data: hostel, isPending: hostelLoading } = useMyHostelQuery();
const create = useCreateExeatMutation();

const studentId = ref('');
const kind = ref<ExeatKind>('Weekend');
const leaveAt = ref('');
const returnBy = ref('');
const reason = ref('');
/** '' = a parent collects. */
const pickupPersonId = ref('');
const errors = reactive<Record<string, string>>({});
const serverError = ref('');

// Their own hostels' boarders, plus (the Head of boarding) every boarder in the school.
const { data: allBoarders } = useBoardingStudentsQuery('', { boarders: true });
const boarders = computed(() => {
  const out = new Map(boardersOf(hostel.value).map((b) => [b.studentId, b]));
  for (const s of allBoarders.value ?? []) if (!out.has(s.studentId)) out.set(s.studentId, s);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const { data: pickups } = usePickupsQuery(studentId);

function reset() {
  studentId.value = props.presetId ?? '';
  kind.value = 'Weekend';
  leaveAt.value = localAt(now.value, 1, '15:00');
  returnBy.value = localAt(now.value, 3, '17:00');
  reason.value = '';
  pickupPersonId.value = '';
  serverError.value = '';
  for (const key of Object.keys(errors)) delete errors[key];
}
watch(open, (o) => o && reset(), { immediate: true });
watch(studentId, () => (pickupPersonId.value = ''));

const dirty = computed(
  () => Boolean(reason.value.trim()) || studentId.value !== (props.presetId ?? ''),
);

function validate() {
  for (const key of Object.keys(errors)) delete errors[key];
  if (!studentId.value) errors.studentId = 'Choose the boarder.';
  if (!leaveAt.value) errors.leaveAt = 'Enter when they leave.';
  if (!returnBy.value) errors.returnBy = 'Enter when they must be back.';
  else if (leaveAt.value && returnBy.value <= leaveAt.value)
    errors.returnBy = 'They must be back after they leave.';
  if (reasonRequired(kind.value) && !reason.value.trim())
    errors.reason = `Give a reason for a ${kind.value.toLowerCase()} exeat.`;
  return !Object.keys(errors).length;
}

async function submit() {
  serverError.value = '';
  if (!validate()) return;
  try {
    const exeat = await create.mutateAsync({
      studentId: studentId.value,
      kind: kind.value,
      reason: reason.value.trim() || undefined,
      leaveAt: leaveAt.value,
      returnBy: returnBy.value,
      pickupPersonId: pickupPersonId.value || undefined,
    });
    toast.success(`Exeat given to ${exeat.student.name}`, {
      description: `Leaves ${exeat.leaves}, back by ${exeat.returns}. Their parents are told.`,
      action: {
        label: 'View',
        onClick: () => void router.push({ name: r.boarding.exeat.name, params: { id: exeat.id } }),
      },
    });
    open.value = false;
  } catch (error) {
    Object.assign(errors, fieldErrorsOf(error));
    serverError.value =
      errorCodeOf(error) === 'EXEAT_OVERLAP'
        ? 'This boarder already has an exeat for some of these dates.'
        : getApiErrorMessage(error, 'The exeat couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Give exeat"
    description="Approved straight away; the boarder’s parents are told."
    :dirty="dirty"
  >
    <form id="give-exeat" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <BoarderPicker
        v-model="studentId"
        label="Boarder"
        :options="boarders"
        :loading="hostelLoading"
        :error="errors.studentId"
        empty-text="You can give exeats to boarders in the hostels you look after."
      />
      <div class="flex flex-col gap-1.5">
        <Label for="exeat-kind">Kind</Label>
        <NativeSelect id="exeat-kind" v-model="kind" class="w-full">
          <NativeSelectOption v-for="k in EXEAT_KINDS" :key="k" :value="k">{{
            k
          }}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <Label for="exeat-leave">Leaves</Label>
          <Input
            id="exeat-leave"
            v-model="leaveAt"
            type="datetime-local"
            :aria-invalid="Boolean(errors.leaveAt)"
          />
          <span v-if="errors.leaveAt" role="alert" class="text-xs text-error-strong">{{
            errors.leaveAt
          }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="exeat-return">Back by</Label>
          <Input
            id="exeat-return"
            v-model="returnBy"
            type="datetime-local"
            :aria-invalid="Boolean(errors.returnBy)"
          />
          <span v-if="errors.returnBy" role="alert" class="text-xs text-error-strong">{{
            errors.returnBy
          }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="exeat-reason"
          >Reason<span v-if="!reasonRequired(kind)" class="font-normal text-faint">
            (optional)</span
          ></Label
        >
        <Textarea
          id="exeat-reason"
          v-model="reason"
          :rows="3"
          :aria-invalid="Boolean(errors.reason)"
        />
        <span v-if="errors.reason" role="alert" class="text-xs text-error-strong">{{
          errors.reason
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="exeat-pickup">Who collects</Label>
        <NativeSelect
          id="exeat-pickup"
          v-model="pickupPersonId"
          class="w-full"
          :disabled="!studentId"
        >
          <NativeSelectOption value="">A parent</NativeSelectOption>
          <NativeSelectOption v-for="p in pickups ?? []" :key="p.id" :value="p.id"
            >{{ p.name }} ({{ p.relationship }})</NativeSelectOption
          >
        </NativeSelect>
        <span v-if="errors.pickupPersonId" role="alert" class="text-xs text-error-strong">{{
          errors.pickupPersonId
        }}</span>
        <span v-else class="text-xs text-faint"
          >Parents add approved pickup people in the Parent Portal.</span
        >
      </div>
      <p
        v-if="serverError"
        role="alert"
        class="rounded-md bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong"
      >
        {{ serverError }}
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="give-exeat" :disabled="create.isPending.value">
        <Spinner v-if="create.isPending.value" />Give exeat
      </Button>
    </template>
  </SideDrawer>
</template>
