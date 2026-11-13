import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The error every handler throws when it wants a specific status, a stable machine `code` the
 * portals branch on (ACCOUNT_LOCKED, RESET_EXPIRED…) and optionally per-field messages.
 *
 * Serialised by `AllExceptionsFilter` as
 * `{ statusCode, message, code, error: code, fields?, requestId }`.
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    message: string,
    readonly code: string,
    readonly fields?: Record<string, string>,
    /** Extra response headers, e.g. Retry-After. */
    readonly headers?: Record<string, string>,
  ) {
    super(message, status);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppException(HttpStatus.BAD_REQUEST, message, code);
  }

  static unauthorized(message = 'Sign in to continue.', code = 'UNAUTHORIZED') {
    return new AppException(HttpStatus.UNAUTHORIZED, message, code);
  }

  static forbidden(message = 'You don’t have permission to do that.', code = 'FORBIDDEN') {
    return new AppException(HttpStatus.FORBIDDEN, message, code);
  }

  static notFound(message = 'That record doesn’t exist.', code = 'NOT_FOUND') {
    return new AppException(HttpStatus.NOT_FOUND, message, code);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppException(HttpStatus.CONFLICT, message, code);
  }

  static gone(message: string, code = 'GONE') {
    return new AppException(HttpStatus.GONE, message, code);
  }

  /** 422 with per-field messages. The first field's message doubles as the summary. */
  static validation(fields: Record<string, string>, message?: string) {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      message ?? Object.values(fields)[0] ?? 'Check the highlighted fields.',
      'VALIDATION',
      fields,
    );
  }
}
