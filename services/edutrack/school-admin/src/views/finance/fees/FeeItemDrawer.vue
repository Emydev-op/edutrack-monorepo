<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';

import { useSaveFeeItemMutation } from '@/api/services/finance';
import type { FeeCategory, FeeCharged, FeeItem, FeeType } from '@/types';

const CATEGORIES: FeeCategory[] = [
  'Tuition',
  'Levy',
  'Exams',
  'ICT',
  'Books',
  'Uniform',
  'Transport',
  'Feeding',
  'Boarding',
  'Activities',
  'Admission',
  'Other',
];
const CHARGED: { value: FeeCharged; hint: string }[] = [
  { value: 'Every term', hint: 'On every term’s invoice' },
  { value: 'Once a session', hint: 'First term only' },
  { value: 'New students only', hint: 'A new student’s first invoice' },
];

const props = defineProps<{ item: FeeItem | null; items: FeeItem[] }>();
const open = defineModel<boolean>('open', { required: true });
const save = useSaveFeeItemMutation();

const initial = () => ({
  name: props.item?.name ?? '',
  category: props.item?.category ?? ('Other' as FeeCategory),
  charged: props.item?.charged ?? ('Every term' as FeeCharged),
  type: props.item?.type ?? ('Compulsory' as FeeType),
  description: props.item?.description ?? '',
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

const errors = computed(() => {
  const e: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) e.name = 'Name the fee.';
  else if (
    props.items.some((i) => i.id !== props.item?.id && i.name.toLowerCase() === name.toLowerCase())
  )
    e.name = `${name} already exists.`;
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
      id: props.item?.id,
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
    });
    open.value = false;
    toast.success(
      props.item
        ? `${form.name.trim()} saved.`
        : `${form.name.trim()} added. Enter its amounts in the fee structure.`,
    );
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'That didn’t save. Try again.');
  }
}
</script>

<template>
  <SideDrawer
    v-model:open="open"
    :title="item ? `Edit ${item.name}` : 'Add fee item'"
    description="Compulsory items go on every invoice; optional ones are added per student."
    :dirty="dirty"
  >
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Something went wrong"
      :description="serverError"
      role="alert"
    />
    <InlineNotice
      v-if="item?.invoiceLines"
      tone="info"
      title="Already on invoices"
      :description="`${item.invoiceLines.toLocaleString('en-NG')} invoice lines carry this item. Changes apply to invoices you create from now on.`"
    />
    <FieldShell id="fi-name" label="Name" required :error="err('name')">
      <Input
        id="fi-name"
        v-model="form.name"
        placeholder="e.g. ICT fee"
        :aria-invalid="!!err('name')"
      />
    </FieldShell>
    <div class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="fi-cat" label="Category">
        <select
          id="fi-cat"
          v-model="form.category"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option v-for="c in CATEGORIES" :key="c">{{ c }}</option>
        </select>
      </FieldShell>
      <FieldShell id="fi-type" label="Type">
        <select
          id="fi-type"
          v-model="form.type"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option>Compulsory</option>
          <option>Optional</option>
        </select>
      </FieldShell>
    </div>
    <FieldShell
      id="fi-charged"
      label="Charged"
      :hint="CHARGED.find((c) => c.value === form.charged)?.hint"
    >
      <select
        id="fi-charged"
        v-model="form.charged"
        class="h-9 rounded-md border bg-card px-2.5 text-sm"
      >
        <option v-for="c in CHARGED" :key="c.value">{{ c.value }}</option>
      </select>
    </FieldShell>
    <FieldShell id="fi-desc" label="Description" hint="Optional. Shown to finance staff only.">
      <Textarea
        id="fi-desc"
        v-model="form.description"
        rows="3"
        placeholder="e.g. Computer lab and internet"
      />
    </FieldShell>
    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button :disabled="save.isPending.value" @click="submit"
        ><Spinner v-if="save.isPending.value" />{{ item ? 'Save item' : 'Add item' }}</Button
      >
    </template>
  </SideDrawer>
</template>
