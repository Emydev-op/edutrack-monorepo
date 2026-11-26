import { messageOf } from '@edutrack/web-core/http';
import { toast } from 'vue-sonner';

import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  useCancelExeatMutation,
  useDecideExeatMutation,
  useSignInMutation,
} from '@/api/services/boarding-house';
import type { Exeat } from '@/types';

import { pickupLabel } from './house-format';

/**
 * Approve, decline, cancel and sign in an exeat, each behind a confirmation. Errors (someone
 * else decided it first: 409 EXEAT_DECIDED / EXEAT_CHANGED) show in the dialog.
 */
export function useExeatActions() {
  const confirm = useConfirm();
  const decide = useDecideExeatMutation();
  const cancel = useCancelExeatMutation();
  const signIn = useSignInMutation();

  const details = (e: Exeat): [string, string][] => [
    ['Boarder', `${e.student.name} · ${e.student.className}`],
    ['Kind', e.kind],
    ['Leaves', e.leaves],
    ['Back by', e.returns],
    ['Collected by', pickupLabel(e)],
    ...(e.reason ? [['Reason', e.reason] as [string, string]] : []),
  ];

  const approve = (e: Exeat) =>
    confirm({
      title: `Approve ${e.student.name}’s exeat?`,
      description: 'Their parents are told, and the gate sees them in Leaving.',
      details: details(e),
      input: { label: 'Note', placeholder: 'Optional, e.g. Return before prep' },
      confirmLabel: 'Approve',
      action: async ({ text }) => {
        const r = await decide.mutateAsync({
          id: e.id,
          approve: true,
          note: text.trim() || undefined,
        });
        toast.success(messageOf(r, `${e.student.name}’s exeat approved.`));
      },
    });

  const decline = (e: Exeat) =>
    confirm({
      title: `Decline ${e.student.name}’s exeat?`,
      description: 'Their parents see the reason.',
      details: details(e),
      input: { label: 'Reason', placeholder: 'e.g. Mid-term tests that weekend', required: true },
      confirmLabel: 'Decline',
      tone: 'destructive',
      action: async ({ text }) => {
        const r = await decide.mutateAsync({ id: e.id, approve: false, note: text.trim() });
        toast.success(messageOf(r, `${e.student.name}’s exeat declined.`));
      },
    });

  const cancelExeat = (e: Exeat) =>
    confirm({
      title: `Cancel ${e.student.name}’s exeat?`,
      description: 'The boarder stays in school. Their parents are told.',
      details: details(e),
      confirmLabel: 'Cancel exeat',
      cancelLabel: 'Keep it',
      tone: 'destructive',
      action: async () => {
        const r = await cancel.mutateAsync(e.id);
        toast.success(messageOf(r, `${e.student.name}’s exeat cancelled.`));
      },
    });

  const signBackIn = (e: Exeat) =>
    confirm({
      title: `Sign ${e.student.name} back in?`,
      description: e.overdue
        ? `They were due back ${e.returns}. This return is marked late.`
        : 'Their parents are told they’re back in school.',
      details: [
        ['Boarder', `${e.student.name} · ${e.student.className}`],
        ['Back by', e.returns],
        ...(e.collectedBy ? [['Collected by', e.collectedBy] as [string, string]] : []),
      ],
      confirmLabel: 'Sign in',
      action: async () => {
        const r = await signIn.mutateAsync(e.id);
        toast.success(messageOf(r, `${e.student.name} signed back in.`));
      },
    });

  return { approve, decline, cancel: cancelExeat, signIn: signBackIn };
}
