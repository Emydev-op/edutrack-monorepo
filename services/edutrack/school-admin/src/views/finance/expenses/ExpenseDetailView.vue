<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Spinner } from '@edutrack/ui/components/spinner';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { Check, Clock, Minus, X } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useApproveExpenseMutation,
  useExpenseQuery,
  useFinanceOptionsQuery,
  usePayExpenseMutation,
  useRejectExpenseMutation,
  useSubmitExpenseMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';

import { fmtDay, todayIso } from '../finance-tones';
import ExpenseDrawer from './ExpenseDrawer.vue';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: e, isPending, error } = useExpenseQuery(id);
const { data: options } = useFinanceOptionsQuery();
const confirm = useConfirm();
const submit = useSubmitExpenseMutation();
const approve = useApproveExpenseMutation();
const reject = useRejectExpenseMutation();
const pay = usePayExpenseMutation();

const editOpen = ref(false);
const payOpen = ref(false);
const payForm = reactive({ accountId: '', date: todayIso(), reference: '' });
const payError = ref('');

const accounts = computed(() =>
  (options.value?.accounts ?? []).filter((a) => a.status === 'Active'),
);
const payAccount = computed(() => accounts.value.find((a) => a.id === payForm.accountId));

const details = computed(() => {
  const x = e.value;
  if (!x) return [];
  return [
    { label: 'Date', value: fmtDay(x.date) },
    { label: 'Category', value: x.category },
    { label: 'Branch', value: x.branch },
    { label: 'Amount', value: formatNaira(x.amount), emphasis: 'strong' as const },
    { label: 'Payment method', value: x.method },
    { label: 'Submitted by', value: x.submittedBy },
    { label: 'Notes', value: x.notes },
  ];
});

const STEP_ICON = { Done: Check, Waiting: Clock, 'Not needed': Minus, Rejected: X } as const;
const STEP_CLASS = {
  Done: 'bg-success text-white',
  Waiting: 'bg-primary text-primary-foreground',
  'Not needed': 'border bg-card text-faint',
  Rejected: 'bg-destructive text-white',
} as const;

async function doSubmit() {
  try {
    const r = await submit.mutateAsync(id.value);
    toast.success(`${r.no} submitted. Waiting for the ${r.waitingOn ?? 'approver'}.`);
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Couldn’t submit. Try again.'));
  }
}

function doApprove() {
  const x = e.value!;
  void confirm({
    title: `Approve ${x.no}?`,
    description: `Record your approval as ${x.waitingOn}.`,
    details: [
      ['Expense', x.description],
      ['Amount', formatNaira(x.amount)],
      ['Vendor', x.vendor ?? '—'],
    ],
    confirmLabel: 'Approve',
    action: async () => {
      const r = await approve.mutateAsync(id.value);
      toast.success(
        r.status === 'Approved'
          ? `${r.no} approved. It can now be paid.`
          : `Approved. Now waiting for the ${r.waitingOn}.`,
      );
    },
  });
}

function doReject() {
  const x = e.value!;
  void confirm({
    title: `Reject ${x.no}?`,
    description: 'It goes back to the requester to fix and resubmit.',
    input: { label: 'Reason', placeholder: 'e.g. Quote is higher than agreed', required: true },
    confirmLabel: 'Reject',
    tone: 'destructive',
    action: async ({ text }) => {
      await reject.mutateAsync({ id: id.value, reason: text });
      toast.success(`${x.no} rejected.`);
    },
  });
}

function openPay() {
  payForm.accountId =
    accounts.value.find((a) => (e.value?.method === 'Cash' ? a.kind === 'Cash' : a.kind === 'Bank'))
      ?.id ?? '';
  payForm.date = todayIso();
  payForm.reference = '';
  payError.value = '';
  payOpen.value = true;
}

async function doPay() {
  payError.value = '';
  if (!payForm.accountId) return void (payError.value = 'Choose the account it was paid from.');
  if (payAccount.value?.kind === 'Bank' && !payForm.reference.trim())
    return void (payError.value = 'Enter the transfer or cheque reference.');
  try {
    await pay.mutateAsync({ id: id.value, ...payForm, reference: payForm.reference.trim() });
    payOpen.value = false;
    toast.success(`${e.value?.no} marked as paid.`);
  } catch (err) {
    payError.value = getApiErrorMessage(err, 'Couldn’t record the payment.');
  }
}
</script>

