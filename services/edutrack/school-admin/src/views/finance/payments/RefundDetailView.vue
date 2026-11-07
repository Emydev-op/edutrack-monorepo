<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAccountsQuery,
  useApproveRefundMutation,
  useFinanceOptionsQuery,
  usePayRefundMutation,
  useRefundQuery,
  useRejectRefundMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

import { fmtDay, todayIso } from '../finance-tones';

const f = routesPath.finance;
const route = useRoute();
const auth = useAuthStore();
const confirm = useConfirm();
const id = computed(() => String(route.params.id ?? ''));
const { data: r, isPending, error } = useRefundQuery(id);
const { data: options } = useFinanceOptionsQuery();
const { data: accounts } = useAccountsQuery();
const approve = useApproveRefundMutation();
const rejectRefund = useRejectRefundMutation();
const pay = usePayRefundMutation();

const limit = computed(() => options.value?.settings.refundLimit ?? 500000);
const me = computed(() => (auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : 'You'));

function askApprove() {
  const x = r.value!;
  const proprietor = x.needs === 'Proprietor';
  void confirm({
    title: proprietor
      ? `Record the Proprietor’s approval of ${formatNaira(x.amount)}?`
      : `Approve a ${formatNaira(x.amount)} refund to ${x.payer}?`,
    description: proprietor
      ? `This is above the Principal’s ${formatNaira(limit.value)} limit, so only the Proprietor can approve it. Record it only once they have approved, e.g. in writing.`
      : undefined,
    details: [
      ['Original payment', x.paymentNo ? `${x.paymentNo} · unchanged` : 'Credit on account'],
      ['Refund', `${formatNaira(x.amount)} to ${x.payTo}`],
      ['Effect', `${x.student}’s credit goes down by ${formatNaira(x.amount)}`],
      ['Reversible', 'No. Once paid out, it can’t be undone.'],
      [
        'Authorised by',
        proprietor
          ? `Proprietor · recorded by ${me.value}`
          : `${me.value} · limit ${formatNaira(limit.value)}`,
      ],
    ],
    acknowledgement: 'I have checked the reason for this refund',
    confirmLabel: proprietor ? 'Record approval' : 'Approve refund',
    action: async () => {
      await approve.mutateAsync({ id: x.id, acknowledged: true, asProprietor: proprietor });
      toast.success('Refund approved. Pay it out from the school’s account, then mark it paid.');
    },
  });
}

function askReject() {
  const x = r.value!;
  void confirm({
    title: `Reject ${x.no}?`,
    details: [['Effect', `${formatNaira(x.amount)} stays as credit on ${x.student}’s account`]],
    input: { label: 'Reason', placeholder: 'e.g. Charge was correct', required: true },
    confirmLabel: 'Reject refund',
    tone: 'destructive',
    action: async ({ text }) => {
      await rejectRefund.mutateAsync({ id: x.id, reason: text.trim() });
      toast.success(`${x.no} rejected.`);
    },
  });
}

/* ---------------- Pay out ---------------- */

