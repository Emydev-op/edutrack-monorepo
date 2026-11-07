<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useFinanceOptionsQuery, useSaveVendorMutation } from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import type { VendorDetail } from '@/types';

const props = defineProps<{ vendor?: VendorDetail | null; categories?: string[] }>();
const open = defineModel<boolean>('open', { required: true });

const router = useRouter();
const { data: options } = useFinanceOptionsQuery();
const save = useSaveVendorMutation();

const blank = () => ({
  name: props.vendor?.name ?? '',
  category: props.vendor?.category ?? '',
  contactName: props.vendor?.contactName ?? '',
  phone: props.vendor?.phone ?? '',
  email: props.vendor?.email ?? '',
  address: props.vendor?.address ?? '',
  bank: props.vendor?.bank ?? '',
  accountNumber: props.vendor?.accountNumber ?? '',
  accountName: props.vendor?.accountName ?? '',
  notes: props.vendor?.notes ?? '',
});
const form = reactive(blank());
const initial = ref(JSON.stringify(form));
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  initial.value = JSON.stringify(form);
  showErrors.value = false;
  serverError.value = '';
});
const dirty = computed(() => JSON.stringify(form) !== initial.value);

const categories = computed(() =>
  [
    ...new Set([
      ...(props.categories ?? []),
      ...(options.value?.expenseCategories ?? []),
      'Uniforms',
    ]),
  ].sort(),
);
const hasAccount = computed(() => !!form.bank && form.bank !== 'Direct debit');
const bankChanged = computed(
  () =>
    !!props.vendor &&
    (form.bank !== props.vendor.bank || form.accountNumber !== props.vendor.accountNumber),
);

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.name.trim()) e.name = 'Enter the vendor’s name.';
  if (!form.category.trim()) e.category = 'Say what they supply.';
  if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
    e.email = 'Enter a valid email address.';
  if (hasAccount.value) {
    if (!/^\d{10}$/.test(form.accountNumber.replace(/\s/g, '')))
      e.accountNumber = 'NUBAN account numbers are 10 digits.';
    if (!form.accountName.trim()) e.accountName = 'Enter the account name.';
  }
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const v = await save.mutateAsync({
      id: props.vendor?.id,
      ...form,
      accountNumber: hasAccount.value ? form.accountNumber.replace(/\s/g, '') : '',
      accountName: hasAccount.value ? form.accountName.trim() : '',
    });
    initial.value = JSON.stringify(form);
    open.value = false;
    toast.success(props.vendor ? 'Vendor updated.' : `${v.name} added.`);
    if (!props.vendor)
      void router.push({ name: routesPath.finance.vendorDetail.name, params: { id: v.id } });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}

const selectClass = 'h-9 w-full rounded-md border bg-card px-2.5 text-sm';
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :dirty="dirty"
    :title="vendor ? `Edit ${vendor.name}` : 'Add vendor'"
    description="Suppliers and service providers the school pays."
  >
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Couldn’t save the vendor"
      :description="serverError"
      role="alert"
    />
    <FieldShell id="vd-name" label="Name" required :error="err('name')">
      <Input id="vd-name" v-model="form.name" placeholder="e.g. Lekki Stationers Ltd" />
    </FieldShell>
    <FieldShell id="vd-cat" label="Supplies" required :error="err('category')">
      <Input id="vd-cat" v-model="form.category" list="vd-cat-list" placeholder="e.g. Stationery" />
      <datalist id="vd-cat-list">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </FieldShell>
    <div class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="vd-contact" label="Contact person">
        <Input id="vd-contact" v-model="form.contactName" placeholder="e.g. Mr. Ade Bello" />
      </FieldShell>
      <FieldShell id="vd-phone" label="Phone">
        <Input id="vd-phone" v-model="form.phone" type="tel" placeholder="0803 555 0321" />
      </FieldShell>
    </div>
    <FieldShell id="vd-email" label="Email" :error="err('email')">
      <Input id="vd-email" v-model="form.email" type="email" placeholder="accounts@vendor.ng" />
    </FieldShell>
    <FieldShell id="vd-address" label="Address">
      <Input id="vd-address" v-model="form.address" placeholder="Optional" />
    </FieldShell>
    <FieldShell id="vd-bank" label="Bank">
      <select id="vd-bank" v-model="form.bank" :class="selectClass">
        <option value="">Not set</option>
        <option value="Direct debit">Direct debit (no transfers)</option>
        <option v-for="b in options?.banks ?? []" :key="b">{{ b }}</option>
      </select>
    </FieldShell>
    <div v-if="hasAccount" class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="vd-acno" label="Account number" required :error="err('accountNumber')">
        <Input
          id="vd-acno"
          v-model="form.accountNumber"
          inputmode="numeric"
          maxlength="10"
          placeholder="0123456789"
          class="tabular-nums"
        />
      </FieldShell>
      <FieldShell id="vd-acname" label="Account name" required :error="err('accountName')">
        <Input id="vd-acname" v-model="form.accountName" placeholder="As the bank shows it" />
      </FieldShell>
    </div>
    <InlineNotice
      v-if="bankChanged"
      tone="warning"
      title="Bank details are changing"
      description="The change is recorded in the vendor’s history. Confirm new details with the vendor by phone before paying into them."
    />
    <FieldShell id="vd-notes" label="Notes">
      <Textarea id="vd-notes" v-model="form.notes" rows="3" placeholder="Optional" />
    </FieldShell>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />
        {{ vendor ? 'Save changes' : 'Add vendor' }}</Button
      >
    </template>
  </SideDrawer>
</template>
