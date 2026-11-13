<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { toTypedSchema } from '@vee-validate/yup';
import { useForm } from 'vee-validate';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import * as yup from 'yup';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import SegmentedControl from '@edutrack/app-kit/components/common/SegmentedControl.vue';
import FormInput from '@edutrack/app-kit/components/form/FormInput.vue';
import FormNumber from '@edutrack/app-kit/components/form/FormNumber.vue';
import FormSelect from '@edutrack/app-kit/components/form/FormSelect.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useSaveAccountMutation } from '@/api/services/finance';
import type { BankAccountRow } from '@/types';

import { todayIso } from '../finance-tones';

/** Add a bank or cash account, or edit one. A bank account can be the one parents pay into. */
const props = defineProps<{
  account: BankAccountRow | null;
  banks: string[];
  branches: { id: string; name: string }[];
}>();
const open = defineModel<boolean>('open', { required: true });

const save = useSaveAccountMutation();
const serverError = ref('');

const schema = toTypedSchema(
  yup.object({
    name: yup.string().trim().required('Name the account, e.g. Fees collection · Main Campus.'),
    kind: yup.mixed<'Bank' | 'Cash'>().oneOf(['Bank', 'Cash']).required().default('Bank'),
    bank: yup
      .string()
      .default('')
      .when('kind', ([kind], s) => (kind === 'Bank' ? s.required('Choose the bank.') : s)),
    accountNumber: yup
      .string()
      .trim()
      .default('')
      .when('kind', ([kind], s) =>
        kind === 'Bank'
          ? s
              .required('Enter the 10-digit account number.')
              .matches(/^\d{10}$/, 'NUBAN account numbers are 10 digits.')
          : s,
      ),
    accountName: yup
      .string()
      .trim()
      .default('')
      .when('kind', ([kind], s) =>
        kind === 'Bank' ? s.required('Enter the account name exactly as the bank shows it.') : s,
      ),
    branchId: yup.string().default(''),
    showToParents: yup.boolean().default(false),
    openingBalance: yup
      .number()
      .nullable()
      .default(0)
      .min(0, 'The opening balance can’t be negative.'),
    openingDate: yup.string().required('Enter the date of the opening balance.'),
  }),
);

const initial = () => ({
  name: props.account?.name ?? '',
  kind: props.account?.kind ?? ('Bank' as const),
  bank: props.account?.bank ?? '',
  accountNumber: props.account?.accountNumber ?? '',
  accountName: props.account?.accountName ?? '',
  branchId: props.account?.branchId ?? '',
  showToParents: props.account?.showToParents ?? false,
  openingBalance: 0,
  openingDate: todayIso(),
});

const { values, meta, handleSubmit, resetForm, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: initial(),
});
watch(open, (o) => {
  if (!o) return;
  resetForm({ values: initial() });
  serverError.value = '';
});
watch(
  () => values.kind,
  (k) => k === 'Cash' && setFieldValue('showToParents', false),
);

const kind = computed({
  get: () => values.kind ?? 'Bank',
  set: (v: 'Bank' | 'Cash') => setFieldValue('kind', v),
});
const branchOptions = computed(() => [
  { value: '', label: 'All branches' },
  ...props.branches.map((b) => ({ value: b.id, label: b.name })),
]);
const editing = computed(() => !!props.account);

const onSubmit = handleSubmit(async (v) => {
  serverError.value = '';
  try {
    await save.mutateAsync({
      id: props.account?.id,
      name: v.name,
      kind: v.kind,
      bank: v.kind === 'Bank' ? v.bank : '',
      accountNumber: v.kind === 'Bank' ? v.accountNumber : '',
      accountName: v.kind === 'Bank' ? v.accountName : '',
      branchId: v.branchId || null,
      showToParents: v.kind === 'Bank' && v.showToParents,
      openingBalance: v.openingBalance ?? 0,
      openingDate: v.openingDate,
    });
    open.value = false;
    toast.success(editing.value ? 'Account saved.' : `${v.name} added.`);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
});
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="account ? `Edit ${account.name}` : 'Add an account'"
    description="Where fees are paid in and expenses paid from. Balances come from the payments, expenses and transfers recorded against it."
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
      <FormInput
        name="name"
        label="Account name in EduTrack"
        required
        placeholder="e.g. Fees collection · Main Campus"
      />
      <div class="flex flex-col gap-1.5">
        <span class="text-[13px] font-medium">Type</span>
        <SegmentedControl
          v-model="kind"
          label="Account type"
          :options="[
            { value: 'Bank', label: 'Bank account' },
            { value: 'Cash', label: 'Cash (office or petty cash)' },
          ]"
        />
      </div>
      <template v-if="kind === 'Bank'">
        <FormSelect
          name="bank"
          label="Bank"
          required
          :options="[{ value: '', label: 'Choose a bank…' }, ...banks]"
        />
        <FormInput
          name="accountNumber"
          label="Account number"
          required
          inputmode="numeric"
          placeholder="10 digits, e.g. 0123456789"
          hint="NUBAN number"
        />
        <FormInput
          name="accountName"
          label="Account name"
          required
          placeholder="e.g. Greenfield Academy Ltd"
          hint="Exactly as the bank shows it; parents check it before they transfer."
        />
      </template>
      <FormSelect
        name="branchId"
        label="Branch"
        :options="branchOptions"
        hint="Parents at a branch see that branch’s account; otherwise the school-wide one."
      />
      <label v-if="kind === 'Bank'" class="flex items-start gap-3 rounded-md border px-3.5 py-3">
        <Switch
          :model-value="values.showToParents"
          class="mt-0.5"
          @update:model-value="setFieldValue('showToParents', !!$event)"
        />
        <span class="flex flex-col gap-0.5 text-[13px]">
          <span class="font-medium">Shown to parents</span>
          <span class="text-muted-foreground"
            >Printed on invoices and reminders with the student’s transfer reference. One account
            per branch can be shown; choosing this one replaces the other.</span
          >
        </span>
      </label>
      <div v-if="!editing" class="grid gap-4 sm:grid-cols-2">
        <FormNumber
          name="openingBalance"
          label="Opening balance"
          prefix="₦"
          placeholder="0"
          hint="What the account held on the date below."
        />
        <FormInput name="openingDate" label="As at" type="date" required placeholder="" />
      </div>
      <div class="flex justify-end gap-2 border-t border-divider pt-4">
        <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" :disabled="save.isPending.value"
          ><Spinner v-if="save.isPending.value" />{{
            editing ? 'Save account' : 'Add account'
          }}</Button
        >
      </div>
    </form>
  </SideDrawer>
</template>
