<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Input } from '@edutrack/ui/components/input';
import { Label } from '@edutrack/ui/components/label';
import { Spinner } from '@edutrack/ui/components/spinner';
import { CheckIcon, CopyIcon, PaperclipIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';

import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import StepIndicator from '@edutrack/app-kit/components/common/StepIndicator.vue';

import { useFeeClaimMutation, useFeesQuery, useUploadMutation } from '@/api/services/parent';
import PageTitle from '@/components/common/PageTitle.vue';
import QueryState from '@/components/common/QueryState.vue';
import { useCurrentChild } from '@/composables/useCurrentChild';
import { fieldErrorsOf, getApiErrorMessage } from '@/lib/api-errors';
import { naira } from '@/lib/money';
import {
  canContinue,
  initialOption,
  PAY_STEPS,
  PROOF_ACCEPT,
  proofProblem,
  transferDateProblem,
  type PayStep,
} from '@/lib/pay';
import { routesPath } from '@/router/routes-path';
import type { FeeClaimResult, FileRef, PayOptionKey } from '@/types';

/**
 * Paying fees: by bank transfer only. Pick what to pay, transfer it to the school's account with
 * the reference shown, then report it with a photo or PDF of the receipt. It stays "Pending
 * verification" until the school confirms it against the bank statement.
 */
const route = useRoute();
const router = useRouter();
const { overview, child, id } = useCurrentChild();
const q = useFeesQuery(id);
const upload = useUploadMutation();
const claim = useFeeClaimMutation(id);

const f = computed(() => q.data.value);
const today = computed(() => overview.data.value?.today ?? new Date().toISOString().slice(0, 10));
const step = ref<PayStep>(0);
const option = ref<PayOptionKey | null>(null);
const proof = ref<FileRef | null>(null);
const proofError = ref('');
const paidOn = ref(today.value);
const reference = ref('');
const accountId = ref<string | null>(null);
const failure = ref('');
const done = ref<FeeClaimResult | null>(null);
const copied = ref('');

// Start on what was asked for (Home's "Pay now"), and reset when the child changes.
watch(
  f,
  (fees) => {
    if (!fees || done.value) return;
    if (!option.value || !fees.options.some((o) => o.key === option.value))
      option.value = initialOption(fees.options, route.query.option as string | undefined);
    accountId.value ??= fees.payTo?.accounts[0]?.id ?? null;
  },
  { immediate: true },
);
watch(id, () => {
  step.value = 0;
  option.value = null;
  proof.value = null;
  done.value = null;
});

const chosen = computed(() => f.value?.options.find((o) => o.key === option.value) ?? null);
const dateProblem = computed(() => transferDateProblem(paidOn.value, today.value));
const ready = computed(() =>
  canContinue(step.value, {
    option: option.value,
    proofId: proof.value?.id ?? null,
    paidOn: paidOn.value,
    today: today.value,
  }),
);

async function copy(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = value;
    toast.success(`${what} copied`);
  } catch {
    // Clipboard blocked: the number is on screen to copy by hand.
  }
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

async function pickProof(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  proofError.value = proofProblem(file) ?? '';
  if (proofError.value) return;
  try {
    proof.value = await upload.mutateAsync({ name: file.name, dataUrl: await readAsDataUrl(file) });
  } catch (err) {
    proofError.value = getApiErrorMessage(err, 'The receipt didn’t upload. Try again.');
  }
}

async function submit() {
  if (!option.value || !proof.value) return;
  failure.value = '';
  try {
    done.value = await claim.mutateAsync({
      option: option.value,
      paidOn: paidOn.value,
      proofFileId: proof.value.id,
      accountId: accountId.value ?? undefined,
      reference: reference.value.trim() || undefined,
    });
    step.value = 3;
  } catch (err) {
    const fields = fieldErrorsOf(err);
    if (fields.proofFileId) {
      proof.value = null;
      proofError.value = fields.proofFileId;
    } else failure.value = getApiErrorMessage(err, 'We couldn’t send this. Try again.');
  }
}

function back() {
  if (step.value === 0) void router.push({ name: routesPath.fees.view.name });
  else step.value = (step.value - 1) as PayStep;
}
</script>

<template>
  <PageTitle title="Pay fees" :sub="child ? `${child.name} · ${child.className}` : null" />
  <QueryState v-if="!f" :loading="q.isPending.value" :error="q.error.value" @retry="q.refetch()" />

  <template v-else-if="step === 3 && done">
    <div class="flex flex-col items-start gap-2 rounded-lg border bg-card p-4">
      <span
        class="flex size-10 items-center justify-center rounded-full bg-success-subtle text-success-strong"
        ><CheckIcon class="size-5"
      /></span>
      <span class="text-base font-semibold">{{ naira(done.amount) }} transfer reported</span>
      <span class="text-[13px] text-muted-foreground">Reference {{ done.number }}.</span>
      <span class="text-[13px] text-warning-strong">
        Pending verification by the school. Your balance updates once it’s confirmed, and you’ll get
        a receipt.
      </span>
      <Button as-child variant="outline" size="lg" class="mt-1 h-11">
        <RouterLink :to="{ name: routesPath.fees.view.name }">Back to fees</RouterLink>
      </Button>
    </div>
  </template>

  <template v-else-if="!f.canPay || !f.options.length || !f.payTo">
    <InlineNotice
      tone="neutral"
      :title="f.totals.outstanding > 0 ? 'You can’t pay here right now' : 'Nothing to pay'"
      :description="
        f.payBlockedReason ??
        (f.totals.pending > 0
          ? 'Your transfer is being verified. The balance updates once the school confirms it.'
          : `There’s nothing outstanding for ${child?.firstName ?? 'this child'}.`)
      "
    />
    <Button as-child variant="outline" size="lg">
      <RouterLink :to="{ name: routesPath.fees.view.name }">Back to fees</RouterLink>
    </Button>
  </template>

  <template v-else>
    <StepIndicator :steps="[...PAY_STEPS]" :current="step" size="sm" />
    <div class="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <!-- 1. What to pay -->
      <template v-if="step === 0">
        <span class="font-semibold">What would you like to pay?</span>
        <div role="radiogroup" aria-label="What to pay" class="flex flex-col gap-2">
          <button
            v-for="o in f.options"
            :key="o.key"
            type="button"
            role="radio"
            :aria-checked="option === o.key"
            class="flex min-h-14 flex-col rounded-lg border-[1.5px] px-3 py-2.5 text-left"
            :class="option === o.key ? 'border-primary bg-brand-tint' : 'border-border bg-card'"
            @click="option = o.key"
          >
            <span class="font-medium">{{ o.label }}</span>
            <span class="text-xs text-muted-foreground">{{ o.detail }}</span>
          </button>
        </div>
        <p class="text-xs text-muted-foreground">
          Payments go to the oldest balance first. Pay by bank transfer to the school’s account.
        </p>
      </template>

      <!-- 2. Transfer -->
      <template v-else-if="step === 1 && chosen">
        <span class="font-semibold">Transfer {{ naira(chosen.amount) }}</span>
        <div
          v-for="a in f.payTo.accounts"
          :key="a.id"
          class="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5 text-[13px]"
        >
          <span class="text-faint">{{ a.bank }}</span>
          <span class="flex items-center justify-between gap-2">
            <span class="text-lg font-semibold tracking-wide tabular-nums">{{
              a.accountNumber
            }}</span>
            <Button
              variant="outline"
              size="sm"
              :aria-label="`Copy account number ${a.accountNumber}`"
              @click="copy(a.accountNumber, 'Account number')"
              ><CopyIcon /> Copy</Button
            >
          </span>
          <span>{{ a.accountName }}</span>
        </div>
        <div
          class="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-[13px]"
        >
          <span class="flex flex-col">
            <span class="text-faint">Use this as the narration (reference)</span>
            <span class="font-semibold">{{ f.payTo.reference }}</span>
          </span>
          <Button variant="outline" size="sm" @click="copy(f.payTo.reference, 'Reference')"
            ><CopyIcon /> Copy</Button
          >
        </div>
        <p class="text-xs text-pretty text-muted-foreground">
          After you transfer, tell the school with a photo or PDF of the receipt. It shows as
          pending until the school verifies it against its bank statement.
        </p>
      </template>

      <!-- 3. Proof -->
      <template v-else-if="step === 2 && chosen">
        <span class="font-semibold">Upload proof of transfer · {{ naira(chosen.amount) }}</span>
        <label
          class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed border-[#D9CBB5] bg-[#FCF8F1] p-5 text-center"
        >
          <input type="file" class="sr-only" :accept="PROOF_ACCEPT" @change="pickProof" />
          <Spinner v-if="upload.isPending.value" />
          <PaperclipIcon v-else class="size-5 text-primary" aria-hidden="true" />
          <span class="font-medium">{{
            proof ? 'Choose a different file' : 'Take a photo or choose a file'
          }}</span>
          <span class="text-xs text-muted-foreground">{{
            upload.isPending.value
              ? 'Uploading…'
              : proof
                ? `${proof.name} · ${Math.max(1, Math.round(proof.bytes / 1024))} KB`
                : 'Photo, screenshot or PDF of the receipt · up to 10 MB'
          }}</span>
        </label>
        <p v-if="proofError" role="alert" class="text-[13px] text-error-strong">{{ proofError }}</p>
        <div class="flex flex-col gap-1.5">
          <Label for="paid-on">Date of the transfer</Label>
          <Input id="paid-on" v-model="paidOn" type="date" :max="today" />
          <span v-if="dateProblem" class="text-xs text-error-strong">{{ dateProblem }}</span>
        </div>
        <div v-if="f.payTo.accounts.length > 1" class="flex flex-col gap-1.5">
          <Label for="account">Account you paid into</Label>
          <select
            id="account"
            v-model="accountId"
            class="h-9 rounded-md border bg-card px-2.5 text-sm"
          >
            <option v-for="a in f.payTo.accounts" :key="a.id" :value="a.id">
              {{ a.bank }} · {{ a.accountNumber }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="reference">Bank reference (optional)</Label>
          <Input
            id="reference"
            v-model="reference"
            maxlength="120"
            :placeholder="`e.g. ${f.payTo.reference} or the bank’s transaction ID`"
          />
        </div>
        <InlineNotice
          v-if="failure"
          tone="error"
          title="We couldn’t send this."
          :description="failure"
          role="alert"
        />
      </template>

      <div class="flex gap-2 pt-1">
        <Button variant="outline" size="lg" class="h-12 flex-1" @click="back">Back</Button>
        <Button
          v-if="step < 2"
          size="lg"
          class="h-12 flex-[2]"
          :disabled="!ready"
          @click="step = (step + 1) as PayStep"
          >{{ step === 1 ? 'I’ve made the transfer' : 'Continue' }}</Button
        >
        <Button
          v-else
          size="lg"
          class="h-12 flex-[2]"
          :disabled="!ready || claim.isPending.value || upload.isPending.value"
          @click="submit"
        >
          <Spinner v-if="claim.isPending.value" />
          Send to the school
        </Button>
      </div>
    </div>
  </template>
</template>
