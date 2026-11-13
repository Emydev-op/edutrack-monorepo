<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import {
  useFinanceOptionsQuery,
  useFinanceSettingsQuery,
  useSaveFinanceSettingsMutation,
} from '@/api/services/finance';
import type { FinanceSettings, PaymentMethod } from '@/types';

import { fmtDay } from '../finance-tones';

const { data, isPending, isError } = useFinanceSettingsQuery();
const { data: options } = useFinanceOptionsQuery();
const save = useSaveFinanceSettingsMutation();

const toForm = (s: FinanceSettings) => ({
  dueDates: Object.fromEntries(s.dueDates.map((d) => [d.termId, d.due])),
  allowPartial: s.allowPartial,
  autoSibling: s.autoSibling,
  verifyTransfers: s.verifyTransfers,
  lateKind: s.lateFee.kind,
  lateValue: s.lateFee.value ? String(s.lateFee.value) : '',
  methods: [...s.methods] as PaymentMethod[],
  invoicePrefix: s.invoicePrefix,
  receiptPrefix: s.receiptPrefix,
  transferReference: s.transferReference,
  expenseLimit: String(s.expenseLimit),
  refundLimit: String(s.refundLimit),
});
type Form = ReturnType<typeof toForm>;
const form = reactive({} as Form);
const original = ref('');
watch(
  data,
  (s) => {
    if (!s) return;
    Object.assign(form, toForm(s));
    original.value = JSON.stringify(toForm(s));
  },
  { immediate: true },
);
const dirty = computed(() => !!data.value && JSON.stringify(form) !== original.value);
useUnsavedChanges(dirty);

const showErrors = ref(false);
const serverError = ref('');
const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!data.value) return e;
  for (const d of data.value.dueDates) {
    const v = form.dueDates[d.termId];
    if (!v) e[`due-${d.termId}`] = 'Choose a due date.';
    else if (v > d.end) e[`due-${d.termId}`] = `Must be on or before ${fmtDay(d.end)}.`;
  }
  if (form.lateKind !== 'None') {
    const v = Number(form.lateValue);
    if (!form.lateValue.trim() || !Number.isFinite(v) || v <= 0) e.late = 'Enter the late fee.';
    else if (form.lateKind === 'Percentage' && (v < 1 || v > 50)) e.late = '1–50% of the balance.';
  }
  if (!form.methods.length) e.methods = 'Pick at least one payment method.';
  if (!/^[A-Z]{2,5}$/.test(form.invoicePrefix)) e.invoicePrefix = '2–5 capital letters.';
  if (!/^[A-Z]{2,5}$/.test(form.receiptPrefix)) e.receiptPrefix = '2–5 capital letters.';
  else if (form.receiptPrefix === form.invoicePrefix)
    e.receiptPrefix = 'Must differ from the invoice prefix.';
  for (const k of ['expenseLimit', 'refundLimit'] as const)
    if (!/^\d+$/.test(form[k]) || Number(form[k]) <= 0) e[k] = 'Enter an amount in naira.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

