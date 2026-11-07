<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@edutrack/ui/components/dropdown-menu';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { ChevronDownIcon, PrinterIcon, XIcon } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { toast } from 'vue-sonner';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useAddInvoiceLineMutation,
  useApplyCreditMutation,
  useApplyDiscountMutation,
  useCancelInvoiceMutation,
  useChangePlanMutation,
  useInvoiceQuery,
  useIssueInvoicesMutation,
  useRemindInvoiceMutation,
  useRemoveDiscountMutation,
  useRemoveInvoiceLineMutation,
  useSendPaymentDetailsMutation,
} from '@/api/services/finance';
import PayToCard from '@/components/finance/PayToCard.vue';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { InvoiceDetail, InvoiceLine } from '@/types';

import { financeTone, fmtDay } from '../finance-tones';

const r = routesPath.finance;
const route = useRoute();
const confirm = useConfirm();
const auth = useAuthStore();
const id = computed(() => route.params.id as string);
const { data: inv, isPending, error } = useInvoiceQuery(id);

const addLine = useAddInvoiceLineMutation();
const removeLine = useRemoveInvoiceLineMutation();
const applyDiscount = useApplyDiscountMutation();
const removeDiscount = useRemoveDiscountMutation();
const changePlan = useChangePlanMutation();
const applyCredit = useApplyCreditMutation();
const cancel = useCancelInvoiceMutation();
const remindOne = useRemindInvoiceMutation();
const issue = useIssueInvoicesMutation();
const sendDetails = useSendPaymentDetailsMutation();

const live = computed(() => !!inv.value && inv.value.status !== 'Cancelled');
const fail = (e: unknown) => toast.error((e as Error).message);

/* ---------------- Lines ---------------- */

function addOptional(o: InvoiceDetail['optionalAvailable'][number]) {
  void confirm({
    title: `Add ${o.name} to ${inv.value!.no}?`,
    details: [
      ['Amount', formatNaira(o.amount)],
      ['New total', formatNaira(inv.value!.total + o.amount)],
      [
        'Fee payer',
        inv.value!.payer ? `${inv.value!.payer} sees the new total` : 'No guardian linked',
      ],
    ],
    confirmLabel: 'Add item',
    action: async () => {
      await addLine.mutateAsync({ id: inv.value!.id, itemId: o.itemId });
      toast.success(`${o.name} added.`);
    },
  });
}

function dropLine(l: InvoiceLine) {
  void confirm({
    title: `Remove ${l.label}?`,
    description: l.optional
      ? 'The total goes down. If more was paid than the new total, the difference becomes credit.'
      : 'This is a compulsory charge. Remove it only if it was charged in error; the reason is kept on the invoice.',
    details: [['Amount', formatNaira(l.amount)]],
    ...(l.optional
      ? {}
      : { input: { label: 'Reason', placeholder: 'e.g. Charged twice', required: true } }),
    confirmLabel: 'Remove',
    tone: 'destructive',
    action: async ({ text }) => {
      await removeLine.mutateAsync({ id: inv.value!.id, lineId: l.id, reason: text || undefined });
      toast.success(`${l.label} removed.`);
    },
  });
}

const chargeOpen = ref(false);
const charge = reactive({ label: '', amount: '' });
async function saveCharge() {
  try {
    await addLine.mutateAsync({
      id: inv.value!.id,
      label: charge.label,
      amount: Number(charge.amount.replace(/[,\s₦]/g, '')),
    });
    toast.success(`${charge.label} added.`);
    chargeOpen.value = false;
    Object.assign(charge, { label: '', amount: '' });
  } catch (e) {
    fail(e);
  }
}

/* ---------------- Discounts ---------------- */

