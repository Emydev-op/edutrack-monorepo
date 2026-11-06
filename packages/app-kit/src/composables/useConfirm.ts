import { shallowRef } from 'vue';

export interface ConfirmOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConfirmResult {
  /** The typed reason or note, when the dialog asks for one. */
  text: string;
  /** The chosen option, when the dialog offers options. */
  option: string;
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  /** Facts the user should see before confirming: what happens, who is affected, reversibility. */
  details?: [label: string, value: string][];
  options?: ConfirmOption[];
  /** The option chosen when the dialog opens (default: the first). */
  defaultOption?: string;
  input?: { label: string; placeholder?: string; required?: boolean };
  /** A statement the user must tick before the action is allowed. */
  acknowledgement?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'destructive';
  /**
   * Runs when the user confirms. The dialog stays open, shows progress, and displays the error
   * message if it throws, so a failed action is never silently dismissed.
   */
  action?: (result: ConfirmResult) => Promise<unknown> | unknown;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

const pending = shallowRef<PendingConfirm | null>(null);

/**
 * Asks the user to confirm a consequential action. Resolves `true` once the action has run
 * (or the user confirmed, when there is no action) and `false` if they cancelled.
 */
export function useConfirm() {
  return (request: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      pending.value?.resolve(false);
      pending.value = { ...request, resolve };
    });
}

/** Internal: the dialog host reads and settles the pending request. */
export function useConfirmHost() {
  return {
    pending,
    /** Resolves `request` (default: the one on screen) and closes it if it is still showing. */
    settle(confirmed: boolean, request: PendingConfirm | null = pending.value) {
      request?.resolve(confirmed);
      if (pending.value === request) pending.value = null;
    },
  };
}
