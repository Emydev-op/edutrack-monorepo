<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { Spinner } from '@edutrack/ui/components/spinner';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { cn } from '@edutrack/ui/lib/utils';
import { PrinterIcon } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import EmptyState from '@edutrack/app-kit/components/common/EmptyState.vue';
import MetricCard from '@edutrack/app-kit/components/common/MetricCard.vue';
import MetricGrid from '@edutrack/app-kit/components/common/MetricGrid.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import SideDrawer from '@edutrack/app-kit/components/overlays/SideDrawer.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useRequestRefundMutation,
  useSendPaymentDetailsMutation,
  useStudentAccountQuery,
} from '@/api/services/finance';
import PayToCard from '@/components/finance/PayToCard.vue';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

import { financeTone, fmtDay, todayIso } from '../finance-tones';

const r = routesPath.finance;
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const key = computed(() => route.params.key as string);
const { data: acc, isPending, error } = useStudentAccountQuery(key);
const sendDetails = useSendPaymentDetailsMutation();
const requestRefund = useRequestRefundMutation();

async function send() {
  try {
    const res = await sendDetails.mutateAsync(key.value);
    toast.success(`Payment details sent to ${res.sentTo}.`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

const refundOpen = ref(false);
const refund = reactive({ amount: '', reason: '', payTo: '', paymentId: '' });
const confirmedPayments = computed(
  () => acc.value?.payments.filter((p) => p.status === 'Confirmed') ?? [],
);
function openRefund() {
  Object.assign(refund, {
    amount: String(acc.value!.credit),
    reason: '',
    payTo: '',
    paymentId: '',
  });
  refundOpen.value = true;
}
async function saveRefund() {
  try {
    const res = await requestRefund.mutateAsync({
      studentKey: key.value,
      paymentId: refund.paymentId || null,
      amount: Number(refund.amount.replace(/[,\s₦]/g, '')),
      reason: refund.reason,
      payTo: refund.payTo,
    });
    toast.success(`Refund ${res.no} requested. It needs approval before it is paid.`);
    refundOpen.value = false;
    await router.push({ name: r.refundDetail.name, params: { id: res.id } });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

const print = () => window.print();
</script>

<template>
  <div v-if="isPending" class="flex flex-col gap-3">
    <Skeleton class="h-10 w-72" /><Skeleton class="h-40 w-full" />
  </div>
  <EmptyState
    v-else-if="error || !acc"
    title="Student not found"
    description="The link may be wrong."
  />

  <template v-else>
    <div class="flex flex-col gap-4 print:hidden">
      <PageHeader
        :title="acc.name"
        :description="`${acc.admissionNo} · ${acc.className} · ${acc.branch}`"
        :meta="[
          { label: 'Fee payer', value: acc.payer ?? 'No guardian linked' },
          ...(acc.payerPhone ? [{ label: 'Phone', value: acc.payerPhone }] : []),
        ]"
      >
        <template #actions>
          <Button v-if="acc.studentId" as-child variant="outline"
            ><RouterLink
              :to="{ name: routesPath.students.detail.name, params: { id: acc.studentId } }"
              >Student profile</RouterLink
            ></Button
          >
          <Button variant="outline" @click="print"
            ><PrinterIcon class="size-4" /> Print statement</Button
          >
          <Button v-if="acc.credit > 0" variant="outline" @click="openRefund"
            >Request refund</Button
          >
          <Button as-child
            ><RouterLink :to="{ name: r.paymentNew.name, query: { student: acc.studentKey } }"
              >Record payment</RouterLink
            ></Button
          >
        </template>
      </PageHeader>

      <MetricGrid>
        <MetricCard
          label="Outstanding"
          :value="formatNaira(acc.outstanding)"
          :hint="acc.outstanding ? 'All sessions' : 'Nothing owed'"
          :hint-tone="acc.outstanding ? 'neutral' : 'success'"
        />
        <MetricCard
          label="Overdue"
          :value="formatNaira(acc.overdue)"
          :hint="acc.overdue ? 'Past an installment or due date' : 'Nothing overdue'"
          :hint-tone="acc.overdue ? 'error' : 'neutral'"
        />
        <MetricCard
          label="Pending verification"
          :value="formatNaira(acc.pending)"
          hint="Transfers not yet on the statement"
          :hint-tone="acc.pending ? 'warning' : 'neutral'"
        />
        <MetricCard
          label="Credit"
          :value="formatNaira(acc.credit)"
          hint="Paid but not on any invoice"
        />
      </MetricGrid>

      <div class="grid items-start gap-4 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div class="flex flex-col gap-4">
          <SectionCard title="Invoices" flush>
            <p v-if="!acc.invoices.length" class="px-4 py-3 text-[13px] text-muted-foreground">
              No invoices yet.
            </p>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[600px] text-[13px]">
                <thead class="text-left text-xs text-faint">
                  <tr class="border-b">
                    <th class="px-4 py-2 font-medium">Invoice</th>
                    <th class="py-2 font-medium">Session · term</th>
                    <th class="py-2 text-right font-medium">Total</th>
                    <th class="py-2 text-right font-medium">Balance</th>
                    <th class="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="i in acc.invoices"
                    :key="i.id"
                    class="border-b border-divider last:border-0"
                  >
                    <td class="px-4 py-2">
                      <RouterLink
                        :to="{ name: r.invoiceDetail.name, params: { id: i.id } }"
                        class="font-medium text-primary hover:underline"
                        >{{ i.no }}</RouterLink
                      >
                    </td>
                    <td class="py-2">{{ i.session }} · {{ i.term }}</td>
                    <td class="py-2 text-right tabular-nums">{{ formatNaira(i.total) }}</td>
                    <td
                      :class="
                        cn(
                          'py-2 text-right tabular-nums',
                          i.balance ? 'font-semibold' : 'text-faint',
                        )
                      "
                    >
                      {{ formatNaira(i.balance) }}
                    </td>
                    <td class="px-4 py-2">
                      <StatusBadge :label="i.status" :tone="financeTone(i.status)" />
                      <span v-if="i.dueNote" class="block text-xs text-faint">{{ i.dueNote }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Payments" flush>
            <p v-if="!acc.payments.length" class="px-4 py-3 text-[13px] text-muted-foreground">
              No payments yet.
            </p>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[600px] text-[13px]">
                <thead class="text-left text-xs text-faint">
                  <tr class="border-b">
                    <th class="px-4 py-2 font-medium">Receipt</th>
                    <th class="py-2 font-medium">Date</th>
                    <th class="py-2 font-medium">Method</th>
                    <th class="py-2 text-right font-medium">Amount</th>
                    <th class="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="p in acc.payments"
                    :key="p.id"
                    class="border-b border-divider last:border-0"
                  >
                    <td class="px-4 py-2">
                      <RouterLink
                        :to="{ name: r.paymentDetail.name, params: { id: p.id } }"
                        class="font-medium text-primary hover:underline"
                        >{{ p.no }}</RouterLink
                      >
                      <span class="block text-xs text-faint">{{
                        p.source === 'Parent claim' ? 'Claimed by parent' : p.recordedBy
                      }}</span>
                    </td>
                    <td class="py-2">{{ fmtDay(p.date) }}</td>
                    <td class="py-2">
                      {{ p.method
                      }}<span v-if="p.reference" class="block text-xs text-faint">{{
                        p.reference
                      }}</span>
                    </td>
                    <td class="py-2 text-right tabular-nums">{{ formatNaira(p.amount) }}</td>
                    <td class="px-4 py-2">
                      <StatusBadge :label="p.status" :tone="financeTone(p.status)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard v-if="acc.refunds.length" title="Refunds" flush>
            <ul class="divide-y divide-divider text-[13px]">
              <li
                v-for="f in acc.refunds"
                :key="f.id"
                class="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div class="flex flex-col">
                  <RouterLink
                    :to="{ name: r.refundDetail.name, params: { id: f.id } }"
                    class="font-medium text-primary hover:underline"
                    >{{ f.no }}</RouterLink
                  >
                  <span class="text-xs text-faint"
                    >{{ f.reason }} · requested {{ fmtDay(f.requestedOn) }}</span
                  >
                </div>
                <span class="tabular-nums">{{ formatNaira(f.amount) }}</span>
                <StatusBadge :label="f.status" :tone="financeTone(f.status)" />
              </li>
            </ul>
          </SectionCard>

          <SectionCard
            title="Statement of account"
            description="Charges and money received, oldest first. A positive balance is owed to the school."
            flush
          >
            <p v-if="!acc.statement.length" class="px-4 py-3 text-[13px] text-muted-foreground">
              Nothing yet.
            </p>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[620px] text-[13px]">
                <thead class="text-left text-xs text-faint">
                  <tr class="border-b">
                    <th class="px-4 py-2 font-medium">Date</th>
                    <th class="py-2 font-medium">Reference</th>
                    <th class="py-2 font-medium">Description</th>
                    <th class="py-2 text-right font-medium">Charged</th>
                    <th class="py-2 text-right font-medium">Received</th>
                    <th class="px-4 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(s, i) in acc.statement"
                    :key="i"
                    class="border-b border-divider last:border-0"
                  >
                    <td class="px-4 py-2">{{ fmtDay(s.date) }}</td>
                    <td class="py-2">{{ s.ref }}</td>
                    <td class="py-2">{{ s.description }}</td>
                    <td class="py-2 text-right tabular-nums">
                      {{ s.debit ? formatNaira(s.debit) : '' }}
                    </td>
                    <td class="py-2 text-right tabular-nums">
                      {{ s.credit ? formatNaira(s.credit) : '' }}
                    </td>
                    <td class="px-4 py-2 text-right font-medium tabular-nums">
                      {{ formatNaira(s.balance) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div class="flex flex-col gap-4">
          <PayToCard
            v-if="acc.payTo"
            :details="acc.payTo"
            :payer="acc.payer"
            :sending="sendDetails.isPending.value"
            @send="send"
          />
          <SectionCard v-else-if="!acc.outstanding" title="Nothing to pay">
            <p class="text-[13px] text-muted-foreground">
              {{ acc.name }} has no outstanding balance.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>

    <!-- Printed statement -->
    <article class="hidden text-[12px] text-black print:block">
      <header class="mb-5 flex items-start justify-between">
        <div>
          <h1 class="text-xl font-bold">{{ auth.school?.name }}</h1>
          <p>Statement of account · printed {{ fmtDay(todayIso()) }}</p>
        </div>
        <div class="text-right">
          <p class="font-semibold">{{ acc.name }} · {{ acc.admissionNo }}</p>
          <p>{{ acc.className }} · {{ acc.branch }}</p>
          <p>Fee payer: {{ acc.payer ?? '—' }}</p>
        </div>
      </header>
      <table class="mb-4 w-full border-collapse">
        <thead>
          <tr class="border-b border-black text-left">
            <th class="py-1">Date</th>
            <th class="py-1">Reference</th>
            <th class="py-1">Description</th>
            <th class="py-1 text-right">Charged</th>
            <th class="py-1 text-right">Received</th>
            <th class="py-1 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in acc.statement" :key="i" class="border-b">
            <td class="py-1">{{ fmtDay(s.date) }}</td>
            <td class="py-1">{{ s.ref }}</td>
            <td class="py-1">{{ s.description }}</td>
            <td class="py-1 text-right">{{ s.debit ? formatNaira(s.debit) : '' }}</td>
            <td class="py-1 text-right">{{ s.credit ? formatNaira(s.credit) : '' }}</td>
            <td class="py-1 text-right">{{ formatNaira(s.balance) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="font-semibold">
        Outstanding: {{ formatNaira(acc.outstanding)
        }}<span v-if="acc.credit"> · Credit: {{ formatNaira(acc.credit) }}</span>
      </p>
      <p v-if="acc.payTo" class="mt-3">
        Pay by transfer to {{ acc.payTo.bank }} · {{ acc.payTo.accountNumber }} ·
        {{ acc.payTo.accountName }}, narration <strong>{{ acc.payTo.reference }}</strong
        >.
      </p>
    </article>

    <SideDrawer
      v-model:open="refundOpen"
      title="Request a refund"
      :description="`From ${acc.name}’s ${formatNaira(acc.credit)} credit. It needs approval before it is paid out.`"
    >
      <FieldShell
        id="rf-amount"
        label="Amount (₦)"
        required
        :hint="`Up to ${formatNaira(acc.credit)}`"
      >
        <Input
          id="rf-amount"
          v-model="refund.amount"
          inputmode="numeric"
          placeholder="e.g. 10,000"
        />
      </FieldShell>
      <FieldShell id="rf-reason" label="Reason" required>
        <Input
          id="rf-reason"
          v-model="refund.reason"
          placeholder="e.g. Examination fee paid twice"
        />
      </FieldShell>
      <FieldShell
        id="rf-payto"
        label="Pay to"
        required
        hint="Bank, account and name the money goes to."
      >
        <Input
          id="rf-payto"
          v-model="refund.payTo"
          placeholder="e.g. GTBank 0123456789 · Ngozi Eze"
        />
      </FieldShell>
      <FieldShell id="rf-payment" label="Original payment" hint="Optional, for the record.">
        <select
          id="rf-payment"
          v-model="refund.paymentId"
          class="h-9 rounded-md border bg-card px-2.5 text-sm"
        >
          <option value="">Not linked</option>
          <option v-for="p in confirmedPayments" :key="p.id" :value="p.id">
            {{ p.no }} · {{ formatNaira(p.amount) }} · {{ fmtDay(p.date) }}
          </option>
        </select>
      </FieldShell>
      <template #footer>
        <Button variant="outline" @click="refundOpen = false">Cancel</Button>
        <Button
          :disabled="
            requestRefund.isPending.value || !refund.amount || !refund.reason || !refund.payTo
          "
          @click="saveRefund"
          ><Spinner v-if="requestRefund.isPending.value" /> Request refund</Button
        >
      </template>
    </SideDrawer>
  </template>
</template>
