<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAddExpenseCategoryMutation,
  useFinanceOptionsQuery,
  useSaveExpenseMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useContextStore } from '@/stores/context';
import type { ExpenseDetail, PaymentMethod } from '@/types';

import { todayIso } from '../finance-tones';

/** New or edited expense. Drafts can be saved; submitting sends it for approval. */
const props = defineProps<{ expense?: ExpenseDetail | null; vendorId?: string | null }>();
const open = defineModel<boolean>('open', { required: true });

const router = useRouter();
const context = useContextStore();
const { data: options } = useFinanceOptionsQuery();
const save = useSaveExpenseMutation();
const addCategory = useAddExpenseCategoryMutation();

const METHODS: PaymentMethod[] = ['Bank transfer', 'Cash', 'Cheque', 'POS', 'Other'];

const blank = () => {
  const e = props.expense;
  const branchId =
    e?.branchId ??
    options.value?.branches.find((b) => b.name === context.current.branch)?.id ??
    options.value?.branches[0]?.id ??
    '';
  return {
    date: e?.date ?? todayIso(),
    category: e?.category ?? '',
    description: e?.description ?? '',
    amount: e ? String(e.amount) : '',
    vendorId: e?.vendorId ?? props.vendorId ?? '',
    branchId,
    method: (e?.method ?? 'Bank transfer') as PaymentMethod,
    notes: e?.notes ?? '',
    attachment: e?.attachment ?? null,
  };
};
const form = reactive(blank());
const initial = ref(JSON.stringify(form));
const showErrors = ref(false);
const serverError = ref('');
const newCategory = ref('');
const addingCategory = ref(false);

watch(open, (o) => {
  if (!o) return;
  Object.assign(form, blank());
  initial.value = JSON.stringify(form);
  showErrors.value = false;
  serverError.value = '';
  addingCategory.value = false;
});
const dirty = computed(() => JSON.stringify(form) !== initial.value);

const amount = computed(() => Number(form.amount.replace(/[,\s₦]/g, '')));
const limit = computed(() => options.value?.settings.expenseLimit ?? 250000);
const approvalHint = computed(() =>
  amount.value > limit.value
    ? `Above ${formatNaira(limit.value)}: needs the Principal after the Bursar.`
    : `Up to ${formatNaira(limit.value)}: the Bursar can approve.`,
);

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!form.date) e.date = 'Enter the date of the expense.';
  else if (form.date > todayIso()) e.date = 'The date can’t be in the future.';
  if (!form.category) e.category = 'Choose a category.';
  if (!form.description.trim()) e.description = 'Describe what the money is for.';
  if (!Number.isInteger(amount.value) || amount.value <= 0)
    e.amount = 'Enter the amount in whole naira.';
  if (!form.branchId) e.branchId = 'Choose the branch.';
  return e;
});
const err = (k: string) => (showErrors.value ? errors.value[k] : undefined);

