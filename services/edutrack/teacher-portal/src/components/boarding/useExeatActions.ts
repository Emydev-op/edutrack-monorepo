import { toast } from 'vue-sonner';

import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';

import {
  loadPickups,
  useCancelExeatMutation,
  useDecideExeatMutation,
  useSignInMutation,
  useSignOutMutation,
} from '@/api/services/boarding';
import { getApiErrorMessage } from '@/lib/api-errors';
import type { Exeat } from '@/types';

/** Approve, decline, cancel and gate sign-out / sign-in for an exeat, each behind a dialog. */
export function useExeatActions() {
  const confirm = useConfirm();
  const decide = useDecideExeatMutation();
  const cancelExeat = useCancelExeatMutation();
  const signOut = useSignOutMutation();
  const signIn = useSignInMutation();

  const details = (e: Exeat): [string, string][] => [
    ['Boarder', `${e.student.name} · ${e.student.className}`],
    ['Kind', e.kind],
    ['Leaves', e.leaves],
    ['Back by', e.returns],
    ...(e.reason ? ([['Reason', e.reason]] as [string, string][]) : []),
  ];

  const approve = (e: Exeat) =>
    confirm({
      title: `Approve ${e.student.name}’s exeat?`,
      description: 'Their parents are told, and the gate sees them in Leaving.',
      details: details(e),
      input: { label: 'Note (optional)', placeholder: 'e.g. Back before prep, please' },
      confirmLabel: 'Approve',
      action: async ({ text }) => {
        await decide.mutateAsync({ id: e.id, approve: true, note: text.trim() || undefined });
        toast.success('Exeat approved', { description: `${e.student.name}’s parents are told.` });
      },
    });

  const decline = (e: Exeat) =>
    confirm({
      title: `Decline ${e.student.name}’s exeat?`,
      description: 'Their parents see your reason.',
      details: details(e),
      input: { label: 'Reason', placeholder: 'e.g. Mid-term tests on Monday', required: true },
      confirmLabel: 'Decline',
      tone: 'destructive',
      action: async ({ text }) => {
        await decide.mutateAsync({ id: e.id, approve: false, note: text.trim() });
        toast.success('Exeat declined', { description: `${e.student.name}’s parents are told.` });
      },
    });

  const cancel = (e: Exeat) =>
    confirm({
      title: `Cancel ${e.student.name}’s exeat?`,
      description: 'The boarder stays in school. Their parents are told.',
      details: details(e),
      confirmLabel: 'Cancel exeat',
      cancelLabel: 'Keep it',
      tone: 'destructive',
      action: async () => {
        await cancelExeat.mutateAsync(e.id);
        toast.success('Exeat cancelled');
      },
    });

  /** Who may collect: the exeat's collectors, plus approved pickup people for a term break. */
  async function collectorsOf(e: Exeat) {
    const options = e.collectors.map((c) => ({
      value: c.key,
      label: c.name,
      description: c.relationship,
    }));
    if (e.kind !== 'Term break') return options;
    try {
      for (const p of await loadPickups(e.student.id)) {
        const key = `pickup:${p.id}`;
        if (!options.some((o) => o.value === key))
          options.push({
            value: key,
            label: p.name,
            description: [p.relationship, p.phone].filter(Boolean).join(' · '),
          });
      }
    } catch {
      // The exeat's own collectors are enough to sign out.
    }
    return options;
  }

  async function signOutAt(e: Exeat) {
    const options = await collectorsOf(e);
    if (!options.length) {
      toast.error('No one is approved to collect this boarder', {
        description: 'Ask the house staff to check the boarder’s parents and pickup people.',
      });
      return false;
    }
    const pickupKey = e.pickup ? `pickup:${e.pickup.pickupPersonId}` : undefined;
    return confirm({
      title: `Sign ${e.student.name} out`,
      description: `Back by ${e.returns}. Check the collector’s ID before they leave.`,
      details: [
        ['Boarder', `${e.student.name} · ${e.student.className}`],
        ...(e.pickup
          ? ([['Pickup arranged', `${e.pickup.name} (${e.pickup.relationship})`]] as [
              string,
              string,
            ][])
          : []),
      ],
      options,
      defaultOption: options.some((o) => o.value === pickupKey) ? pickupKey : undefined,
      confirmLabel: 'Sign out',
      action: async ({ option }) => {
        await signOut.mutateAsync({ id: e.id, collector: option });
        toast.success(`${e.student.name} signed out`, { description: 'Their parents are told.' });
      },
    });
  }

  async function signInAt(e: Exeat) {
    try {
      const back = await signIn.mutateAsync(e.id);
      toast.success(`${e.student.name} signed back in`, {
        description: back.lateReturn ? 'Recorded as a late return.' : 'Their parents are told.',
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Couldn’t sign the boarder in. Try again.'));
    }
  }

  return {
    approve,
    decline,
    cancel,
    signOut: signOutAt,
    signIn: signInAt,
    signingIn: signIn.isPending,
  };
}
