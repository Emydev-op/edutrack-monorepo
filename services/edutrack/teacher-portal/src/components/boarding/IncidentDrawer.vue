<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@edutrack/ui/components/native-select';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import {
  useIncidentsQuery,
  useBoardingStudentsQuery,
  useMyHostelQuery,
  useRecordIncidentMutation,
} from '@/api/services/boarding';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';

import BoarderPicker from './BoarderPicker.vue';
import { boardersOf } from './boarding-format';

/** Record an incident for a boarder. `presetId` presets the boarder (a student id). */
const props = defineProps<{ presetId?: string }>();
const open = defineModel<boolean>('open', { required: true });

const { data: hostel, isPending: hostelLoading } = useMyHostelQuery();
// The categories come with the incident list.
const { data: list } = useIncidentsQuery();
const record = useRecordIncidentMutation();

const studentId = ref('');
const category = ref('');
const description = ref('');
const action = ref('');
const occurredAt = ref('');
const shareWithParent = ref(false);
const errors = reactive<Record<string, string>>({});
const serverError = ref('');

// Their own hostels' boarders, plus (the Head of boarding) every boarder in the school.
const { data: allBoarders } = useBoardingStudentsQuery('', { boarders: true });
const boarders = computed(() => {
  const out = new Map(boardersOf(hostel.value).map((b) => [b.studentId, b]));
  for (const s of allBoarders.value ?? []) if (!out.has(s.studentId)) out.set(s.studentId, s);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const categories = computed(() => list.value?.categories ?? []);

function reset() {
  studentId.value = props.presetId ?? '';
  category.value = '';
  description.value = '';
  action.value = '';
  occurredAt.value = '';
  shareWithParent.value = false;
  serverError.value = '';
  for (const key of Object.keys(errors)) delete errors[key];
}
watch(open, (o) => o && reset(), { immediate: true });

const dirty = computed(() => Boolean(description.value.trim() || action.value.trim()));

async function submit() {
  serverError.value = '';
  for (const key of Object.keys(errors)) delete errors[key];
  if (!studentId.value) errors.studentId = 'Choose the boarder.';
  if (!category.value) errors.category = 'Choose a category.';
  if (!description.value.trim()) errors.description = 'Say what happened.';
  if (Object.keys(errors).length) return;
  try {
    await record.mutateAsync({
      studentId: studentId.value,
      category: category.value,
      description: description.value.trim(),
      action: action.value.trim() || undefined,
      occurredAt: occurredAt.value || undefined,
      shareWithParent: shareWithParent.value,
    });
    toast.success('Incident recorded', {
      description: shareWithParent.value ? 'The boarder’s parents can see it.' : undefined,
    });
    open.value = false;
  } catch (error) {
    Object.assign(errors, fieldErrorsOf(error));
    serverError.value = getApiErrorMessage(error, 'The incident couldn’t be saved. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Record incident"
    description="Seen by house staff and the head of boarding."
    :dirty="dirty"
  >
    <form id="record-incident" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <BoarderPicker
        v-model="studentId"
        label="Boarder"
        :options="boarders"
        :loading="hostelLoading"
        :error="errors.studentId"
        empty-text="You can record incidents for boarders in the hostels you look after."
      />
      <div class="flex flex-col gap-1.5">
        <Label for="incident-category">Category</Label>
        <NativeSelect
          id="incident-category"
          v-model="category"
          class="w-full"
          :aria-invalid="Boolean(errors.category)"
        >
          <NativeSelectOption value="" disabled>Choose…</NativeSelectOption>
          <NativeSelectOption v-for="c in categories" :key="c" :value="c">{{
            c
          }}</NativeSelectOption>
        </NativeSelect>
        <span v-if="errors.category" role="alert" class="text-xs text-error-strong">{{
          errors.category
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="incident-description">What happened</Label>
        <Textarea
          id="incident-description"
          v-model="description"
          :rows="4"
          :aria-invalid="Boolean(errors.description)"
        />
        <span v-if="errors.description" role="alert" class="text-xs text-error-strong">{{
          errors.description
        }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="incident-action"
          >Action taken <span class="font-normal text-faint">(optional)</span></Label
        >
        <Textarea id="incident-action" v-model="action" :rows="2" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="incident-when"
          >When <span class="font-normal text-faint">(leave blank for now)</span></Label
        >
        <Input id="incident-when" v-model="occurredAt" type="datetime-local" />
        <span v-if="errors.occurredAt" role="alert" class="text-xs text-error-strong">{{
          errors.occurredAt
        }}</span>
      </div>
      <label class="flex items-start gap-2.5 text-[13px]">
        <Checkbox v-model="shareWithParent" class="mt-0.5" />
        <span class="flex flex-col">
          <span class="font-medium">Share with parents</span>
          <span class="text-xs text-muted-foreground"
            >They see it on the boarding page of the Parent Portal.</span
          >
        </span>
      </label>
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
      <Button type="submit" form="record-incident" :disabled="record.isPending.value">
        <Spinner v-if="record.isPending.value" />Record incident
      </Button>
    </template>
  </SideDrawer>
</template>
