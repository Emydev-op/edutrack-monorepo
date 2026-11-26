<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@edutrack/ui/components/dialog';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage, messageOf } from '@edutrack/web-core/http';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import ChoiceCards, { type Choice } from '@edutrack/app-kit/components/form/ChoiceCards.vue';

import { getRequest } from '@/api/helpers';
import { queryKeys } from '@/api/query-keys';
import { usePickupsQuery, useSignOutMutation } from '@/api/services/boarding-house';
import type { Exeat, StudentDetail } from '@/types';

/**
 * The gate hands a boarder over: choose who is collecting them and check their phone and note
 * before signing out. For a term break any parent or approved pickup person may collect.
 */
const props = defineProps<{ exeat: Exeat | null }>();
const open = defineModel<boolean>('open', { required: true });

const signOut = useSignOutMutation();
const studentId = computed(() => (open.value ? (props.exeat?.student.id ?? '') : ''));
const termBreak = computed(() => props.exeat?.kind === 'Term break');

const { data: pickups, isPending: pickupsPending } = usePickupsQuery(studentId);
// Parents' phone numbers, to check against whoever is at the gate.
const { data: student } = useQuery({
  queryKey: computed(() => queryKeys.students.detail(studentId.value)),
  queryFn: () => getRequest<StudentDetail>(`/v1/students/${studentId.value}`),
  enabled: computed(() => !!studentId.value),
  retry: false,
});

const choices = computed<Choice[]>(() => {
  const e = props.exeat;
  if (!e) return [];
  const phoneOf = (key: string) => {
    const [kind, id] = key.split(':');
    if (kind === 'pickup') {
      const p = pickups.value?.find((x) => x.id === id);
      if (p) return { phone: p.phone, note: p.note };
      const chosen = e.pickup;
      if (chosen && chosen.pickupPersonId === id) return { phone: chosen.phone, note: chosen.note };
    }
    if (kind === 'guardian') {
      const g = student.value?.guardians.find((x) => x.guardianId === id);
      if (g) return { phone: g.phone, note: null };
    }
    return { phone: '', note: null };
  };
  const list = e.collectors.map((c) => ({
    key: c.key,
    name: c.name,
    relationship: c.relationship,
  }));
  if (termBreak.value) {
    for (const p of pickups.value ?? [])
      list.push({ key: `pickup:${p.id}`, name: p.name, relationship: p.relationship });
    for (const g of student.value?.guardians ?? [])
      list.push({ key: `guardian:${g.guardianId}`, name: g.name, relationship: g.relationship });
  }
  return list
    .filter((c, i) => list.findIndex((x) => x.key === c.key) === i)
    .map((c) => {
      const { phone, note } = phoneOf(c.key);
      return {
        value: c.key,
        label: c.name,
        description: [c.relationship, phone].filter(Boolean).join(' · '),
        detail: note ?? undefined,
      };
    });
});

const collector = ref('');
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  collector.value = '';
  serverError.value = '';
});
// Only one person allowed: pick them.
watch(choices, (list) => {
  if (!collector.value && list.length === 1) collector.value = list[0]!.value;
});

async function submit() {
  const e = props.exeat;
  if (!e || !collector.value) {
    serverError.value = 'Choose who is collecting the boarder.';
    return;
  }
  serverError.value = '';
  try {
    const r = await signOut.mutateAsync({ id: e.id, collector: collector.value });
    const who = choices.value.find((c) => c.value === collector.value)?.label;
    toast.success(messageOf(r, `${e.student.name} signed out${who ? ` to ${who}` : ''}.`));
    open.value = false;
  } catch (err) {
    serverError.value = getApiErrorMessage(err, 'Not signed out. Try again.');
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[90vh] flex-col gap-4 sm:max-w-[460px]">
      <div class="flex flex-col gap-1">
        <DialogTitle class="text-[17px] font-semibold">
          Sign out {{ exeat?.student.name ?? 'boarder' }}
        </DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground">
          {{ exeat?.kind }} · back by {{ exeat?.returns }}. Check the person’s face and phone number
          before you hand the boarder over.
        </DialogDescription>
      </div>

      <form class="flex min-h-0 flex-col gap-4 overflow-y-auto" novalidate @submit.prevent="submit">
        <InlineNotice
          v-if="serverError"
          tone="error"
          title="Not signed out"
          :description="serverError"
          role="alert"
        />
        <Skeleton v-if="pickupsPending && !choices.length" class="h-24" />
        <InlineNotice
          v-else-if="!choices.length"
          tone="warning"
          title="Nobody is approved to collect"
          description="Add a pickup person on the boarder’s record, or ask the office."
        />
        <ChoiceCards v-else v-model="collector" :choices="choices" label="Who is collecting" />

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="signOut.isPending.value || !collector"
            ><Spinner v-if="signOut.isPending.value" />Sign out</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
