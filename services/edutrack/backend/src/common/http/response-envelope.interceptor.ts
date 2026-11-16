import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { Page } from '../pagination/pagination.js';
import {
  type ApiSuccess,
  type MessageRequest,
  type MessageSource,
  RAW_RESPONSE,
  RESPONSE_MESSAGE,
} from './api-response.js';

/** Used only if a route forgot its `@ResponseMessage` (the conventions test catches that). */
const FALLBACK_MESSAGE = 'Done.';

/** Wraps every successful result in `{ success, message, data, meta? }`. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, targets)) return next.handle();
    const source = this.reflector.getAllAndOverride<MessageSource | undefined>(
      RESPONSE_MESSAGE,
      targets,
    );
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((result: unknown) =>
        envelope(result, source, {
          body: request.body ?? {},
          params: (request.params ?? {}) as Record<string, string>,
        }),
      ),
    );
  }
}

export function envelope(
  result: unknown,
  source?: MessageSource,
  request: MessageRequest = { body: {}, params: {} },
): unknown {
  if (result instanceof StreamableFile) return result;
  const message =
    typeof source === 'function' ? source(result, request) : (source ?? FALLBACK_MESSAGE);
  if (result instanceof Page)
    return { success: true, message, data: result.data, meta: result.meta } satisfies ApiSuccess<
      unknown[]
    >;
  return { success: true, message, data: result ?? null } satisfies ApiSuccess<unknown>;
}