type Avail = InvoiceDetail['discountsAvailable'][number];
const discountOpen = ref(false);
const picked = ref<Avail | null>(null);
const disc = reactive({ amount: '', reason: '' });
const isCustom = computed(() => picked.value?.basis === 'Custom');
function startDiscount(d: Avail) {
  picked.value = d;
  Object.assign(disc, { amount: d.amount ? String(d.amount) : '', reason: '' });
  discountOpen.value = true;
}
async function saveDiscount() {
  try {
    await applyDiscount.mutateAsync({
      id: inv.value!.id,
      discountId: picked.value!.id,
      amount: disc.amount ? Number(disc.amount.replace(/[,\s₦]/g, '')) : undefined,
      reason: disc.reason || undefined,
    });
    toast.success(`${picked.value!.name} applied.`);
    discountOpen.value = false;
  } catch (e) {
    fail(e);
  }
}
function dropDiscount(d: InvoiceDetail['discounts'][number]) {
  void confirm({
    title: `Remove ${d.label}?`,
    details: [
      ['Discount', formatNaira(d.amount)],
      ['New balance', formatNaira(inv.value!.balance + d.amount)],
    ],
    confirmLabel: 'Remove discount',
    tone: 'destructive',
    action: async () => {
      await removeDiscount.mutateAsync({ id: inv.value!.id, lineId: d.id });
      toast.success('Discount removed.');
    },
  });
}

/* ---------------- Plan, credit, cancel, remind ---------------- */

async function pickPlan(planId: string) {
  try {
    await changePlan.mutateAsync({ id: inv.value!.id, planId });
    toast.success('Payment plan changed.');
  } catch (e) {
    fail(e);
  }
}

const creditToApply = computed(() =>
  inv.value ? Math.min(inv.value.credit, inv.value.balance) : 0,
);
function useCredit() {
  const amount = creditToApply.value;
  void confirm({
    title: `Apply ${formatNaira(amount)} credit to ${inv.value!.no}?`,
    details: [
      ['Credit available', formatNaira(inv.value!.credit)],
      ['Balance after', formatNaira(inv.value!.balance - amount)],
    ],
    confirmLabel: 'Apply credit',
    action: async () => {
      await applyCredit.mutateAsync({ id: inv.value!.id, amount });
      toast.success('Credit applied.');
    },
  });
}

function cancelInvoice() {
  const i = inv.value!;
  void confirm({
    title: `Cancel ${i.no}?`,
    description:
      'Use this if it was issued in error or the student left. It stays on record as Cancelled and no longer counts towards balances.',
    details: [
      ['Amount', formatNaira(i.total)],
      ...(i.canCancel.reason ? ([['Money paid', i.canCancel.reason]] as [string, string][]) : []),
      ['Fee payer', i.payer ? `${i.payer} is told it’s cancelled` : 'Nobody to notify'],
    ],
    input: { label: 'Reason', placeholder: 'e.g. Issued in error', required: true },
    confirmLabel: 'Cancel invoice',
    cancelLabel: 'Keep invoice',
    tone: 'destructive',
    action: async ({ text }) => {
      await cancel.mutateAsync({ id: i.id, reason: text });
      toast.success(`${i.no} cancelled.`);
    },
  });
}

async function remind() {
  try {
    const res = await remindOne.mutateAsync(inv.value!.id);
    toast.success(`Reminder sent to ${res.sentTo}.`);
  } catch (e) {
    fail(e);
  }
}
async function send() {
  try {
    const res = await sendDetails.mutateAsync(inv.value!.studentKey);
    toast.success(`Payment details sent to ${res.sentTo}.`);
  } catch (e) {
    fail(e);
  }
}
function issueDraft() {
  void confirm({
    title: 'Issue this invoice?',
    details: [
      ['Total', formatNaira(inv.value!.total)],
      [
        'Fee payer',
        inv.value!.payer ? `${inv.value!.payer} · SMS and email` : 'No guardian to notify',
      ],
    ],
    confirmLabel: 'Issue invoice',
    action: async () => {
      await issue.mutateAsync([inv.value!.id]);
      toast.success('Invoice issued.');
    },
  });
}

