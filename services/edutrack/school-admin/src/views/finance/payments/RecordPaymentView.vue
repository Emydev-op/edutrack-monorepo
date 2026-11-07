<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Checkbox } from '@edutrack/ui/components/checkbox';
import { Input } from '@edutrack/ui/components/input';
import { StatusBadge } from '@edutrack/ui/components/status-badge';
import { Textarea } from '@edutrack/ui/components/textarea';
import { cn } from '@edutrack/ui/lib/utils';
import { getApiErrorMessage } from '@edutrack/web-core/http';
import { refDebounced } from '@vueuse/core';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import SearchInput from '@edutrack/app-kit/components/common/SearchInput.vue';
import SectionCard from '@edutrack/app-kit/components/common/SectionCard.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';
import FieldShell from '@edutrack/app-kit/components/form/FieldShell.vue';
import { formatNaira } from '@edutrack/app-kit/lib/format';

import {
  useCheckPaymentMutation,
  useFinanceOptionsQuery,
  useFinanceStudentsQuery,
  useInvoiceQuery,
  useRecordPaymentMutation,
  useStudentAccountQuery,
  type PaymentCheck,
} from '@/api/services/finance';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import type { PaymentDetail, PaymentMethod, PaymentPayload } from '@/types';

import { financeTone, fmtDay, todayIso } from '../finance-tones';

const f = routesPath.finance;
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const context = useContextStore();
const { data: options } = useFinanceOptionsQuery();
const check = useCheckPaymentMutation();
const record = useRecordPaymentMutation();

const STEPS = ['Payment details', 'Allocation', 'Review', 'Receipt'];
const step = ref(0);

/* ---------------- Student ---------------- */

const qs = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '');
const studentKey = ref(qs('student'));
const invoiceId = ref(qs('invoice'));
const { data: fromInvoice } = useInvoiceQuery(() => (studentKey.value ? '' : invoiceId.value));
watch(fromInvoice, (inv) => {
  if (inv && !studentKey.value) studentKey.value = inv.studentKey;
});

const search = ref('');
const debounced = refDebounced(search, 250);
const { data: matches, isFetching: searching } = useFinanceStudentsQuery(
  () => ({
    search: debounced.value || undefined,
    branch: context.current.branch,
    limit: 8,
    owing: !debounced.value,
  }),
  () => !studentKey.value,
);
const { data: account } = useStudentAccountQuery(studentKey);

function pickStudent(key: string) {
  studentKey.value = key;
  invoiceId.value = '';
  form.amount = '';
}
function changeStudent() {
  studentKey.value = '';
  invoiceId.value = '';
  step.value = 0;
  void router.replace({ query: {} });
}

/** Unpaid invoices, oldest balance first (earlier sessions before this one). */
const open = computed(() =>
  [...(account.value?.invoices ?? [])]
    .filter((i) => i.balance > 0 && i.status !== 'Draft' && i.status !== 'Cancelled')
    .sort((a, b) => (a.issuedOn ?? '').localeCompare(b.issuedOn ?? '')),
);

/* ---------------- Details ---------------- */

const form = reactive({
  amount: '',
  date: todayIso(),
  method: '' as PaymentMethod | '',
  accountId: '',
  reference: '',
  payer: '',
  note: '',
  matched: false,
});
const errors = reactive<Record<string, string>>({});
const serverError = ref('');

watch(account, (a) => {
  if (a && !form.payer) form.payer = a.payer ?? '';
});
watch(
  () => options.value?.methods,
  (m) => {
    if (m?.length && !form.method)
      form.method = m.includes('Bank transfer') ? 'Bank transfer' : m[0]!;
  },
  { immediate: true },
);

