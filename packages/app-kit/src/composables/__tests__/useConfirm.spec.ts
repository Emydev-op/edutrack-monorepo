import { describe, expect, it } from 'vitest';

import { useConfirm, useConfirmHost } from '../useConfirm';

describe('useConfirm', () => {
  it('settling a finished request does not close a newer one (sign-out race)', async () => {
    const confirm = useConfirm();
    const { pending, settle } = useConfirmHost();

    const signOut = confirm({ title: 'Sign out?', confirmLabel: 'Sign out' });
    const running = pending.value;

    // While sign-out runs, navigation asks to discard unsaved changes.
    const discard = confirm({ title: 'You have unsaved changes', confirmLabel: 'Discard' });
    expect(pending.value?.title).toBe('You have unsaved changes');

    // The sign-out action finishes and settles its own request only.
    settle(true, running);
    expect(pending.value?.title).toBe('You have unsaved changes');

    settle(true);
    await expect(discard).resolves.toBe(true);
    await expect(signOut).resolves.toBe(false);
    expect(pending.value).toBeNull();
  });
});