function toggleMethod(m: PaymentMethod, on: boolean) {
  form.methods = on ? [...form.methods, m] : form.methods.filter((x) => x !== m);
}

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const s = await save.mutateAsync({
      dueDates: form.dueDates,
      allowPartial: form.allowPartial,
      autoSibling: form.autoSibling,
      verifyTransfers: form.verifyTransfers,
      lateFee: {
        kind: form.lateKind,
        value: form.lateKind === 'None' ? 0 : Number(form.lateValue),
      },
      methods: form.methods,
      invoicePrefix: form.invoicePrefix,
      receiptPrefix: form.receiptPrefix,
      transferReference: form.transferReference,
      expenseLimit: Number(form.expenseLimit),
      refundLimit: Number(form.refundLimit),
    });
    original.value = JSON.stringify(toForm(s));
    Object.assign(form, toForm(s));
    showErrors.value = false;
    toast.success('Billing settings saved.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

const TOGGLES: {
  key: 'allowPartial' | 'autoSibling' | 'verifyTransfers';
  label: string;
  hint: string;
}[] = [
  {
    key: 'allowPartial',
    label: 'Allow part payments',
    hint: 'Parents can pay any amount up to the balance.',
  },
  {
    key: 'autoSibling',
    label: 'Apply the sibling discount automatically',
    hint: 'Added to invoices for the 2nd and later child of the same fee payer. Finance can remove it per invoice.',
  },
  {
    key: 'verifyTransfers',
    label: 'Verify bank transfers before confirming',
    hint: 'Transfers stay Pending verification until matched on the bank statement. Balances only change once confirmed.',
  },
];
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-40 w-full" /><Skeleton class="h-40 w-full" />
  </div>
  <InlineNotice
    v-else-if="isError || !data"
    tone="error"
    title="Settings couldn’t load"
    description="Try again in a moment."
  />
  <form v-else class="flex max-w-3xl flex-col gap-4" @submit.prevent="submit">
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Settings weren’t saved"
      :description="serverError"
      role="alert"
    />

    <SectionCard
      title="Due dates"
      description="When each term’s invoice must be paid. Overdue reminders start the day after."
    >
      <p v-if="!data.dueDates.length" class="text-[13px] text-muted-foreground">
        Create an academic session to set due dates.
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell
          v-for="d in data.dueDates"
          :id="`due-${d.termId}`"
          :key="d.termId"
          :label="`${d.term} · ${d.session}`"
          :hint="`Term: ${fmtDay(d.start)} – ${fmtDay(d.end)}`"
          :error="err(`due-${d.termId}`)"
        >
          <Input :id="`due-${d.termId}`" v-model="form.dueDates[d.termId]" type="date" />
        </FieldShell>
      </div>
      <p class="mt-3 text-xs text-muted-foreground">
        Families on an installment plan follow the plan’s dates instead.
      </p>
    </SectionCard>

    <SectionCard title="Payments">
      <div class="flex flex-col gap-3.5">
        <label v-for="t in TOGGLES" :key="t.key" class="flex items-start gap-2.5 text-[13px]">
          <Switch v-model="form[t.key]" />
          <span class="flex flex-col">
            <span class="font-medium">{{ t.label }}</span>
            <span class="text-xs text-muted-foreground">{{ t.hint }}</span>
          </span>
        </label>
        <FieldShell
          id="methods"
          label="Accepted payment methods"
          hint="Shown on invoices. EduTrack doesn’t collect money; the school records or verifies each payment."
          :error="err('methods')"
        >
          <div class="flex flex-wrap gap-2">
            <label
              v-for="m in options?.allMethods ?? []"
              :key="m"
              class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-normal"
            >
              <Checkbox
                :model-value="form.methods.includes(m)"
                @update:model-value="(v) => toggleMethod(m, v === true)"
              />
              {{ m }}
            </label>
          </div>
        </FieldShell>
        <FieldShell
          id="transfer-ref"
          label="Transfer reference parents use"
          hint="Shown with the bank details so the school can match each transfer."
        >
          <select
            id="transfer-ref"
            v-model="form.transferReference"
            class="h-9 max-w-xs rounded-md border bg-card px-2.5 text-sm"
          >
            <option>Admission number</option>
            <option>Invoice number</option>
          </select>
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard title="Late payment">
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell id="late-kind" label="Late fee">
          <select
            id="late-kind"
            v-model="form.lateKind"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option>None</option>
            <option>Fixed amount</option>
            <option>Percentage</option>
          </select>
        </FieldShell>
        <FieldShell
          v-if="form.lateKind !== 'None'"
          id="late-value"
          :label="form.lateKind === 'Percentage' ? 'Percent of balance' : 'Amount (₦)'"
          required
          hint="Added once to an overdue invoice when you apply late fees from Invoices."
          :error="err('late')"
        >
          <Input
            id="late-value"
            v-model="form.lateValue"
            inputmode="numeric"
            placeholder="e.g. 5000"
          />
        </FieldShell>
      </div>
    </SectionCard>

    <SectionCard title="Numbering and approvals">
      <div class="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id="inv-prefix"
          label="Invoice prefix"
          :hint="`e.g. ${form.invoicePrefix}-2026-0001`"
          :error="err('invoicePrefix')"
        >
          <Input
            id="inv-prefix"
            v-model="form.invoicePrefix"
            maxlength="5"
            @input="form.invoicePrefix = form.invoicePrefix.toUpperCase()"
          />
        </FieldShell>
        <FieldShell
          id="rcp-prefix"
          label="Receipt prefix"
          :hint="`e.g. ${form.receiptPrefix}-2026-0001`"
          :error="err('receiptPrefix')"
        >
          <Input
            id="rcp-prefix"
            v-model="form.receiptPrefix"
            maxlength="5"
            @input="form.receiptPrefix = form.receiptPrefix.toUpperCase()"
          />
        </FieldShell>
        <FieldShell
          id="exp-limit"
          label="Bursar can approve expenses up to (₦)"
          hint="Above this, the Principal approves after the Bursar."
          :error="err('expenseLimit')"
        >
          <Input id="exp-limit" v-model="form.expenseLimit" inputmode="numeric" />
        </FieldShell>
        <FieldShell
          id="rfd-limit"
          label="Principal can approve refunds up to (₦)"
          hint="Above this, the Proprietor approves."
          :error="err('refundLimit')"
        >
          <Input id="rfd-limit" v-model="form.refundLimit" inputmode="numeric" />
        </FieldShell>
      </div>
      <p class="mt-3 text-xs text-muted-foreground">
        New prefixes apply to invoices and receipts created from now on.
      </p>
    </SectionCard>

    <div class="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        :disabled="!dirty"
        @click="Object.assign(form, JSON.parse(original))"
        >Discard changes</Button
      >
      <Button type="submit" :disabled="!dirty || save.isPending.value"
        ><Spinner v-if="save.isPending.value" />Save settings</Button
      >
    </div>
  </form>
</template>
