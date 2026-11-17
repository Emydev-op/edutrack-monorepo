import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

/**
 * Every JSON response has one envelope. Success:
 *
 * ```json
 * { "success": true, "message": "Ticket assigned to Ibrahim Yusuf.", "data": { … } }
 * { "success": true, "message": "Tickets loaded.", "data": [ … ], "meta": { "page": 1, … } }
 * ```
 *
 * Failure (written by `AllExceptionsFilter`):
 *
 * ```json
 * { "success": false, "message": "Enter your password.",
 *   "error": { "code": "VALIDATION", "fields": { "password": "Enter your password." } },
 *   "requestId": "4c1f…" }
 * ```
 *
 * The HTTP status code still says what happened; the body repeats it as `success` for clients.
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  /** Written for the person using the portal; the portals show it in their toasts. */
  message: string;
  /** The result. `null` when an action has nothing to return. */
  data: T;
  /** Only on paged lists. */
  meta?: PageMeta;
}

export interface ApiFailure {
  success: false;
  /** Written for the person using the portal; the portals show it as is. */
  message: string;
  error: {
    /** Stable machine code, e.g. ACCOUNT_LOCKED, VALIDATION, NOT_FOUND. */
    code: string;
    /** Per-field messages on 422s, keyed by property path (`guardians.0.phone`). */
    fields?: Record<string, string>;
  };
  /** Matches the `X-Request-Id` header and the request's log lines. */
  requestId?: string;
}

/** What a message function can read from the request: the body and route parameters. */
export interface MessageRequest<B = any> {
  body: B;
  params: Record<string, string>;
}

/** Builds a route's success message, from the result (or request) when it needs details. */
export type MessageSource<T = any, B = any> =
  string | ((result: T, request: MessageRequest<B>) => string);

export const RESPONSE_MESSAGE = 'response:message';
export const RAW_RESPONSE = 'response:raw';

/**
 * The message a route answers with on success. Every route has one (a unit test checks):
 * `@ResponseMessage('Tickets loaded.')`, or
 * `@ResponseMessage((issue: IssueView) => \`Ticket assigned to ${issue.assignee}.\`)`.
 */
export const ResponseMessage = <T = any, B = any>(message: MessageSource<T, B>) =>
  applyDecorators(
    SetMetadata(RESPONSE_MESSAGE, message),
    // Swagger shows the message as the example (built messages show a generic one).
    ApiExtension(
      'x-message',
      typeof message === 'string' ? message : 'Written for this action from its result.',
    ),
  );

/** Answers without the envelope (health probes read by load balancers and Docker). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
