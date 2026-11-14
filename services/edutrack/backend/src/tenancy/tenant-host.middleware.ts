import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from '../common/context/request-context.js';
import { TenantResolverService } from './tenant-resolver.service.js';

/**
 * Resolves the school named by the request's Host (or the dev header) into
 * `RequestContext.hostSchool`. It does not set the tenant: that happens in the auth guard, after
 * the session proves the user belongs to that school.
 */
@Injectable()
export class TenantHostMiddleware implements NestMiddleware {
  constructor(private readonly resolver: TenantResolverService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const { school, unknownSlug } = await this.resolver.resolve(req.headers.host, req.headers);
      RequestContext.patch({ hostSchool: school, unknownHostSlug: unknownSlug });
      next();
    } catch (error) {
      next(error);
    }
  }
}
