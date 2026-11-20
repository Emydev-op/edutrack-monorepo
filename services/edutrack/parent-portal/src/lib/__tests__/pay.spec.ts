import { describe, expect, it } from 'vitest';

import type { PayOption } from '@/types';

import {
  canContinue,
  initialOption,
  payLabel,
  payState,
  proofProblem,
  transferDateProblem,
} from '../pay';

const options: PayOption[] = [
  {
    key: 'all',
    label: 'Everything outstanding · ₦85,000',
    detail: 'Oldest balance first',
    amount: 85000,
  },
  { key: 'overdue', label: 'Overdue installment · ₦40,000', detail: 'First Term', amount: 40000 },
];
const today = '2026-11-20';

describe('pay helpers', () => {
  it('accepts photos and PDFs of the receipt up to 10 MB', () => {
    expect(proofProblem({ name: 'r.jpg', size: 2048, type: 'image/jpeg' })).toBeNull();
    expect(proofProblem({ name: 'r.pdf', size: 2048, type: 'application/pdf' })).toBeNull();
    expect(proofProblem({ name: 'r.docx', size: 2048, type: 'application/msword' })).toMatch(
      /photo, screenshot or PDF/,
    );
    expect(proofProblem({ name: 'r.png', size: 0, type: 'image/png' })).toMatch(/empty/);
    expect(proofProblem({ name: 'r.png', size: 11 * 1024 * 1024, type: 'image/png' })).toMatch(
      /10 MB/,
    );
  });

  it('checks the transfer date', () => {
    expect(transferDateProblem('2026-11-19', today)).toBeNull();
    expect(transferDateProblem(today, today)).toBeNull();
    expect(transferDateProblem('2026-11-21', today)).toMatch(/future/);
    expect(transferDateProblem('2026-06-01', today)).toMatch(/90 days/);
    expect(transferDateProblem('', today)).toMatch(/date/);
  });

  it('starts on the option asked for, else everything outstanding', () => {
    expect(initialOption(options, 'overdue')).toBe('overdue');
    expect(initialOption(options, 'previous')).toBe('all');
    expect(initialOption([], 'all')).toBeNull();
  });

  it('only goes on when the step is complete', () => {
    const base = { option: 'all' as const, proofId: null, paidOn: today, today };
    expect(canContinue(0, base)).toBe(true);
    expect(canContinue(0, { ...base, option: null })).toBe(false);
    expect(canContinue(1, base)).toBe(true);
    expect(canContinue(2, base)).toBe(false);
    expect(canContinue(2, { ...base, proofId: 'file-1' })).toBe(true);
    expect(canContinue(2, { ...base, proofId: 'file-1', paidOn: '2027-01-01' })).toBe(false);
  });

  it('explains why a parent can’t pay', () => {
    const totals = { outstanding: 85000, pending: 0, overdue: true, credit: 0 };
    expect(payState({ canPay: true, payBlockedReason: null, options, totals })).toEqual({
      canPay: true,
      reason: null,
    });
    expect(
      payState({ canPay: false, payBlockedReason: 'Another guardian pays', options: [], totals }),
    ).toEqual({ canPay: false, reason: 'Another guardian pays' });
    expect(
      payState({
        canPay: true,
        payBlockedReason: null,
        options: [],
        totals: { ...totals, pending: 85000 },
      }).reason,
    ).toMatch(/being verified/);
    expect(payLabel(options)).toBe('Pay ₦85,000');
  });
});
