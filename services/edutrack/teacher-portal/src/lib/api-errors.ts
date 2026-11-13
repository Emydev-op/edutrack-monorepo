import { getApiErrorMessage } from '@edutrack/web-core/http';
import { isAxiosError } from 'axios';

export const statusOf = (error: unknown) =>
  isAxiosError(error) ? (error.response?.status ?? null) : null;
/** The API's error code (`FORBIDDEN`, `TERM_LOCKED`, `ACCOUNT_LOCKED`…), when it sent one. */
export const errorCodeOf = (error: unknown) =>
  isAxiosError(error)
    ? ((error.response?.data as { error?: string } | undefined)?.error ?? null)
    : null;

/** 403: outside the teacher's assignments. Render `<AccessDenied>` with the message. */
export const isForbidden = (error: unknown) => statusOf(error) === 403;
export const isNotFound = (error: unknown) => statusOf(error) === 404;
/** 409 TERM_LOCKED: the term (or a deadline) makes the record read-only. */
export const isTermLocked = (error: unknown) => errorCodeOf(error) === 'TERM_LOCKED';

/** Per-field messages from a 422 (`{ fields: { reason: '…' } }`), or `{}`. */
export const fieldErrorsOf = (error: unknown): Record<string, string> =>
  isAxiosError(error)
    ? ((error.response?.data as { fields?: Record<string, string> } | undefined)?.fields ?? {})
    : {};

export { getApiErrorMessage };
