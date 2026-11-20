import { formatNaira } from '@edutrack/app-kit/lib/format';

import type { Fees, PayOption, PayOptionKey } from '@/types';

/*
 * Paying fees in the Parent Portal: by bank transfer only. The parent picks what to pay, transfers
 * it to the school's account with the reference shown, then reports it with proof. The school
 * verifies it against the bank statement; until then it shows as pending.
 */

export const PAY_STEPS = ['What to pay', 'Transfer', 'Proof', 'Done'] as const;
export type PayStep = 0 | 1 | 2 | 3;

/** Proof of transfer: a photo, screenshot or PDF of the bank's receipt. */
export const PROOF_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_ACCEPT = Object.keys(PROOF_TYPES).join(',');

/** What is wrong with a proof file, or null when it can be sent. */
export function proofProblem(file: { name: string; size: number; type: string }): string | null {
  if (!PROOF_TYPES[file.type]) return 'Choose a photo, screenshot or PDF of the transfer receipt.';
  if (!file.size) return `“${file.name}” is empty. Choose the receipt again.`;
  if (file.size > PROOF_MAX_BYTES) return 'The receipt must be 10 MB or smaller.';
  return null;
}

/** The transfer date: not in the future, and not more than 90 days ago. */
export function transferDateProblem(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the date you made the transfer.';
  if (date > today) return 'The transfer date can’t be in the future.';
  const days = (Date.parse(today) - Date.parse(date)) / 86_400_000;
  if (days > 90) return 'For transfers older than 90 days, contact the school.';
  return null;
}

/**
 * The option the pay screen starts on: the one asked for (e.g. "Pay the overdue installment"
 * from Home), else everything outstanding.
 */
export function initialOption(options: PayOption[], wanted?: string | null): PayOptionKey | null {
  const found = options.find((o) => o.key === wanted);
  return (found ?? options[0])?.key ?? null;
}

/** Whether the parent can go on from a step. */
export function canContinue(
  step: PayStep,
  state: { option: PayOptionKey | null; proofId: string | null; paidOn: string; today: string },
): boolean {
  if (step === 0) return !!state.option;
  if (step === 1) return true;
  if (step === 2) return !!state.proofId && !transferDateProblem(state.paidOn, state.today);
  return false;
}

/** Why the Pay button is missing on the Fees screen, or null when the parent can pay. */
export function payState(fees: Pick<Fees, 'canPay' | 'payBlockedReason' | 'options' | 'totals'>) {
  if (!fees.canPay) return { canPay: false, reason: fees.payBlockedReason };
  if (!fees.options.length)
    return {
      canPay: false,
      reason:
        fees.totals.outstanding > 0 && fees.totals.pending > 0
          ? 'Your transfer is being verified. The balance updates once the school confirms it.'
          : null,
    };
  return { canPay: true, reason: null };
}

/** "Pay ₦45,000" for the Fees screen's button. */
export const payLabel = (options: PayOption[]) =>
  options[0] ? `Pay ${formatNaira(options[0].amount)}` : 'Pay';
