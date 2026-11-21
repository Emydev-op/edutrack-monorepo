import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext, type WorkingContext } from '../context/request-context.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Path without the query string (it can carry tokens) and with path tokens masked. */
export const redactPath = (url: string) =>
  url.split('?')[0]!.replace(/(\/invitations\/)[^/]+/, '$1:token');

/**
 * First middleware of every request: starts the AsyncLocalStorage context, assigns a request id
 * (reusing a well-formed incoming `X-Request-Id` from the proxy) and logs one structured line
 * when the response finishes.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();

    RequestContext.run(
      {
        requestId,
        ip: req.ip,
        userAgent: req.header('user-agent')?.slice(0, 512),
        working: workingContext(req),
      },
      () => {
        const state = RequestContext.get()!;
        res.on('finish', () => {
          const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
          const line = {
            msg: 'request',
            requestId,
            method: req.method,
            path: redactPath(req.originalUrl),
            status: res.statusCode,
            durationMs: Math.round(durationMs * 10) / 10,
            userId: state.userId,
            schoolId: state.schoolId,
            portal: state.portal,
          };
          if (res.statusCode >= 500) this.logger.error(line);
          else if (res.statusCode >= 400) this.logger.warn(line);
          else this.logger.log(line);
        });
        next();
      },
    );
  }
}

/** Header names School Admin sends with its working session, term and branch (URI-encoded). */
export const WORKING_HEADERS = {
  session: 'x-edutrack-session',
  term: 'x-edutrack-term',
  branch: 'x-edutrack-branch',
} as const;

/** Reads the working context on GET requests only: writes always act on the active session. */
function workingContext(req: Request): WorkingContext | undefined {
  if (req.method !== 'GET' && req.method !== 'HEAD') return undefined;
  const read = (name: string) => {
    const raw = req.header(name);
    if (!raw) return undefined;
    try {
      const v = decodeURIComponent(raw).trim();
      return v && v.length <= 80 ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const working = {
    session: read(WORKING_HEADERS.session),
    term: read(WORKING_HEADERS.term),
    branch: read(WORKING_HEADERS.branch),
  };
  return working.session || working.term || working.branch ? working : undefined;
}
