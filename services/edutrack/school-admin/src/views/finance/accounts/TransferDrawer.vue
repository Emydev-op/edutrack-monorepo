<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { toTypedSchema } from '@vee-validate/yup';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import { useTransferMutation } from '@/api/services/finance';
import type { BankAccountRow } from '@/types';

import { todayIso } from '../finance-tones';

/** Money moved between the school's own accounts: sweeps, cash banked, petty cash top-ups. */
const props = defineProps<{ accounts: BankAccountRow[]; fromId?: string }>();
const open = defineModel<boolean>('open', { required: true });

const transfer = useTransferMutation();
const serverError = ref('');

const schema = toTypedSchema(
  yup.object({
    fromId: yup.string().required('Choose the account the money left.'),
    toId: yup
      .string()
      .required('Choose the account it went into.')
      .notOneOf([yup.ref('fromId')], 'Choose two different accounts.'),
    amount: yup
      .number()
      .nullable()
      .required('Enter the amount moved.')
      .min(1, 'Enter the amount moved.'),
    date: yup.string().required('Enter the date.'),
    reference: yup.string().trim().default(''),
    note: yup.string().trim().default(''),
  }),
);
const initial = () => ({
  fromId: props.fromId ?? '',
  toId: '',
  amount: undefined as number | undefined,
  date: todayIso(),
  reference: '',
  note: '',
});
const { values, meta, handleSubmit, resetForm } = useForm({
  validationSchema: schema,
  initialValues: initial(),
});
watch(open, (o) => {
  if (!o) return;
  resetForm({ values: initial() });
  serverError.value = '';
});

const active = computed(() => props.accounts.filter((a) => a.status === 'Active'));
const options = computed(() => [
  { value: '', label: 'Choose an account…' },
  ...active.value.map((a) => ({ value: a.id, label: a.name })),
]);
const from = computed(() => active.value.find((a) => a.id === values.fromId));
const over = computed(() => !!from.value && (values.amount ?? 0) > from.value.balance);

const onSubmit = handleSubmit(async (v) => {
  serverError.value = '';
  try {
    const { no } = await transfer.mutateAsync({
      fromId: v.fromId,
      toId: v.toId,
      amount: v.amount!,
      date: v.date,
      reference: v.reference,
      note: v.note,
    });
    open.value = false;
    toast.success(`${formatNaira(v.amount!)} moved · ${no}`);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    title="Move money between accounts"
    description="Record a sweep to the operations account, cash banked, or a petty cash top-up. Both balances update."
    :dirty="meta.dirty"
  >
    <form class="flex flex-col gap-4.5" novalidate @submit.prevent="onSubmit">
      <InlineNotice
        v-if="serverError"
        tone="error"
        title="Something went wrong"
        :description="serverError"
        role="alert"
      />
      <FormSelect
        name="fromId"
        label="From"
        required
        :options="options"
        :hint="from ? `Balance ${formatNaira(from.balance)}` : undefined"
        :hint-tone="over ? 'warning' : 'muted'"
      />
      <FormSelect name="toId" label="To" required :options="options" />
      <div class="grid gap-4 sm:grid-cols-2">
        <FormNumber
          name="amount"
          label="Amount"
          required
          prefix="₦"
          placeholder="e.g. 5,000,000"
          :hint="over ? 'More than the account holds.' : undefined"
          hint-tone="warning"
        />
        <FormInput name="date" label="Date" type="date" required placeholder="" />
      </div>
      <FormInput
        name="reference"
        label="Bank reference"
        placeholder="e.g. NIP/2026/11/00412"
        hint="Optional; helps match the bank statement."
      />
      <FormInput name="note" label="Note" placeholder="e.g. Monthly sweep" />
      <div class="flex justify-end gap-2 border-t border-divider pt-4">
        <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" :disabled="transfer.isPending.value"
          ><Spinner v-if="transfer.isPending.value" />Record transfer</Button
        >
      </div>
    </form>
  </SideDrawer>
</template>