const amount = computed(() => Number(form.amount.replace(/[,\s₦]/g, '')) || 0);
const accountOptions = computed(() =>
  (options.value?.accounts ?? []).filter(
    (a) =>
      a.status === 'Active' && (form.method === 'Cash' ? a.kind === 'Cash' : a.kind === 'Bank'),
  ),
);
watch(
  [accountOptions, () => account.value?.branchId],
  ([list, branchId], [, prevBranch]) => {
    // Keep the user's choice, but pick the student's branch account once their branch is known.
    if (list.some((a) => a.id === form.accountId) && branchId === prevBranch) return;
    form.accountId =
      (list.find((a) => a.branchId === branchId) ?? list.find((a) => !a.branchId) ?? list[0])?.id ??
      '';
  },
  { immediate: true },
);
const needsRef = computed(() => ['Bank transfer', 'POS', 'Cheque'].includes(form.method));
const refLabel = computed(() =>
  form.method === 'Cheque'
    ? 'Cheque number'
    : needsRef.value
      ? 'Transaction reference'
      : 'Reference (optional)',
);
const verifies = computed(
  () => form.method === 'Bank transfer' && !!options.value?.settings.verifyTransfers,
);

function validateDetails() {
  for (const k of Object.keys(errors)) delete errors[k];
  serverError.value = '';
  if (!/^\d+$/.test(form.amount.replace(/[,\s₦]/g, '')) || amount.value <= 0)
    errors.amount = 'Enter the amount received in whole naira.';
  if (!form.date) errors.date = 'Enter the date the money was received.';
  else if (form.date > todayIso()) errors.date = 'The payment date can’t be in the future.';
  if (!form.method) errors.method = 'Choose how it was paid.';
  if (!form.accountId)
    errors.accountId =
      form.method === 'Cash'
        ? 'Add a cash account in Bank & Cash Accounts first.'
        : 'Choose the account the money went into.';
  if (needsRef.value && !form.reference.trim())
    errors.reference =
      form.method === 'Cheque'
        ? 'Enter the cheque number.'
        : 'Enter the reference from the bank alert or POS slip.';
  return !Object.keys(errors).length;
}

/* ---------------- Allocation ---------------- */

const alloc = reactive<Record<string, string>>({});
function defaultAllocation() {
  let left = amount.value;
  for (const k of Object.keys(alloc)) delete alloc[k];
  for (const inv of open.value) {
    const take = Math.max(0, Math.min(left, inv.balance));
    alloc[inv.id] = take ? String(take) : '';
    left -= take;
  }
}
const allocNum = (id: string) => Number((alloc[id] ?? '').replace(/[,\s]/g, '')) || 0;
const allocated = computed(() => open.value.reduce((n, i) => n + allocNum(i.id), 0));
const leftover = computed(() => amount.value - allocated.value);
const allocError = computed(() => {
  const over = open.value.find((i) => allocNum(i.id) > i.balance);
  if (over) return `${over.no} only has ${formatNaira(over.balance)} left to pay.`;
  if (open.value.some((i) => !/^\d*$/.test((alloc[i.id] ?? '').replace(/[,\s]/g, ''))))
    return 'Allocations must be whole naira.';
  if (leftover.value < 0)
    return `You’ve allocated ${formatNaira(-leftover.value)} more than was received.`;
  return '';
});

/* ---------------- Steps ---------------- */

const payload = computed<PaymentPayload>(() => ({
  studentKey: studentKey.value,
  amount: amount.value,
  date: form.date,
  method: form.method as PaymentMethod,
  accountId: form.accountId,
  reference: form.reference.trim(),
  payer: form.payer.trim(),
  note: form.note.trim(),
  allocations: open.value
    .filter((i) => allocNum(i.id) > 0)
    .map((i) => ({ invoiceId: i.id, amount: allocNum(i.id) })),
  matched: form.method === 'Bank transfer' && form.matched,
}));

const review = ref<PaymentCheck | null>(null);
const receipt = ref<PaymentDetail | null>(null);