const print = () => window.print();
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-10 w-72" /><Skeleton class="h-64 w-full" />
  </div>
  <EmptyState
    v-else-if="error || !inv"
    title="Invoice not found"
    description="It may have been removed, or the link is wrong."
  />

  <template v-else>
    <div class="flex flex-col gap-4 print:hidden">
      <PageHeader
        :title="inv.no === 'Draft' ? 'Draft invoice' : inv.no"
        :status="inv.status"
        :description="`${inv.student} · ${inv.className} · ${inv.session} ${inv.term}`"
        :meta="[
          { label: 'Fee payer', value: inv.payer ?? 'No guardian linked' },
          { label: 'Issued', value: fmtDay(inv.issuedOn) },
          { label: 'Due', value: fmtDay(inv.dueOn) },
        ]"
      >
        <template #actions>
          <Button variant="outline" @click="print"
            ><PrinterIcon class="size-4" /> Print / PDF</Button
          >
          <Button
            v-if="live && inv.balance > 0 && inv.status !== 'Draft'"
            variant="outline"
            :disabled="remindOne.isPending.value"
            @click="remind"
            >Send reminder</Button
          >
          <Button v-if="live && inv.canCancel.ok" variant="outline" @click="cancelInvoice"
            >Cancel invoice</Button
          >
          <Button v-if="live && inv.balance > 0 && inv.status !== 'Draft'" as-child
            ><RouterLink
              :to="{ name: r.paymentNew.name, query: { student: inv.studentKey, invoice: inv.id } }"
              >Record payment</RouterLink
            ></Button
          >
        </template>
      </PageHeader>

      <InlineNotice
        v-if="inv.cancelled"
        tone="neutral"
        :title="`Cancelled ${fmtDay(inv.cancelled.on)} · ${inv.cancelled.reason}`"
        :description="`By ${inv.cancelled.by}. Kept for the record; it no longer counts towards balances. Money paid on it became credit.`"
      />
      <InlineNotice
        v-else-if="inv.status === 'Draft'"
        tone="info"
        title="Draft"
        description="Parents can’t see this invoice and it doesn’t count as billed until you issue it."
      >
        <template #action
          ><Button size="sm" :disabled="issue.isPending.value" @click="issueDraft"
            >Issue invoice</Button
          ></template
        >
      </InlineNotice>
      <InlineNotice
        v-else-if="inv.status === 'Paid'"
        tone="success"
        title="Paid in full"
        :description="`${inv.allocations.length} payment${inv.allocations.length === 1 ? '' : 's'}.`"
      />
      <InlineNotice
        v-else-if="inv.overdue"
        tone="error"
        :title="inv.dueNote || `Overdue · ${formatNaira(inv.balance)} outstanding`"
        description="Send a reminder with the bank details, or apply a late fee from Invoices."
      />
      <InlineNotice
        v-if="live && !inv.payer"
        tone="warning"
        title="No guardian to notify"
        :description="`${inv.student} has no guardian linked, so nobody received this invoice.`"
      >
        <template v-if="inv.studentId" #action>
          <Button as-child variant="outline" size="sm"
            ><RouterLink
              :to="{ name: routesPath.students.guardians.name, params: { id: inv.studentId } }"
              >Add guardian</RouterLink
            ></Button
          >
        </template>
      </InlineNotice>

      <div class="grid items-start gap-4 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div class="flex flex-col gap-4">
          <SectionCard title="Items" flush>
            <template v-if="live" #actions>
              <div class="flex flex-wrap gap-2">
                <DropdownMenu v-if="inv.optionalAvailable.length">
                  <DropdownMenuTrigger as-child>
                    <Button variant="outline" size="sm"
                      >Add optional item <ChevronDownIcon class="size-3.5"
                    /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      v-for="o in inv.optionalAvailable"
                      :key="o.itemId"
                      @select="addOptional(o)"
                    >
                      {{ o.name }} · {{ formatNaira(o.amount) }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" @click="chargeOpen = true">Add a charge</Button>
              </div>
            </template>
            <ul class="divide-y divide-divider">
              <li
                v-for="l in inv.lines"
                :key="l.id"
                class="flex items-center gap-3 px-4 py-2.5 text-[13px]"
              >
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="font-medium">{{ l.label }}</span>
                  <span class="text-xs text-faint"
                    >{{ l.category }}{{ l.optional ? ' · optional' : '' }}</span
                  >
                </div>
                <span class="tabular-nums">{{ formatNaira(l.amount) }}</span>
                <button
                  v-if="live && l.removable"
                  type="button"
                  class="text-muted-foreground hover:text-destructive"
                  :aria-label="`Remove ${l.label}`"
                  @click="dropLine(l)"
                >
                  <XIcon class="size-4" />
                </button>
              </li>
              <li
                v-for="d in inv.discounts"
                :key="d.id"
                class="flex items-center gap-3 px-4 py-2.5 text-[13px]"
              >
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="font-medium text-success-strong">{{ d.label }}</span>
                  <span class="text-xs text-faint"
                    >{{ d.by
                    }}{{
                      d.approvedBy && d.approvedBy !== d.by
                        ? ` · approved by ${d.approvedBy}`
                        : d.approvedBy
                          ? ' · approval recorded'
                          : ''
                    }}{{ d.reason ? ` · ${d.reason}` : '' }}</span
                  >
                </div>
                <span class="tabular-nums text-success-strong">−{{ formatNaira(d.amount) }}</span>
                <button
                  v-if="live"
                  type="button"
                  class="text-muted-foreground hover:text-destructive"
                  :aria-label="`Remove ${d.label}`"
                  @click="dropDiscount(d)"
                >
                  <XIcon class="size-4" />
                </button>
              </li>
            </ul>
            <div
              v-if="live && inv.discountsAvailable.length"
              class="border-t border-divider px-4 py-2.5"
            >
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="sm"
                    >Apply discount <ChevronDownIcon class="size-3.5"
                  /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    v-for="d in inv.discountsAvailable"
                    :key="d.id"
                    @select="startDiscount(d)"
                  >
                    {{ d.name }}{{ d.amount ? ` · up to ${formatNaira(d.amount)}` : '' }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t px-4 py-3 text-[13px]">
              <dt class="text-faint">Subtotal</dt>
              <dd class="text-right tabular-nums">{{ formatNaira(inv.subtotal) }}</dd>
              <template v-if="inv.discountTotal">
                <dt class="text-faint">Discounts</dt>
                <dd class="text-right tabular-nums text-success-strong">
                  −{{ formatNaira(inv.discountTotal) }}
                </dd>
              </template>
              <dt class="font-semibold">Total</dt>
              <dd class="text-right font-semibold tabular-nums">{{ formatNaira(inv.total) }}</dd>
              <dt class="text-faint">Paid</dt>
              <dd class="text-right tabular-nums">{{ formatNaira(inv.paid) }}</dd>
              <dt class="text-[15px] font-semibold">Balance</dt>
              <dd
                :class="
                  cn(
                    'text-right text-[15px] font-semibold tabular-nums',
                    inv.balance ? 'text-error-strong' : 'text-success-strong',
                  )
                "
              >
                {{ formatNaira(inv.balance) }}
              </dd>
              <dd v-if="inv.pending" class="col-span-2 text-right text-xs text-warning-strong">
                {{ formatNaira(inv.pending) }} pending verification
              </dd>
            </dl>
          </SectionCard>

          <SectionCard
            title="Payments"
            description="Payments are permanent records. Mistakes are corrected with a refund or by cancelling the invoice."
            flush
          >
            <p v-if="!inv.allocations.length" class="px-4 py-3 text-[13px] text-muted-foreground">
              No payments yet.
            </p>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-[13px]">
                <thead class="text-left text-xs text-faint">
                  <tr class="border-b">
                    <th class="px-4 py-2 font-medium">Receipt</th>
                    <th class="py-2 font-medium">Date</th>
                    <th class="py-2 font-medium">Method</th>
                    <th class="py-2 text-right font-medium">Allocated here</th>
                    <th class="py-2 font-medium pl-4">Recorded by</th>
                    <th class="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="a in inv.allocations"
                    :key="`${a.paymentId}${a.date}${a.amount}`"
                    class="border-b border-divider last:border-0"
                  >
                    <td class="px-4 py-2">
                      <RouterLink
                        v-if="a.paymentId"
                        :to="{ name: r.paymentDetail.name, params: { id: a.paymentId } }"
                        class="font-medium text-primary hover:underline"
                        >{{ a.receipt }}</RouterLink
                      >
                      <span v-else>{{ a.receipt }}</span>
                    </td>
                    <td class="py-2">{{ fmtDay(a.date) }}</td>
                    <td class="py-2">{{ a.method }}</td>
                    <td class="py-2 text-right tabular-nums">{{ formatNaira(a.amount) }}</td>
                    <td class="py-2 pl-4">{{ a.recordedBy }}</td>
                    <td class="px-4 py-2">
                      <StatusBadge :label="a.status" :tone="financeTone(a.status)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <ActivityTimeline title="History" :items="inv.history" />
        </div>

        <div class="flex flex-col gap-4">
          <SectionCard v-if="live && inv.status !== 'Draft'" title="Payment plan">
            <div class="flex flex-col gap-3">
              <select
                aria-label="Payment plan"
                class="h-9 rounded-md border bg-card px-2.5 text-sm"
                :value="inv.plan?.id ?? ''"
                :disabled="changePlan.isPending.value"
                @change="pickPlan(($event.target as HTMLSelectElement).value)"
              >
                <option v-if="!inv.plan" value="" disabled>Choose a plan…</option>
                <option v-for="p in inv.plans" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <ul class="flex flex-col divide-y divide-divider text-[13px]">
                <li
                  v-for="i in inv.installments"
                  :key="i.index"
                  class="flex items-center gap-2 py-2"
                >
                  <div class="flex flex-1 flex-col">
                    <span class="font-medium">{{ i.label }} · {{ formatNaira(i.amount) }}</span>
                    <span class="text-xs text-faint"
                      >Due {{ fmtDay(i.due)
                      }}{{
                        i.paid && i.paid < i.amount ? ` · ${formatNaira(i.paid)} paid` : ''
                      }}</span
                    >
                  </div>
                  <StatusBadge :label="i.status" :tone="financeTone(i.status)" />
                </li>
              </ul>
            </div>
          </SectionCard>

          <InlineNotice
            v-if="live && inv.credit > 0 && inv.balance > 0"
            tone="info"
            :title="`${formatNaira(inv.credit)} credit on account`"
            description="Money paid earlier that isn’t on any invoice."
          >
            <template #action>
              <Button
                size="sm"
                variant="outline"
                :disabled="applyCredit.isPending.value"
                @click="useCredit"
                >Apply {{ formatNaira(creditToApply) }}</Button
              >
            </template>
          </InlineNotice>

          <PayToCard
            v-if="inv.payTo"
            :details="inv.payTo"
            :payer="inv.payer"
            :sending="sendDetails.isPending.value"
            @send="send"
          />

          <SectionCard v-if="inv.otherOpen.length" title="Other balances for this student">
            <ul class="flex flex-col divide-y divide-divider text-[13px]">
              <li
                v-for="o in inv.otherOpen"
                :key="o.id"
                class="flex items-center justify-between gap-2 py-2"
              >
                <div class="flex flex-col">
                  <RouterLink
                    :to="{ name: r.invoiceDetail.name, params: { id: o.id } }"
                    class="font-medium text-primary hover:underline"
                    >{{ o.no }}</RouterLink
                  >
                  <span class="text-xs text-faint">{{ o.term }}</span>
                </div>
                <div class="flex flex-col items-end">
                  <span class="tabular-nums">{{ formatNaira(o.balance) }}</span>
                  <StatusBadge :label="o.status" :tone="financeTone(o.status)" />
                </div>
              </li>
            </ul>
            <p class="mt-2 text-xs text-faint">
              Older balances stay with their own session and term.
            </p>
          </SectionCard>

          <RouterLink
            :to="{ name: r.studentAccount.name, params: { key: inv.studentKey } }"
            class="text-[13px] font-medium text-primary hover:underline"
            >{{ inv.student }}’s account and statement →</RouterLink
          >
        </div>
      </div>
    </div>

    <!-- Printed invoice -->
    <article class="hidden text-[12px] text-black print:block">
      <header class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-xl font-bold">{{ auth.school?.name }}</h1>
          <p>Invoice</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-semibold">{{ inv.no }}</p>
          <p>Issued {{ fmtDay(inv.issuedOn) }} · Due {{ fmtDay(inv.dueOn) }}</p>
          <p>Status: {{ inv.status }}</p>
        </div>
      </header>
      <section class="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p class="font-semibold">Bill to</p>
          <p>{{ inv.payer ?? '—' }}</p>
          <p>{{ inv.payerPhone }}</p>
        </div>
        <div>
          <p class="font-semibold">Student</p>
          <p>{{ inv.student }} · {{ inv.admissionNo }}</p>
          <p>{{ inv.className }} · {{ inv.session }} {{ inv.term }}</p>
        </div>
      </section>
      <table class="mb-4 w-full border-collapse">
        <thead>
          <tr class="border-b border-black text-left">
            <th class="py-1">Item</th>
            <th class="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in inv.lines" :key="l.id" class="border-b">
            <td class="py-1">{{ l.label }}</td>
            <td class="py-1 text-right">{{ formatNaira(l.amount) }}</td>
          </tr>
          <tr v-for="d in inv.discounts" :key="d.id" class="border-b">
            <td class="py-1">{{ d.label }}</td>
            <td class="py-1 text-right">−{{ formatNaira(d.amount) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="py-1 font-semibold">Total</td>
            <td class="py-1 text-right font-semibold">{{ formatNaira(inv.total) }}</td>
          </tr>
          <tr>
            <td class="py-1">Paid</td>
            <td class="py-1 text-right">{{ formatNaira(inv.paid) }}</td>
          </tr>
          <tr>
            <td class="py-1 font-semibold">Balance due</td>
            <td class="py-1 text-right font-semibold">{{ formatNaira(inv.balance) }}</td>
          </tr>
        </tfoot>
      </table>
      <section v-if="inv.installments.length > 1" class="mb-4">
        <p class="font-semibold">Payment plan · {{ inv.plan?.name }}</p>
        <p v-for="i in inv.installments" :key="i.index">
          {{ i.label }}: {{ formatNaira(i.amount) }} due {{ fmtDay(i.due) }} · {{ i.status }}
        </p>
      </section>
      <section v-if="inv.payTo" class="rounded border border-black p-3">
        <p class="font-semibold">How to pay</p>
        <p>
          Bank transfer to {{ inv.payTo.bank }} · {{ inv.payTo.accountNumber }} ·
          {{ inv.payTo.accountName }}
        </p>
        <p>
          Use <strong>{{ inv.payTo.reference }}</strong> as the narration. Your balance updates once
          the school confirms the transfer.
        </p>
      </section>
    </article>

    <SideDrawer
      v-model:open="chargeOpen"
      title="Add a charge"
      description="A one-off charge on this invoice, e.g. a replaced textbook."
    >
      <FieldShell id="ch-label" label="What it’s for" required>
        <Input id="ch-label" v-model="charge.label" placeholder="e.g. Replacement textbook" />
      </FieldShell>
      <FieldShell id="ch-amount" label="Amount (₦)" required>
        <Input
          id="ch-amount"
          v-model="charge.amount"
          inputmode="numeric"
          placeholder="e.g. 4,500"
        />
      </FieldShell>
      <template #footer>
        <Button variant="outline" @click="chargeOpen = false">Cancel</Button>
        <Button
          :disabled="addLine.isPending.value || !charge.label || !charge.amount"
          @click="saveCharge"
          ><Spinner v-if="addLine.isPending.value" /> Add charge</Button
        >
      </template>
    </SideDrawer>

    <SideDrawer
      v-model:open="discountOpen"
      :title="`Apply ${picked?.name ?? 'discount'}`"
      :description="
        picked?.needsApproval
          ? `Recorded as approved by you (${auth.fullName}).`
          : 'Applied straight away.'
      "
    >
      <FieldShell
        v-if="isCustom"
        id="dc-amount"
        label="Amount off (₦)"
        required
        :hint="picked?.amount ? `Up to ${formatNaira(picked.amount)}` : undefined"
      >
        <Input id="dc-amount" v-model="disc.amount" inputmode="numeric" placeholder="e.g. 20,000" />
      </FieldShell>
      <p v-else class="text-[13px]">
        Takes {{ formatNaira(picked?.amount ?? 0) }} off. New balance
        {{ formatNaira(Math.max(0, inv.balance - (picked?.amount ?? 0))) }}.
      </p>
      <FieldShell
        id="dc-reason"
        label="Reason"
        :required="isCustom || picked?.basis === 'Scholarship'"
        hint="Kept with the approval on the invoice."
      >
        <Input
          id="dc-reason"
          v-model="disc.reason"
          placeholder="e.g. Hardship case approved by the Principal"
        />
      </FieldShell>
      <template #footer>
        <Button variant="outline" @click="discountOpen = false">Cancel</Button>
        <Button :disabled="applyDiscount.isPending.value" @click="saveDiscount"
          ><Spinner v-if="applyDiscount.isPending.value" /> Apply discount</Button
        >
      </template>
    </SideDrawer>
  </template>
</template>