const drawer = ref(false);
const form = reactive({ accountId: '', date: todayIso(), reference: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const bankAccounts = computed(() =>
  (accounts.value?.rows ?? []).filter((a) => a.status === 'Active'),
);
const chosen = computed(() => bankAccounts.value.find((a) => a.id === form.accountId));

function openPay() {
  Object.assign(form, {
    accountId:
      bankAccounts.value.find((a) => a.kind === 'Bank' && a.balance >= (r.value?.amount ?? 0))
        ?.id ?? '',
    date: todayIso(),
    reference: '',
  });
  serverError.value = '';
  drawer.value = true;
}
async function submitPay() {
  for (const k of Object.keys(errors)) delete errors[k];
  serverError.value = '';
  if (!form.accountId) errors.accountId = 'Choose the account it was paid from.';
  if (!form.date) errors.date = 'Enter the date it was paid.';
  else if (form.date > todayIso()) errors.date = 'The date can’t be in the future.';
  if (Object.keys(errors).length) return;
  try {
    await pay.mutateAsync({ id: r.value!.id, ...form, reference: form.reference.trim() });
    drawer.value = false;
    toast.success('Refund marked as paid.');
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t record the payout. Try again.');
  }
}

const refundRows = computed(() => {
  const x = r.value;
  if (!x) return [];
  return [
    { label: 'Amount', value: formatNaira(x.amount), emphasis: 'strong' as const },
    { label: 'Reason', value: x.reason },
    { label: 'Requested by', value: `${x.requestedBy} · ${fmtDay(x.requestedOn)}` },
    {
      label: 'Approved by',
      value: x.approvedBy ?? (x.status === 'Awaiting approval' ? `Pending (${x.needs})` : '—'),
    },
    { label: 'Pay to', value: x.payTo },
    ...(x.status === 'Paid'
      ? [
          { label: 'Paid from', value: x.paidFrom },
          { label: 'Paid on', value: `${fmtDay(x.paidOn)}${x.paidRef ? ` · ${x.paidRef}` : ''}` },
        ]
      : []),
    ...(x.status === 'Rejected'
      ? [{ label: 'Rejected because', value: x.rejectReason, emphasis: 'error' as const }]
      : []),
  ];
});
</script>

<template>
  <p v-if="isPending" class="text-[13px] text-muted-foreground">Loading…</p>
  <EmptyState v-else-if="error || !r" title="Refund not found" />
  <template v-else>
    <PageHeader
      :title="`Refund request ${r.no}`"
      :status="r.status"
      description="A refund is its own transaction. The original payment stays unchanged."
    >
      <template #actions>
        <template v-if="r.status === 'Awaiting approval'">
          <Button variant="outline" :disabled="rejectRefund.isPending.value" @click="askReject"
            >Reject</Button
          >
          <Button :disabled="approve.isPending.value" @click="askApprove">{{
            r.needs === 'Proprietor' ? 'Record Proprietor approval' : 'Approve refund'
          }}</Button>
        </template>
        <template v-else-if="r.status === 'Approved'">
          <Button variant="outline" :disabled="rejectRefund.isPending.value" @click="askReject"
            >Reject</Button
          >
          <Button @click="openPay">Mark as paid</Button>
        </template>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="r.status === 'Awaiting approval' && r.needs === 'Proprietor'"
      tone="warning"
      :title="`Above the Principal’s ${formatNaira(limit)} limit`"
      description="Only the Proprietor can approve this refund. Record their approval here once you have it."
    />
    <InlineNotice
      v-else-if="r.status === 'Approved'"
      tone="info"
      title="Approved · waiting to be paid out"
      description="Pay it by bank transfer from the school’s account, then mark it as paid with the transfer reference."
    />

    <div class="grid items-start gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <KeyValueCard title="Refund" :status="r.status" :rows="refundRows" />
      <KeyValueCard
        title="Student"
        :rows="[
          { label: 'Student', value: r.student },
          { label: 'Fee payer', value: r.payer },
          { label: 'Original payment', value: r.paymentNo ?? 'Credit on account' },
          { label: 'Credit before', value: formatNaira(r.creditBefore) },
        ]"
      >
        <template #action>
          <span class="flex gap-3 text-[13px] font-medium">
            <RouterLink
              v-if="r.paymentId"
              :to="{ name: f.paymentDetail.name, params: { id: r.paymentId } }"
              class="text-primary hover:underline"
              >Original payment</RouterLink
            >
            <RouterLink
              :to="{ name: f.studentAccount.name, params: { key: r.studentKey } }"
              class="text-primary hover:underline"
              >Account</RouterLink
            >
          </span>
        </template>
      </KeyValueCard>
    </div>

    <ActivityTimeline title="History" :items="r.history" />

    <SideDrawer
      v-model:open="drawer"
      title="Mark refund as paid"
      :description="`${formatNaira(r.amount)} to ${r.payTo}`"
    >
      <FieldShell
        id="rp-account"
        label="Paid from"
        required
        :error="errors.accountId"
        :hint="chosen ? `Balance ${formatNaira(chosen.balance)}` : undefined"
        :hint-tone="chosen && chosen.balance < r.amount ? 'warning' : 'muted'"
      >
        <select
          id="rp-account"
          v-model="form.accountId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Choose…</option>
          <option v-for="a in bankAccounts" :key="a.id" :value="a.id">
            {{ a.name }} · {{ formatNaira(a.balance) }}
          </option>
        </select>
      </FieldShell>
      <FieldShell id="rp-date" label="Date paid" required :error="errors.date">
        <Input id="rp-date" v-model="form.date" type="date" :max="todayIso()" />
      </FieldShell>
      <FieldShell id="rp-ref" label="Transfer reference">
        <Input id="rp-ref" v-model="form.reference" placeholder="e.g. GTB/RFD/2026/11/07" />
      </FieldShell>
      <p class="text-xs text-muted-foreground">Once paid out, a refund can’t be undone.</p>
      <p v-if="serverError" role="alert" class="text-[13px] text-error-strong">{{ serverError }}</p>
      <template #footer>
        <Button variant="outline" @click="drawer = false">Cancel</Button>
        <Button :disabled="pay.isPending.value" @click="submitPay">Mark as paid</Button>
      </template>
    </SideDrawer>
  </template>
</template>
