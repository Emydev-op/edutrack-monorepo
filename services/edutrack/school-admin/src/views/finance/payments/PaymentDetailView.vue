<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { Paperclip } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
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
  usePaymentQuery,
  useRejectPaymentMutation,
  useRequestRefundMutation,
  useVerifyPaymentMutation,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

import { financeTone, fmtDay } from '../finance-tones';

const f = routesPath.finance;
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const confirm = useConfirm();
const id = computed(() => String(route.params.id ?? ''));
const { data: p, isPending, error } = usePaymentQuery(id);
const verify = useVerifyPaymentMutation();
const reject = useRejectPaymentMutation();
const requestRefund = useRequestRefundMutation();

const pending = computed(() => p.value?.status === 'Pending verification');

function askVerify() {
  const x = p.value!;
  void confirm({
    title: `Verify ${x.no}?`,
    description: 'Only verify once you’ve found this money on the school’s bank statement.',
    details: [
      ['Amount', formatNaira(x.amount)],
      ['Reference', x.reference || '—'],
      ['Effect', `${x.student}’s balance goes down; the payer gets a receipt`],
    ],
    confirmLabel: 'Verify payment',
    action: async () => {
      await verify.mutateAsync(x.id);
      toast.success(`${x.no} verified.`);
    },
  });
}

function askReject() {
  const x = p.value!;
  void confirm({
    title: `Reject ${x.no}?`,
    description: 'The payer is notified to resend proof. It stays on record as Rejected.',
    details: [
      ['Amount', formatNaira(x.amount)],
      ['Effect', 'No balance change'],
    ],
    options: [
      { value: 'Not found on the bank statement', label: 'Not found on the bank statement' },
      {
        value: 'Amount on the statement is different',
        label: 'Amount on the statement is different',
      },
      {
        value: 'Duplicate of a payment already recorded',
        label: 'Duplicate of a payment already recorded',
      },
      { value: 'other', label: 'Another reason' },
    ],
    input: {
      label: 'Note for the payer (optional)',
      placeholder: 'e.g. Please send the bank alert',
    },
    confirmLabel: 'Reject payment',
    tone: 'destructive',
    action: async ({ option, text }) => {
      const reason =
        option === 'other'
          ? text.trim() || 'Not accepted'
          : text.trim()
            ? `${option}. ${text.trim()}`
            : option;
      await reject.mutateAsync({ id: x.id, reason });
      toast.success(`${x.no} rejected.`);
    },
  });
}

/* ---------------- Refund request ---------------- */

const drawer = ref(false);
const form = reactive({ amount: '', reason: '', payTo: '' });
const errors = reactive<Record<string, string>>({});
const serverError = ref('');
const refundAmount = computed(() => Number(form.amount.replace(/[,\s₦]/g, '')) || 0);
const dirty = computed(() => !!(form.amount || form.reason || form.payTo));

function openRefund() {
  Object.assign(form, { amount: String(p.value!.studentCredit), reason: '', payTo: '' });
  serverError.value = '';
  drawer.value = true;
}
async function submitRefund() {
  const x = p.value!;
  for (const k of Object.keys(errors)) delete errors[k];
  serverError.value = '';
  if (refundAmount.value <= 0) errors.amount = 'Enter the refund amount.';
  else if (refundAmount.value > x.studentCredit)
    errors.amount = `Only ${formatNaira(x.studentCredit)} credit is available.`;
  if (!form.reason.trim()) errors.reason = 'Give the reason for the refund.';
  if (!form.payTo.trim()) errors.payTo = 'Enter the bank and account it should go to.';
  if (Object.keys(errors).length) return;
  try {
    const r = await requestRefund.mutateAsync({
      studentKey: x.studentKey,
      paymentId: x.id,
      amount: refundAmount.value,
      reason: form.reason.trim(),
      payTo: form.payTo.trim(),
    });
    drawer.value = false;
    toast.success(`${r.no} requested. It needs the ${r.needs}’s approval.`);
    await router.push({ name: f.refundDetail.name, params: { id: r.id } });
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t request the refund. Try again.');
  }
}

const printReceipt = () => window.print();

