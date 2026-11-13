import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ReadOnlySupportSessionError,
  TenantContextError,
  TenantMismatchError,
} from '../../tenancy/tenant.errors.js';
import { RequestContext } from '../context/request-context.js';
import { AppException } from '../errors/app.exception.js';

/** The body of every error response. Portals read `message` (and `error`/`code`, `fields`). */
export interface ErrorBody {
  statusCode: number;
  message: string;
  /** Stable machine code, e.g. ACCOUNT_LOCKED, VALIDATION, NOT_FOUND. */
  code: string;
  /** Same as `code`. The portals' mock API (and their sign-in screens) read the code from here. */
  error: string;
  /** Per-field messages for 422s, keyed by property path (`guardians.0.phone`). */
  fields?: Record<string, string>;
  requestId?: string;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION',
  423: 'LOCKED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'UNAVAILABLE',
};

const humanise = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Unique constraint columns from a P2002, across the classic and driver-adapter meta shapes. */
function uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = (error.meta ?? {}) as Record<string, unknown>;
  if (Array.isArray(meta.target)) return meta.target.map(String);
  if (typeof meta.target === 'string') return [meta.target];
  const cause = (meta.driverAdapterError as { cause?: { constraint?: { fields?: unknown } } })
    ?.cause;
  const fields = cause?.constraint?.fields;
  return Array.isArray(fields) ? fields.map(String) : [];
}

/** Maps Prisma's known errors to HTTP answers that make sense to a person. */
function fromPrisma(error: Prisma.PrismaClientKnownRequestError): AppException | null {
  switch (error.code) {
    case 'P2002': {
      const fields = uniqueFields(error).filter((f) => f !== 'school_id' && f !== 'schoolId');
      const what = fields.length ? fields.map(humanise).join(', ') : 'these details';
      return new AppException(
        HttpStatus.CONFLICT,
        `A record with the same ${what} already exists.`,
        'DUPLICATE',
      );
    }
    case 'P2003':
    case 'P2014':
      return new AppException(
        HttpStatus.CONFLICT,
        'This record is linked to other records, so it can’t be changed or removed this way.',
        'REFERENCE_CONFLICT',
      );
    case 'P2001':
    case 'P2015':
    case 'P2025':
      return AppException.notFound();
    default:
      return null;
  }
}

/**
 * The single place errors become HTTP responses, so every endpoint answers with the same shape:
 * `{ statusCode, message, code, error, fields?, requestId }`. Unknown errors are logged with the
 * request id and answered with a generic 500; internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = RequestContext.get()?.requestId;
    const known = this.toAppException(exception);

    if (!known || known.getStatus() >= 500) {
      this.logger.error(
        { msg: 'Unhandled error', requestId, error: describe(exception) },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const status = known?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const code = known?.code ?? DEFAULT_CODES[500]!;
    const body: ErrorBody = {
      statusCode: status,
      message:
        known && status < 500 ? known.message : 'Something went wrong on our side. Try again.',
      code,
      error: code,
      ...(known?.fields && { fields: known.fields }),
      ...(requestId && { requestId }),
    };
    for (const [name, value] of Object.entries(known?.headers ?? {}))
      response.setHeader(name, value);
    if (!response.headersSent) response.status(status).json(body);
  }

  private toAppException(exception: unknown): AppException | null {
    if (exception instanceof AppException) return exception;
    if (exception instanceof TenantMismatchError)
      return new AppException(HttpStatus.FORBIDDEN, exception.message, 'TENANT_MISMATCH');
    if (exception instanceof ReadOnlySupportSessionError)
      return new AppException(HttpStatus.FORBIDDEN, exception.message, 'READ_ONLY');
    if (exception instanceof TenantContextError) return null;
    if (exception instanceof Prisma.PrismaClientKnownRequestError) return fromPrisma(exception);
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message = exception.message;
      if (typeof res === 'object' && res && 'message' in res) {
        const m = (res as { message: unknown }).message;
        message = Array.isArray(m) ? m.join(', ') : String(m);
      }
      return new AppException(status, message, DEFAULT_CODES[status] ?? `HTTP_${status}`);
    }
    return null;
  }
}

function describe(exception: unknown) {
  if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
  return String(exception);
}