async function next() {
  serverError.value = '';
  if (step.value === 0) {
    if (!validateDetails()) return;
    defaultAllocation();
    step.value = open.value.length ? 1 : 2;
    if (step.value === 2) await runCheck();
    return;
  }
  if (step.value === 1) {
    if (allocError.value) return;
    step.value = 2;
    await runCheck();
  }
}
async function runCheck() {
  review.value = null;
  try {
    review.value = await check.mutateAsync(payload.value);
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t check this payment. Try again.');
  }
}
function back() {
  serverError.value = '';
  step.value = step.value === 2 && !open.value.length ? 0 : step.value - 1;
}
async function save() {
  serverError.value = '';
  try {
    receipt.value = await record.mutateAsync(payload.value);
    step.value = 3;
  } catch (e) {
    serverError.value = getApiErrorMessage(e, 'We couldn’t record this payment. Try again.');
  }
}
function recordAnother() {
  receipt.value = null;
  review.value = null;
  Object.assign(form, {
    amount: '',
    reference: '',
    note: '',
    matched: false,
    date: todayIso(),
    payer: '',
  });
  changeStudent();
}

const printReceipt = () => window.print();
const firstInvoice = computed(() => receipt.value?.allocations[0]?.invoiceId ?? invoiceId.value);
</script>

