import { getApiErrorCode, getApiErrorFields, getApiErrorMessage } from '@edutrack/web-core/http';
import { isAxiosError } from 'axios';

export const statusOf = (error: unknown) =>
  isAxiosError(error) ? (error.response?.status ?? null) : null;
/** The API's error code (`ACCOUNT_LOCKED`, `NOT_FEE_PAYER`…), when it sent one. */
export const errorCodeOf = (error: unknown) => getApiErrorCode(error) ?? null;
export const isNotFound = (error: unknown) => statusOf(error) === 404;
/** Per-field messages from a 422 (`{ fields: { phone: '…' } }`), or `{}`. */
export const fieldErrorsOf = (error: unknown): Record<string, string> => getApiErrorFields(error);

export { getApiErrorMessage };
