import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../common/context/request-context.js';
import {
  moduleLocked,
  planIncludes,
  PORTAL_MODULE,
  REQUIRES_MODULE,
} from '../../common/plan/plan-access.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC, OPEN_WHEN_LAPSED } from '../decorators/auth.decorators.js';

/**
 * Global guard, after authentication: features outside the school's plan are refused
 * (MODULE_NOT_IN_PLAN). A route marked `@RequiresModule('fees')` needs that module; the Teacher,
 * Parent and Student portals need their own module, including sessions already open (signing out
 * still works). Read on every request, so a plan change applies at once.
 */
@Injectable()
export class PlanModuleGuard implements CanActivate {
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
    const route = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_MODULE, targets);
    const portal = PORTAL_MODULE[ctx.portal];
    const open = this.reflector.getAllAndOverride<boolean>(OPEN_WHEN_LAPSED, targets);
    const needed = [open ? undefined : portal, route].filter((x): x is string => !!x);
    if (!needed.length) return true;
    const sub = await this.prisma.subscription.findUnique({
      where: { schoolId: ctx.schoolId },
      select: { plan: { select: { name: true, modules: true } } },
    });
    for (const id of needed)
      if (!planIncludes(sub?.plan.modules, id)) throw moduleLocked(id, sub?.plan.name);
    return true;
  }
}
