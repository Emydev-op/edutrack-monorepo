<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useSavePlanMutation } from '@/api/services/finance';
import type { PaymentPlan } from '@/types';

import { fmtDay } from '../finance-tones';

const props = defineProps<{
  plan: PaymentPlan | null;
  plans: PaymentPlan[];
  /** Current term, to preview due dates. */
  term: { name: string; start: string; end: string } | null;
}>();
const open = defineModel<boolean>('open', { required: true });
const save = useSavePlanMutation();

const initial = () => ({
  name: props.plan?.name ?? '',
  parts: (props.plan?.split ?? [60, 40]).map((pct, i) => ({
    pct: String(pct),
    days: String(props.plan?.offsets[i] ?? (i === 0 ? 14 : 14 + i * 28)),
  })),
});
const form = reactive(initial());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  showErrors.value = false;
  serverError.value = '';
});

const total = computed(() => form.parts.reduce((n, p) => n + (Number(p.pct) || 0), 0));
const termDays = computed(() =>
  props.term
    ? Math.round(
        (new Date(props.term.end).getTime() - new Date(props.term.start).getTime()) / 86_400_000,
      )
    : null,
);
const addDays = (iso: string, d: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + d * 86_400_000).toISOString().slice(0, 10);

const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the plan.';
  else if (
    props.plans.some((p) => p.id !== props.plan?.id && p.name.toLowerCase() === name.toLowerCase())
  )
    e.name = 'A plan with that name already exists.';
  const pcts = form.parts.map((p) => Number(p.pct));
  const days = form.parts.map((p) => Number(p.days));
  if (pcts.some((n) => !Number.isInteger(n) || n <= 0))
    e.parts = 'Each part must be a whole percentage above 0.';
  else if (total.value !== 100) e.parts = `Parts add up to ${total.value}%. They must total 100.`;
  else if (days.some((n, i) => !Number.isInteger(n) || n < 0 || form.parts[i]!.days.trim() === ''))
    e.parts = 'Give a due day for each part.';
  else if (days.some((n, i) => i > 0 && n <= days[i - 1]!))
    e.parts = 'Each due day must be later than the one before.';
  else if (termDays.value !== null && days[days.length - 1]! > termDays.value)
    e.parts = `The last part falls after the term ends (${termDays.value} days).`;
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({
      id: props.plan?.id,
      name: form.name.trim(),
      split: form.parts.map((p) => Number(p.pct)),
      offsets: form.parts.map((p) => Number(p.days)),
    });
    open.value = false;
    toast.success(props.plan ? `${form.name.trim()} saved.` : `${form.name.trim()} added.`);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="plan ? `Edit ${plan.name}` : 'Add payment plan'"
    description="How a term’s fees are split into installments. Overdue reminders follow each installment’s due date."
    :dirty="dirty"
  >
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Something went wrong"
      :description="serverError"
      role="alert"
    />
    <FieldShell id="pl-name" label="Plan name" required :error="err('name')">
      <Input
        id="pl-name"
        v-model="form.name"
        placeholder="e.g. Three installments"
        :aria-invalid="!!err('name')"
      />
    </FieldShell>
    <fieldset class="flex flex-col gap-2 text-[13px]">
      <legend class="mb-1 font-medium">Installments</legend>
      <div
        class="grid grid-cols-[1fr_1fr_1.2fr_32px] items-center gap-2 text-xs text-muted-foreground"
      >
        <span>Share (%)</span><span>Due (days after term starts)</span
        ><span>Due date this term</span><span />
      </div>
      <div
        v-for="(p, i) in form.parts"
        :key="i"
        class="grid grid-cols-[1fr_1fr_1.2fr_32px] items-center gap-2"
      >
        <Input
          v-model="p.pct"
          inputmode="numeric"
          :aria-label="`Installment ${i + 1} share`"
          placeholder="e.g. 50"
        />
        <Input
          v-model="p.days"
          inputmode="numeric"
          :aria-label="`Installment ${i + 1} due day`"
          placeholder="e.g. 14"
        />
        <span class="tabular-nums text-muted-foreground">{{
          term && p.days.trim() !== '' && Number.isFinite(Number(p.days))
            ? fmtDay(addDays(term.start, Number(p.days)))
            : '—'
        }}</span>
        <Button
          variant="ghost"
          size="icon"
          :disabled="form.parts.length === 1"
          :aria-label="`Remove installment ${i + 1}`"
          @click="form.parts.splice(i, 1)"
          ><Trash2Icon class="size-4"
        /></Button>
      </div>
      <div class="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          :disabled="form.parts.length >= 6"
          @click="form.parts.push({ pct: '', days: '' })"
          ><PlusIcon class="size-4" /> Add installment</Button
        >
        <span
          :class="total === 100 ? 'text-success-strong' : 'text-error-strong'"
          class="text-xs font-medium tabular-nums"
          >Total {{ total }}%</span
        >
      </div>
      <p v-if="err('parts')" role="alert" class="text-xs text-destructive">{{ err('parts') }}</p>
      <p v-if="term" class="text-xs text-muted-foreground">
        Dates shown for {{ term.name }} (starts {{ fmtDay(term.start) }}).
      </p>
    </fieldset>
    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />{{ plan ? 'Save plan' : 'Add plan' }}</Button
      >
    </template>
  </SideDrawer>
</template>
