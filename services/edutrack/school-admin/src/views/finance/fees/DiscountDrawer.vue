<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Switch } from '@edutrack/ui/components/switch';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useSaveDiscountMutation } from '@/api/services/finance';
import type { Discount, DiscountPayload } from '@/types';

export type DiscountPreset = Partial<DiscountPayload>;

const props = defineProps<{
  discount: Discount | null;
  preset: DiscountPreset | null;
  discounts: Discount[];
}>();
const open = defineModel<boolean>('open', { required: true });
const save = useSaveDiscountMutation();

const initial = () => {
  const d = props.discount ?? props.preset ?? {};
  return {
    name: d.name ?? '',
    basis: d.basis ?? ('Custom' as DiscountPayload['basis']),
    kind: d.kind ?? ('Percentage' as DiscountPayload['kind']),
    value: d.value != null ? String(d.value) : '',
    appliesTo: d.appliesTo ?? ('Tuition only' as DiscountPayload['appliesTo']),
    fromChild: d.fromChild ?? 2,
    needsApproval: d.needsApproval ?? true,
    active: (d.status ?? 'Active') === 'Active',
  };
};
const form = reactive(initial());
const showErrors = ref(false);
const serverError = ref('');
watch(open, (o) => {
  if (!o) return;
  Object.assign(form, initial());
  showErrors.value = false;
  serverError.value = '';
});

const isSibling = computed(() => form.basis === 'Sibling');
const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the discount.';
  else if (
    props.discounts.some(
      (d) => d.id !== props.discount?.id && d.name.toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = 'A discount with that name already exists.';
  if (
    isSibling.value &&
    props.discounts.some(
      (d) => d.id !== props.discount?.id && d.basis === 'Sibling' && d.status === 'Active',
    )
  )
    e.basis = 'Only one sibling rule can apply. Edit the existing one.';
  const v = Number(form.value);
  if (!form.value.trim() || !Number.isFinite(v)) e.value = 'Enter a number.';
  else if (v <= 0) e.value = 'Above 0.';
  else if (form.kind === 'Percentage' && v > 100) e.value = '1–100%.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial()));
const summary = computed(() => {
  const v = Number(form.value) || 0;
  const amount = form.kind === 'Percentage' ? `${v}%` : `₦${v.toLocaleString('en-NG')}`;
  const base = form.appliesTo === 'Tuition only' ? 'tuition' : 'compulsory fees';
  return isSibling.value
    ? `${amount} off ${base} for the ${form.fromChild === 3 ? '3rd' : '2nd'} child onwards of the same fee payer, applied automatically when invoices are created.`
    : `${form.basis === 'Custom' ? 'Up to ' : ''}${amount} off ${base}, applied per invoice${form.needsApproval ? ' with the approver recorded' : ''}.`;
});

async function submit() {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    await save.mutateAsync({
      id: props.discount?.id,
      name: form.name.trim(),
      basis: form.basis,
      kind: form.kind,
      value: Math.round(Number(form.value)),
      appliesTo: form.appliesTo,
      fromChild: form.fromChild,
      needsApproval: isSibling.value ? false : form.needsApproval,
      status: form.active ? 'Active' : 'Inactive',
    });
    open.value = false;
    toast.success(
      props.discount
        ? `${form.name.trim()} saved. It applies to invoices created from now on.`
        : `${form.name.trim()} added.`,
    );
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="discount ? `Edit ${discount.name}` : 'Add discount'"
    description="Sibling discounts apply automatically. Others are applied per invoice, with an approver recorded."
    :dirty="dirty"
  >
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Something went wrong"
      :description="serverError"
      role="alert"
    />
    <FieldShell id="dc-name" label="Name" required :error="err('name')">
      <Input
        id="dc-name"
        v-model="form.name"
        placeholder="e.g. Sibling discount"
        :aria-invalid="!!err('name')"
      />
    </FieldShell>
    <FieldShell id="dc-basis" label="What it’s for" :error="err('basis')">
      <select
        id="dc-basis"
        v-model="form.basis"
        class="h-9 rounded-md border bg-card px-2.5 text-sm"
      >
        <option value="Sibling">Sibling (automatic)</option>
        <option value="Staff child">Staff child</option>
        <option value="Scholarship">Scholarship</option>
        <option value="Custom">Special concession (custom amount)</option>
      </select>
    </FieldShell>
    <div class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="dc-kind" label="Type">
        <select
          id="dc-kind"
          v-model="form.kind"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option>Percentage</option>
          <option>Fixed amount</option>
        </select>
      </FieldShell>
      <FieldShell
        id="dc-value"
        :label="form.kind === 'Percentage' ? 'Value (%)' : 'Value (₦)'"
        required
        :error="err('value')"
        :hint="form.basis === 'Custom' ? 'The most it can be; set per invoice' : undefined"
      >
        <Input
          id="dc-value"
          v-model="form.value"
          inputmode="numeric"
          placeholder="e.g. 10"
          :aria-invalid="!!err('value')"
        />
      </FieldShell>
    </div>
    <FieldShell id="dc-applies" label="Applies to">
      <select
        id="dc-applies"
        v-model="form.appliesTo"
        class="h-9 rounded-md border bg-card px-2.5 text-sm"
      >
        <option>Tuition only</option>
        <option>All compulsory items</option>
      </select>
    </FieldShell>
    <FieldShell
      v-if="isSibling"
      id="dc-child"
      label="Who gets it"
      hint="Children are ordered eldest first (highest class) within each fee-paying guardian."
    >
      <select
        id="dc-child"
        v-model.number="form.fromChild"
        class="h-9 rounded-md border bg-card px-2.5 text-sm"
      >
        <option :value="2">2nd child onwards</option>
        <option :value="3">3rd child onwards</option>
      </select>
    </FieldShell>
    <label v-else class="flex items-start gap-2.5 text-[13px]">
      <Switch v-model="form.needsApproval" />
      <span class="flex flex-col">
        <span class="font-medium">Needs approval</span>
        <span class="text-xs text-muted-foreground">Records who approved it on each invoice.</span>
      </span>
    </label>
    <label class="flex items-center gap-2.5 text-[13px]">
      <Switch v-model="form.active" />
      Active
    </label>
    <p class="rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">{{ summary }}</p>
    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />{{
          discount ? 'Save discount' : 'Add discount'
        }}</Button
      >
    </template>
  </SideDrawer>
</template>
