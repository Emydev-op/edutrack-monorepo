import type { InjectionKey } from 'vue';
import { toast } from 'vue-sonner';

import {
  useUserActionMutation,
  useUserOpenIssuesQuery,
  useUserSecurityQuery,
} from '@/api/services/users';
import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import type { PlatformUser, UserAction } from '@/types';

/** Account lifecycle actions for one platform user, each behind the confirmation the design specifies. */
export function useUserActions(current: () => PlatformUser | undefined) {
  const confirm = useConfirm();
  // Actions only run from a rendered page, so the user is loaded by then.
  const user = () => current()!;
  const mutation = useUserActionMutation(() => current()?.id ?? '');
  const { data: openIssues } = useUserOpenIssuesQuery(() => current()?.id ?? '');
  const { data: security } = useUserSecurityQuery(() => current()?.id ?? '');

  const name = () => `${user().firstName} ${user().lastName}`;
  const run =
    (action: UserAction, message: () => string) =>
    async ({ text }: { text: string }) => {
      await mutation.mutateAsync({ action, reason: text || undefined });
      toast.success(message());
    };

  return {
    suspend: () =>
      confirm({
        title: `Suspend ${name()}?`,
        description: `${user().firstName} will no longer be able to sign in to the Platform Back Office. Open sessions end immediately. Their history, assigned issues and audit trail stay intact.`,
        details: [
          ['Assigned issues', `${openIssues.value?.count ?? 0} open · reassign them separately`],
          ['Reversible', 'Yes. Reactivate any time.'],
        ],
        input: { label: 'Reason', placeholder: 'e.g. Extended leave', required: true },
        confirmLabel: 'Suspend user',
        tone: 'destructive',
        action: run('suspend', () => `${name()} suspended.`),
      }),
    reactivate: () =>
      confirm({
        title: `Reactivate ${name()}?`,
        details: [
          ['Role restored', user().roleName],
          ['Access', 'Can sign in again with their existing password'],
          ['Previous status', user().status],
        ],
        confirmLabel: 'Reactivate user',
        action: run('reactivate', () => `${name()} reactivated.`),
      }),
    deactivate: () =>
      confirm({
        title: `Deactivate ${name()}?`,
        description:
          "Use this when someone leaves EduTrack. The account can't sign in and can't be reactivated; if they return, invite them again. Their name stays on past actions.",
        details: [['Reversible', 'No']],
        input: { label: 'Reason', placeholder: 'e.g. Left the company on 30 Nov', required: true },
        acknowledgement: 'I have reassigned their open issues',
        confirmLabel: 'Deactivate user',
        tone: 'destructive',
        action: run('deactivate', () => `${name()} deactivated.`),
      }),
    resetPassword: () =>
      confirm({
        title: `Send a password reset to ${name()}?`,
        details: [
          ['Sent to', user().email],
          ['Current password', 'Keeps working until they set a new one'],
          ['Link expires', 'In 60 minutes'],
        ],
        confirmLabel: 'Send reset link',
        action: run('password-reset', () => `Password reset link sent to ${user().email}.`),
      }),
    signOutEverywhere: () =>
      confirm({
        title: `Sign ${name()} out of all sessions?`,
        details: [
          ['Active sessions', security.value?.activeSessions ?? '—'],
          ['Effect', 'They need to sign in again on every device'],
        ],
        confirmLabel: 'Sign out everywhere',
        action: run('sign-out', () => `${name()} signed out of all sessions.`),
      }),
    resendInvitation: () =>
      confirm({
        title: `Resend invitation to ${user().email}?`,
        details: [
          ['Previous link', 'Stops working'],
          ['New link', 'Valid for 7 days'],
        ],
        confirmLabel: 'Resend invitation',
        action: run('resend-invitation', () => `New invitation sent to ${user().email}.`),
      }),
    revokeInvitation: () =>
      confirm({
        title: `Revoke the invitation for ${user().email}?`,
        details: [
          ['Effect', 'The invitation link stops working. No account is created.'],
          ['Reversible', 'Invite them again at any time'],
        ],
        confirmLabel: 'Revoke invitation',
        tone: 'destructive',
        action: run('revoke-invitation', () => 'Invitation revoked.'),
      }),
  };
}

/** Lets user detail tabs reuse the actions the detail page already set up. */
export const userActionsKey: InjectionKey<ReturnType<typeof useUserActions>> =
  Symbol('userActions');