<template>
  <EmptyState
    v-if="error"
    title="Expense not found"
    description="It may have been removed, or the link is wrong."
  >
    <Button as-child variant="outline"
      ><RouterLink :to="{ name: routesPath.finance.expenses.name }"
        >Back to expenses</RouterLink
      ></Button
    >
  </EmptyState>
  <p v-else-if="isPending || !e" class="text-sm text-muted-foreground">Loading…</p>
  <template v-else>
    <PageHeader
      :title="e.description"
      :description="`${e.no} · ${e.category} · ${fmtDay(e.date)}`"
      :status="e.status"
    >
      <template #actions>
        <template v-if="e.status === 'Draft'">
          <Button variant="outline" @click="editOpen = true">Edit</Button>
          <Button :disabled="submit.isPending.value" @click="doSubmit">Submit for approval</Button>
        </template>
        <Button v-else-if="e.status === 'Rejected'" @click="editOpen = true"
          >Edit and resubmit</Button
        >
        <template v-else-if="e.status === 'Submitted'">
          <Button variant="outline" @click="doReject">Reject</Button>
          <Button @click="doApprove">Approve as {{ e.waitingOn }}</Button>
        </template>
        <template v-else-if="e.status === 'Approved'">
          <Button variant="outline" @click="doReject">Reject</Button>
          <Button @click="openPay">Mark as paid</Button>
        </template>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="e.status === 'Rejected'"
      tone="error"
      title="Rejected"
      :description="e.rejectReason || 'Fix it and submit again.'"
    />
    <InlineNotice
      v-else-if="e.status === 'Approved'"
      tone="info"
      title="Approved, not yet paid"
      description="Pay the vendor from the school’s bank or cash, then mark it as paid so the account balance updates."
    />

    <div class="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <div class="flex flex-col gap-4">
        <KeyValueCard title="Details" :rows="details">
          <template #action>
            <RouterLink
              v-if="e.vendorId"
              :to="{ name: routesPath.finance.vendorDetail.name, params: { id: e.vendorId } }"
              class="text-[13px] font-medium text-primary hover:underline"
              >{{ e.vendor }}</RouterLink
            >
          </template>
        </KeyValueCard>
        <KeyValueCard
          v-if="e.status === 'Paid'"
          title="Payment"
          status="Paid"
          :rows="[
            { label: 'Paid from', value: e.account },
            { label: 'Paid on', value: fmtDay(e.paidOn) },
            { label: 'Reference', value: e.paidRef },
          ]"
        />
        <SectionCard title="Attachment">
          <p v-if="e.attachment" class="text-[13px]">
            {{ e.attachment.name }} <span class="text-faint">· {{ e.attachment.size }}</span>
          </p>
          <p v-else class="text-[13px] text-muted-foreground">No vendor invoice or receipt.</p>
        </SectionCard>
      </div>
      <div class="flex flex-col gap-4">
        <SectionCard
          title="Approval"
          description="The Bursar approves up to the limit; larger amounts also need the Principal."
        >
          <ol class="flex flex-col gap-3">
            <li v-for="s in e.steps" :key="s.role" class="flex items-start gap-3">
              <span
                :class="
                  cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full',
                    STEP_CLASS[s.status],
                  )
                "
              >
                <component :is="STEP_ICON[s.status]" class="size-3.5" />
              </span>
              <div class="flex min-w-0 flex-col text-[13px]">
                <span class="font-medium"
                  >{{ s.role }} <span class="font-normal text-faint">· {{ s.limit }}</span></span
                >
                <span class="text-muted-foreground">
                  {{
                    s.status === 'Done'
                      ? `${s.by} · ${fmtDay(s.on)}`
                      : s.status === 'Waiting'
                        ? e.waitingOn === s.role
                          ? 'Waiting for approval'
                          : 'After the step above'
                        : s.status
                  }}
                </span>
              </div>
            </li>
          </ol>
        </SectionCard>
        <ActivityTimeline title="History" :items="e.history" />
      </div>
    </div>

    <ExpenseDrawer v-model:open="editOpen" :expense="e" />

    <SideDrawer
      v-model:open="payOpen"
      :title="`Pay ${e.no}`"
      :description="`${formatNaira(e.amount)} to ${e.vendor ?? 'the payee'}. The account balance goes down by this amount.`"
    >
      <InlineNotice
        v-if="payError"
        tone="error"
        title="Couldn’t mark it paid"
        :description="payError"
        role="alert"
      />
      <FieldShell id="pay-acc" label="Paid from" required>
        <select
          id="pay-acc"
          v-model="payForm.accountId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Choose an account…</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">
            {{ a.name }} · {{ a.kind }}
          </option>
        </select>
      </FieldShell>
      <FieldShell id="pay-date" label="Date paid" required>
        <Input id="pay-date" v-model="payForm.date" type="date" :min="e.date" :max="todayIso()" />
      </FieldShell>
      <FieldShell
        id="pay-ref"
        :label="payAccount?.kind === 'Cash' ? 'Voucher number' : 'Transfer or cheque reference'"
        :required="payAccount?.kind !== 'Cash'"
      >
        <Input id="pay-ref" v-model="payForm.reference" placeholder="e.g. ACC/OUT/20261107/014" />
      </FieldShell>
      <template #footer>
        <Button variant="outline" @click="payOpen = false">Cancel</Button>
        <Button :disabled="pay.isPending.value" @click="doPay"
          ><Spinner v-if="pay.isPending.value" /> Mark as paid</Button
        >
      </template>
    </SideDrawer>
  </template>
</template>