function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const kb = Math.max(1, Math.round(file.size / 1024));
  form.attachment = {
    name: file.name,
    size: kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`,
  };
}

async function createCategory() {
  const name = newCategory.value.trim();
  if (!name) return;
  try {
    await addCategory.mutateAsync(name);
    form.category = name;
    newCategory.value = '';
    addingCategory.value = false;
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Couldn’t add the category.'));
  }
}

async function submit(send: boolean) {
  showErrors.value = true;
  if (Object.keys(errors.value).length) return;
  serverError.value = '';
  try {
    const saved = await save.mutateAsync({
      id: props.expense?.id,
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      vendorId: form.vendorId || null,
      branchId: form.branchId,
      amount: amount.value,
      method: form.method,
      notes: form.notes.trim(),
      attachment: form.attachment,
      submit: send,
    });
    initial.value = JSON.stringify(form);
    open.value = false;
    toast.success(
      send
        ? `${saved.no} submitted. Waiting for the ${saved.waitingOn ?? 'approver'}.`
        : 'Expense saved as draft.',
    );
    if (!props.expense)
      void router.push({ name: routesPath.finance.expenseDetail.name, params: { id: saved.id } });
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
    :title="
      expense ? `Edit ${expense.no === 'Draft' ? 'draft expense' : expense.no}` : 'New expense'
    "
    description="Save a draft, or submit it for approval. It’s paid once approved."
  >
    <InlineNotice
      v-if="serverError"
      tone="error"
      title="Couldn’t save the expense"
      :description="serverError"
      role="alert"
    />
    <InlineNotice
      v-if="expense?.rejectReason"
      tone="warning"
      title="Rejected"
      :description="expense.rejectReason"
    />
    <div class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="ex-date" label="Date" required :error="err('date')">
        <Input id="ex-date" v-model="form.date" type="date" :max="todayIso()" />
      </FieldShell>
      <FieldShell id="ex-branch" label="Branch" required :error="err('branchId')">
        <select id="ex-branch" v-model="form.branchId" :class="selectClass">
          <option v-for="b in options?.branches ?? []" :key="b.id" :value="b.id">
            {{ b.name }}
          </option>
        </select>
      </FieldShell>
    </div>
    <FieldShell id="ex-category" label="Category" required :error="err('category')">
      <div class="flex gap-2">
        <select id="ex-category" v-model="form.category" :class="selectClass">
          <option value="">Choose a category…</option>
          <option v-for="c in options?.expenseCategories ?? []" :key="c">{{ c }}</option>
        </select>
        <Button
          v-if="!addingCategory"
          type="button"
          variant="outline"
          size="sm"
          class="h-9 shrink-0"
          @click="addingCategory = true"
          >New</Button
        >
      </div>
    </FieldShell>
    <div v-if="addingCategory" class="flex gap-2">
      <Input
        v-model="newCategory"
        aria-label="New category name"
        placeholder="e.g. Library"
        @keydown.enter.prevent="createCategory"
      />
      <Button
        type="button"
        size="sm"
        class="h-9"
        :disabled="addCategory.isPending.value"
        @click="createCategory"
        >Add</Button
      >
      <Button type="button" variant="ghost" size="sm" class="h-9" @click="addingCategory = false"
        >Cancel</Button
      >
    </div>
    <FieldShell id="ex-desc" label="Description" required :error="err('description')">
      <Input
        id="ex-desc"
        v-model="form.description"
        placeholder="e.g. Generator servicing · Block C"
      />
    </FieldShell>
    <div class="grid gap-4 sm:grid-cols-2">
      <FieldShell id="ex-amount" label="Amount (₦)" required :error="err('amount')">
        <Input
          id="ex-amount"
          v-model="form.amount"
          inputmode="numeric"
          placeholder="185000"
          class="tabular-nums"
        />
      </FieldShell>
      <FieldShell id="ex-method" label="Payment method">
        <select id="ex-method" v-model="form.method" :class="selectClass">
          <option v-for="m in METHODS" :key="m">{{ m }}</option>
        </select>
      </FieldShell>
    </div>
    <p class="-mt-2 text-xs text-muted-foreground">{{ approvalHint }}</p>
    <FieldShell id="ex-vendor" label="Vendor">
      <select id="ex-vendor" v-model="form.vendorId" :class="selectClass">
        <option value="">No vendor</option>
        <option v-for="v in options?.vendors ?? []" :key="v.id" :value="v.id">
          {{ v.name }} · {{ v.category }}
        </option>
      </select>
    </FieldShell>
    <p class="-mt-2 text-xs text-muted-foreground">
      Not listed?
      <RouterLink
        :to="{ name: routesPath.finance.vendors.name, query: { new: '1' } }"
        class="text-primary hover:underline"
        >Add a vendor</RouterLink
      >
      first.
    </p>
    <FieldShell id="ex-file" label="Vendor invoice or receipt">
      <div v-if="form.attachment" class="flex items-center justify-between gap-2 text-[13px]">
        <span class="truncate">{{ form.attachment.name }} · {{ form.attachment.size }}</span>
        <button
          type="button"
          class="text-xs text-destructive hover:underline"
          @click="form.attachment = null"
        >
          Remove
        </button>
      </div>
      <input
        v-else
        id="ex-file"
        type="file"
        accept=".pdf,image/*"
        class="text-[13px]"
        @change="onFile"
      />
    </FieldShell>
    <FieldShell id="ex-notes" label="Notes">
      <Textarea id="ex-notes" v-model="form.notes" rows="3" placeholder="Optional" />
    </FieldShell>
    <template #footer>
      <Button variant="outline" :disabled="save.isPending.value" @click="submit(false)"
        >Save draft</Button
      >
      <Button :disabled="save.isPending.value" @click="submit(true)"
        ><Spinner v-if="save.isPending.value" /> Submit for approval</Button
      >
    </template>
  </SideDrawer>
</template>
