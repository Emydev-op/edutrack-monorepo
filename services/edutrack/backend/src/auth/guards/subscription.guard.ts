import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  isSubscriptionLocked,
  lapsedMessage,
  readOnlyMessage,
} from '../../common/subscription/subscription-lock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC, OPEN_WHEN_LAPSED } from '../decorators/auth.decorators.js';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard, after authentication: a school whose subscription has lapsed (restricted, expired,
 * cancelled) keeps School Admin view-only, apart from `@OpenWhenLapsed()` routes, and closes the
 * Teacher Workspace, Parent Portal and Student Portal, including sessions that were already open.
 * Read on every request, so renewing or restricting a school applies at once.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const ctx = RequestContext.get();
    if (!ctx?.schoolId || !ctx.portal || ctx.portal === 'PLATFORM') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const isRead = READS.has(req.method.toUpperCase());
    const open = this.reflector.getAllAndOverride<boolean>(OPEN_WHEN_LAPSED, targets);
    if (ctx.portal === 'SCHOOL_ADMIN' && (isRead || open)) return true;

    const school = await this.prisma.school.findUnique({
      where: { id: ctx.schoolId },
      select: { name: true, subscription: { select: { status: true } } },
    });
    if (!school || !isSubscriptionLocked(school.subscription?.status)) return true;
    if (ctx.portal === 'SCHOOL_ADMIN')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        readOnlyMessage(school.name),
        'SUBSCRIPTION_READ_ONLY',
      );
    // Signing out still works, so a closed portal can end its session cleanly.
    if (open) return true;
    throw new AppException(HttpStatus.FORBIDDEN, lapsedMessage(school.name), 'SUBSCRIPTION_LAPSED');
  }
}