<template>
  <div class="print:hidden">
    <PageHeader
      title="Record payment"
      :description="
        account
          ? `${account.name} · fee payer ${account.payer ?? 'not linked'} · outstanding ${formatNaira(account.outstanding)}`
          : 'Money the school has received for a student’s fees. EduTrack doesn’t collect money; record what reached the school’s account or cash office.'
      "
    />
  </div>

  <div class="print:hidden">
    <StepIndicator :steps="STEPS" :current="step" />
  </div>

  <!-- Student picker -->
  <SectionCard
    v-if="!studentKey"
    title="Who is this payment for?"
    description="Search by student, admission number or fee payer. Students who owe most are listed first."
    class="max-w-3xl"
  >
    <SearchInput v-model="search" placeholder="e.g. Emmanuel Adeyemi or STU-2025-0042" />
    <ul class="mt-3 flex flex-col divide-y divide-divider rounded-lg border">
      <li
        v-if="searching && !matches?.length"
        class="px-3.5 py-3 text-[13px] text-muted-foreground"
      >
        Searching…
      </li>
      <li v-else-if="!matches?.length" class="px-3.5 py-3 text-[13px] text-muted-foreground">
        No students match.
      </li>
      <li v-for="m in matches" :key="m.studentKey">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-[13px] hover:bg-muted"
          @click="pickStudent(m.studentKey)"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-medium">{{ m.name }}</span>
            <span class="truncate text-xs text-faint"
              >{{ m.admissionNo }} · {{ m.className }} · {{ m.payer ?? 'No guardian linked' }}</span
            >
          </span>
          <span class="flex shrink-0 flex-col items-end">
            <span
              :class="
                cn('tabular-nums', m.outstanding ? 'font-medium text-error-strong' : 'text-faint')
              "
              >{{ m.outstanding ? formatNaira(m.outstanding) : 'Nothing owed' }}</span
            >
            <span v-if="m.credit" class="text-xs text-success-strong"
              >{{ formatNaira(m.credit) }} credit</span
            >
          </span>
        </button>
      </li>
    </ul>
  </SectionCard>

  <template v-else-if="account">
    <!-- Info strip -->
    <div
      v-if="step < 3"
      class="grid grid-cols-2 gap-3 rounded-lg border bg-card px-4 py-3 text-[13px] sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto] sm:items-center"
    >
      <span class="flex flex-col">
        <span class="font-medium">{{ account.name }}</span>
        <span class="text-xs text-faint">{{ account.admissionNo }} · {{ account.className }}</span>
      </span>
      <span class="flex flex-col">
        <span class="text-xs text-faint">Fee payer</span>
        <span>{{ account.payer ?? 'No guardian linked' }}</span>
      </span>
      <span class="flex flex-col">
        <span class="text-xs text-faint">Outstanding</span>
        <span
          :class="
            cn(
              'font-semibold tabular-nums',
              account.outstanding ? 'text-error-strong' : 'text-success-strong',
            )
          "
          >{{ formatNaira(account.outstanding) }}</span
        >
      </span>
      <span class="flex flex-col">
        <span class="text-xs text-faint">Credit · pending</span>
        <span class="tabular-nums"
          >{{ formatNaira(account.credit) }} · {{ formatNaira(account.pending) }}</span
        >
      </span>
      <Button v-if="step === 0" variant="ghost" size="sm" @click="changeStudent">Change</Button>
    </div>

    <InlineNotice
      v-if="account.pending && step < 3"
      tone="warning"
      :title="`${formatNaira(account.pending)} already waiting for verification`"
      description="Check it isn’t the same money before recording it again. Verify or reject it from Payments › Awaiting verification."
    />

    <!-- Step 1 · details -->
    <SectionCard v-if="step === 0" title="Payment details" class="max-w-3xl">
      <div class="grid gap-3.5 sm:grid-cols-2">
        <FieldShell
          id="rp-amount"
          label="Amount received (₦)"
          required
          :error="errors.amount"
          :hint="
            amount > account.outstanding && account.outstanding
              ? `${formatNaira(amount - account.outstanding)} more than owed becomes credit on the account.`
              : undefined
          "
          hint-tone="warning"
        >
          <Input
            id="rp-amount"
            v-model="form.amount"
            inputmode="numeric"
            placeholder="e.g. 80000"
            class="text-base tabular-nums"
            :aria-invalid="!!errors.amount"
          />
        </FieldShell>
        <div class="flex items-end pb-1">
          <Button
            v-if="account.outstanding"
            variant="link"
            size="sm"
            class="px-0"
            @click="form.amount = String(account.outstanding)"
            >Use full balance {{ formatNaira(account.outstanding) }}</Button
          >
        </div>
        <FieldShell id="rp-date" label="Date received" required :error="errors.date">
          <Input
            id="rp-date"
            v-model="form.date"
            type="date"
            :max="todayIso()"
            :aria-invalid="!!errors.date"
          />
        </FieldShell>
        <FieldShell id="rp-payer" label="Paid by">
          <Input
            id="rp-payer"
            v-model="form.payer"
            :placeholder="account.payer ?? 'e.g. Mrs. Funke Adeyemi'"
          />
        </FieldShell>
        <FieldShell
          id="rp-method"
          label="Method"
          required
          :error="errors.method"
          class="sm:col-span-2"
        >
          <div id="rp-method" role="radiogroup" aria-label="Method" class="flex flex-wrap gap-2">
            <button
              v-for="m in options?.methods ?? []"
              :key="m"
              type="button"
              role="radio"
              :aria-checked="form.method === m"
              :class="
                cn(
                  'rounded-md border px-3 py-1.5 text-[13px]',
                  form.method === m ? 'border-primary bg-secondary font-medium' : 'hover:bg-muted',
                )
              "
              @click="form.method = m"
            >
              {{ m }}
            </button>
          </div>
        </FieldShell>
        <FieldShell id="rp-account" label="Paid into" required :error="errors.accountId">
          <select
            id="rp-account"
            v-model="form.accountId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
            :aria-invalid="!!errors.accountId"
          >
            <option value="">Choose…</option>
            <option v-for="a in accountOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </FieldShell>
        <FieldShell id="rp-ref" :label="refLabel" :required="needsRef" :error="errors.reference">
          <Input
            id="rp-ref"
            v-model="form.reference"
            :placeholder="form.method === 'Cheque' ? 'e.g. 004512' : 'e.g. GTB/NIP/40112873'"
            :aria-invalid="!!errors.reference"
          />
        </FieldShell>
        <FieldShell id="rp-note" label="Note" class="sm:col-span-2">
          <Textarea
            id="rp-note"
            v-model="form.note"
            rows="2"
            placeholder="Optional, e.g. paid at the bursary"
          />
        </FieldShell>
        <label v-if="verifies" class="flex items-start gap-2.5 text-[13px] sm:col-span-2">
          <Checkbox v-model="form.matched" class="mt-0.5" />
          <span
            >I’ve matched this on the bank statement (confirm now).
            <span class="block text-xs text-muted-foreground"
              >Otherwise it waits in Awaiting verification and the balance doesn’t change yet.</span
            ></span
          >
        </label>
      </div>
    </SectionCard>

    <!-- Step 2 · allocation -->
    <SectionCard
      v-else-if="step === 1"
      :title="`Allocate ${formatNaira(amount)}`"
      description="Oldest balance first, as set in Finance settings. Change the split if the payer asked."
      class="max-w-3xl"
      flush
    >
      <table class="w-full text-[13px]">
        <thead class="text-left text-xs text-faint">
          <tr class="border-b border-divider">
            <th class="px-4 py-2 font-medium">Invoice</th>
            <th class="px-4 py-2 text-right font-medium">Balance</th>
            <th class="w-40 px-4 py-2 text-right font-medium">Allocate (₦)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in open" :key="inv.id" class="border-b border-divider last:border-0">
            <td class="px-4 py-2.5">
              <span class="flex flex-col">
                <span class="font-medium">{{ inv.no }} · {{ inv.session }} {{ inv.term }}</span>
                <span :class="cn('text-xs', inv.overdue ? 'text-error-strong' : 'text-faint')">{{
                  inv.dueNote || `Due ${fmtDay(inv.dueOn)}`
                }}</span>
              </span>
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatNaira(inv.balance) }}</td>
            <td class="px-4 py-2.5">
              <Input
                v-model="alloc[inv.id]"
                inputmode="numeric"
                placeholder="0"
                class="text-right tabular-nums"
                :aria-label="`Amount for ${inv.no}`"
                :aria-invalid="allocNum(inv.id) > inv.balance"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div class="flex flex-col gap-1 border-t border-divider px-4 py-3 text-[13px]">
        <p v-if="allocError" role="alert" class="text-error-strong">{{ allocError }}</p>
        <p v-else-if="leftover > 0" class="text-warning-strong">
          {{ formatNaira(leftover) }} left over becomes credit on the account, to apply later or
          refund.
        </p>
        <p v-else class="text-success-strong">Fully allocated.</p>
      </div>
    </SectionCard>

    <!-- Step 3 · review -->
    <SectionCard v-else-if="step === 2" title="Review payment" class="max-w-3xl">
      <p v-if="check.isPending.value" class="text-[13px] text-muted-foreground">Checking…</p>
      <dl
        v-else-if="review"
        class="grid grid-cols-[minmax(150px,auto)_1fr] gap-x-4 gap-y-2.5 text-[13px]"
      >
        <dt class="text-faint">Amount</dt>
        <dd class="font-semibold tabular-nums">{{ formatNaira(amount) }}</dd>
        <dt class="text-faint">Method</dt>
        <dd>{{ form.method }}{{ form.reference ? ` · ${form.reference}` : '' }}</dd>
        <dt class="text-faint">Paid into</dt>
        <dd>{{ accountOptions.find((a) => a.id === form.accountId)?.name }}</dd>
        <dt class="text-faint">Date</dt>
        <dd>{{ fmtDay(form.date) }}</dd>
        <dt class="text-faint">Status after saving</dt>
        <dd>
          <StatusBadge :label="review.status" :tone="financeTone(review.status)" />
          <span
            v-if="review.status === 'Pending verification'"
            class="mt-1 block text-xs text-muted-foreground"
            >Balances change once it’s verified on the bank statement.</span
          >
        </dd>
        <template v-for="a in review.allocations" :key="a.invoiceId">
          <dt class="text-faint">{{ a.no }}</dt>
          <dd class="tabular-nums">
            {{ formatNaira(a.before) }} → {{ formatNaira(a.after) }}
            <span class="text-xs text-faint">({{ formatNaira(a.amount) }} here)</span>
          </dd>
        </template>
        <template v-if="review.credit">
          <dt class="text-faint">Credit on account</dt>
          <dd class="tabular-nums">+ {{ formatNaira(review.credit) }}</dd>
        </template>
        <dt class="text-faint">Receipt</dt>
        <dd>
          {{
            account.payer ? `Sent to ${account.payer} by email and SMS` : 'No guardian to send to'
          }}
        </dd>
        <dt class="text-faint">Record</dt>
        <dd>Permanent. Mistakes are corrected with a refund, not by deleting.</dd>
      </dl>
    </SectionCard>

    <!-- Step 4 · receipt -->
    <section
      v-else-if="receipt"
      class="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-lg border bg-card px-6 py-5 print:border-0"
    >
      <header class="flex items-start justify-between gap-3 border-b border-divider pb-3">
        <div class="flex flex-col">
          <span class="text-[15px] font-semibold">{{ auth.school?.name ?? 'School' }}</span>
          <span class="text-xs text-muted-foreground">Official receipt</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="font-semibold tabular-nums">{{ receipt.no }}</span>
          <StatusBadge :label="receipt.status" :tone="financeTone(receipt.status)" />
        </div>
      </header>
      <dl class="grid grid-cols-[minmax(130px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
        <dt class="text-faint">Received from</dt>
        <dd>{{ receipt.payer }}</dd>
        <dt class="text-faint">For</dt>
        <dd>{{ receipt.student }} · {{ receipt.className }}</dd>
        <dt class="text-faint">Amount</dt>
        <dd class="text-base font-semibold tabular-nums">{{ formatNaira(receipt.amount) }}</dd>
        <dt class="text-faint">Method</dt>
        <dd>{{ receipt.method }}{{ receipt.reference ? ` · ${receipt.reference}` : '' }}</dd>
        <dt class="text-faint">Date</dt>
        <dd>{{ fmtDay(receipt.date) }}</dd>
        <template v-for="a in receipt.allocations" :key="a.invoiceId">
          <dt class="text-faint">{{ a.no }}</dt>
          <dd class="tabular-nums">
            {{ formatNaira(a.amount) }} · balance now {{ formatNaira(a.balanceAfter) }}
          </dd>
        </template>
        <template v-if="receipt.unallocated">
          <dt class="text-faint">Credit on account</dt>
          <dd class="tabular-nums">{{ formatNaira(receipt.unallocated) }}</dd>
        </template>
        <dt class="text-faint">Total still owed</dt>
        <dd class="font-medium tabular-nums">{{ formatNaira(receipt.balanceNow) }}</dd>
      </dl>
      <p v-if="receipt.status === 'Pending verification'" class="text-xs text-warning-strong">
        Pending verification. Balances update once the transfer is found on the bank statement.
      </p>
      <div class="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" size="sm" @click="printReceipt">Print receipt</Button>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: f.paymentDetail.name, params: { id: receipt.id } }"
            >View receipt page</RouterLink
          ></Button
        >
        <Button v-if="firstInvoice" as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: f.invoiceDetail.name, params: { id: firstInvoice } }"
            >Back to invoice</RouterLink
          ></Button
        >
        <Button size="sm" @click="recordAnother">Record another</Button>
      </div>
    </section>

    <p v-if="serverError" role="alert" class="max-w-3xl text-[13px] text-error-strong">
      {{ serverError }}
    </p>

    <footer v-if="step < 3" class="flex max-w-3xl justify-between gap-2">
      <Button v-if="step > 0" variant="outline" @click="back">Back</Button>
      <Button v-else as-child variant="outline"
        ><RouterLink :to="{ name: f.payments.name }">Cancel</RouterLink></Button
      >
      <Button v-if="step < 2" :disabled="step === 1 && !!allocError" @click="next">Continue</Button>
      <Button v-else :disabled="!review || record.isPending.value" @click="save"
        >Confirm and issue receipt</Button
      >
    </footer>
  </template>
  <p v-else class="text-[13px] text-muted-foreground">Loading the student’s account…</p>
</template>