const detailRows = computed(() => {
  const x = p.value;
  if (!x) return [];
  return [
    { label: 'Amount', value: formatNaira(x.amount), emphasis: 'strong' as const },
    { label: 'Date received', value: fmtDay(x.date) },
    { label: 'Method', value: x.method },
    { label: 'Reference', value: x.reference },
    { label: 'Paid into', value: x.account },
    { label: 'Paid by', value: x.payer },
    {
      label: 'Source',
      value:
        x.source === 'Parent claim'
          ? 'Claimed by the parent'
          : x.source === 'Statement'
            ? 'Bank statement'
            : 'Recorded by staff',
    },
    { label: 'Recorded by', value: x.recordedBy },
    ...(x.status === 'Confirmed'
      ? [
          {
            label: 'Verified',
            value: x.verifiedBy ? `${x.verifiedBy} · ${fmtDay(x.verifiedOn)}` : 'Not needed',
          },
        ]
      : []),
    ...(x.status === 'Rejected'
      ? [{ label: 'Rejected because', value: x.rejectReason, emphasis: 'error' as const }]
      : []),
    ...(x.note ? [{ label: 'Note', value: x.note }] : []),
  ];
});
</script>

<template>
  <p v-if="isPending" class="text-[13px] text-muted-foreground">Loading…</p>
  <EmptyState
    v-else-if="error || !p"
    title="Payment not found"
    description="It may have been mistyped. Payments are never deleted."
  />
  <template v-else>
    <div class="print:hidden">
      <PageHeader
        :title="`Receipt ${p.no}`"
        :status="p.status"
        :description="`${formatNaira(p.amount)} · ${p.student} · ${p.className}`"
      >
        <template #actions>
          <Button variant="outline" @click="printReceipt">Print receipt</Button>
          <template v-if="pending">
            <Button variant="outline" :disabled="reject.isPending.value" @click="askReject"
              >Reject</Button
            >
            <Button :disabled="verify.isPending.value" @click="askVerify">Verify</Button>
          </template>
          <Button
            v-else-if="p.studentCredit > 0 && p.status === 'Confirmed'"
            variant="outline"
            @click="openRefund"
            >Request refund</Button
          >
        </template>
      </PageHeader>
    </div>

    <InlineNotice
      v-if="pending"
      tone="warning"
      :title="
        p.source === 'Parent claim' ? `${p.payer} says they’ve paid` : 'Waiting for verification'
      "
      description="Nothing changes the student’s balance until you find this transfer on the bank statement and verify it."
      class="print:hidden"
    />
    <InlineNotice
      v-else-if="p.status === 'Rejected'"
      tone="error"
      title="Rejected"
      :description="`${p.rejectReason}. It doesn’t count as paid; the payer was asked to resend proof.`"
      class="print:hidden"
    />
    <InlineNotice
      v-else-if="p.studentCredit > 0"
      tone="info"
      :title="`${p.student} has ${formatNaira(p.studentCredit)} credit on account`"
      description="Apply it to an invoice from the invoice page, or request a refund."
      class="print:hidden"
    />

    <!-- Printed receipt -->
    <section class="hidden flex-col gap-3 print:flex">
      <header class="flex justify-between border-b pb-2">
        <div>
          <p class="text-base font-semibold">{{ auth.school?.name }}</p>
          <p class="text-xs">Official receipt</p>
        </div>
        <p class="font-semibold">{{ p.no }} · {{ p.status }}</p>
      </header>
      <p class="text-[13px]">
        Received from {{ p.payer }} for {{ p.student }} ({{ p.className }}):
        <strong>{{ formatNaira(p.amount) }}</strong> by {{ p.method
        }}{{ p.reference ? ` (${p.reference})` : '' }} on {{ fmtDay(p.date) }}. Balance now
        {{ formatNaira(p.balanceNow) }}.
      </p>
    </section>

    <div
      class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] print:hidden [&>*]:min-w-0"
    >
      <KeyValueCard title="Payment" :status="p.status" :rows="detailRows">
        <template #action>
          <RouterLink
            :to="{ name: f.studentAccount.name, params: { key: p.studentKey } }"
            class="text-[13px] font-medium text-primary hover:underline"
            >Student account</RouterLink
          >
        </template>
      </KeyValueCard>

      <div class="flex flex-col gap-4">
        <SectionCard title="Allocated to" flush>
          <table class="w-full text-[13px]">
            <thead class="text-left text-xs text-faint">
              <tr class="border-b border-divider">
                <th class="px-4 py-2 font-medium">Invoice</th>
                <th class="px-4 py-2 text-right font-medium">Amount</th>
                <th class="px-4 py-2 text-right font-medium">Balance now</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!p.allocations.length">
                <td colspan="3" class="px-4 py-3 text-muted-foreground">
                  Not allocated to an invoice.
                </td>
              </tr>
              <tr
                v-for="a in p.allocations"
                :key="a.invoiceId"
                class="border-b border-divider last:border-0"
              >
                <td class="px-4 py-2.5">
                  <RouterLink
                    :to="{ name: f.invoiceDetail.name, params: { id: a.invoiceId } }"
                    class="font-medium text-primary hover:underline"
                    >{{ a.no }}</RouterLink
                  >
                  <span class="block text-xs text-faint">{{ a.term }}</span>
                </td>
                <td class="px-4 py-2.5 text-right tabular-nums">{{ formatNaira(a.amount) }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums">
                  {{ formatNaira(a.balanceAfter) }}
                </td>
              </tr>
              <tr v-if="p.unallocated" class="border-t border-divider">
                <td class="px-4 py-2.5 text-muted-foreground">Credit on account</td>
                <td class="px-4 py-2.5 text-right tabular-nums">
                  {{ formatNaira(p.unallocated) }}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </SectionCard>

        <SectionCard v-if="p.proof" title="Proof of payment">
          <p class="flex items-center gap-2 text-[13px]">
            <Paperclip class="size-4 text-muted-foreground" /> {{ p.proof }}
            <span class="text-xs text-faint">attached by {{ p.payer }}</span>
          </p>
        </SectionCard>

        <SectionCard v-if="p.refunds.length" title="Refunds from this payment" flush>
          <ul class="divide-y divide-divider text-[13px]">
            <li
              v-for="r in p.refunds"
              :key="r.id"
              class="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span class="flex flex-col">
                <RouterLink
                  :to="{ name: f.refundDetail.name, params: { id: r.id } }"
                  class="font-medium text-primary hover:underline"
                  >{{ r.no }}</RouterLink
                >
                <span class="text-xs text-faint">{{ r.reason }}</span>
              </span>
              <span class="flex items-center gap-2">
                <span class="tabular-nums">{{ formatNaira(r.amount) }}</span>
                <StatusBadge :label="r.status" :tone="financeTone(r.status)" />
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>

    <ActivityTimeline title="History" :items="p.history" class="print:hidden" />

    <SideDrawer
      v-model:open="drawer"
      title="Request a refund"
      :description="`From ${p.student}’s credit of ${formatNaira(p.studentCredit)}. The receipt itself doesn’t change.`"
      :dirty="dirty"
    >
      <FieldShell id="rf-amount" label="Amount (₦)" required :error="errors.amount">
        <Input id="rf-amount" v-model="form.amount" inputmode="numeric" placeholder="e.g. 10000" />
      </FieldShell>
      <FieldShell id="rf-reason" label="Reason" required :error="errors.reason">
        <Textarea
          id="rf-reason"
          v-model="form.reason"
          rows="2"
          placeholder="e.g. Examination fee paid twice"
        />
      </FieldShell>
      <FieldShell
        id="rf-payto"
        label="Pay to"
        required
        hint="The payer’s bank and account the refund goes to."
        :error="errors.payTo"
      >
        <Input
          id="rf-payto"
          v-model="form.payTo"
          placeholder="e.g. GTBank 0123456789 · Ngozi Eze"
        />
      </FieldShell>
      <p class="text-xs text-muted-foreground">
        The Principal approves refunds up to the school’s limit; larger ones need the Proprietor.
        It’s paid out after approval.
      </p>
      <p v-if="serverError" role="alert" class="text-[13px] text-error-strong">{{ serverError }}</p>
      <template #footer>
        <Button variant="outline" @click="drawer = false">Cancel</Button>
        <Button :disabled="requestRefund.isPending.value" @click="submitRefund"
          >Request refund</Button
        >
      </template>
    </SideDrawer>
  </template>
</template>
