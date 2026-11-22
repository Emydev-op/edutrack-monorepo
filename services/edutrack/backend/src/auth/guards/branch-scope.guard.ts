import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestContext } from '../../common/context/request-context.js';
import {
  outOfBranch,
  SCHOOL_WIDE,
  SCOPED_BY,
  schoolWideOnly,
  type ScopedKind,
} from '../../common/plan/branch-scope.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC } from '../decorators/auth.decorators.js';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALL = 'All branches';

/**
 * Global guard, after authentication: a branch-scoped School Admin user (Users & Roles › scope
 * "Branch") works only in their branches. Their reads are pinned to one of them (the `branch`
 * query and the header's working branch), changes aimed at another branch are refused, and
 * `@SchoolWide()` changes are for whole-school admins. Records opened by id are checked by the
 * services (BranchAccessService).
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const ctx = RequestContext.get();
    if (!ctx?.membershipId || ctx.portal !== 'SCHOOL_ADMIN') return true;
    const m = await this.prisma.schoolMembership.findUnique({
      where: { id: ctx.membershipId },
      select: {
        scope: true,
        branches: {
          where: { branch: { status: 'ACTIVE' } },
          select: { branch: { select: { id: true, name: true } } },
          orderBy: { branch: { name: 'asc' } },
        },
      },
    });
    if (!m || m.scope !== 'BRANCH') return true;
    const ids = m.branches.map((b) => b.branch.id);
    const names = m.branches.map((b) => b.branch.name);
    RequestContext.patch({ branchScope: { ids, names } });
    const req = context.switchToHttp().getRequest<Request>();
    const fallback = names[0] ?? '';

    // Reads: the header's branch and a `branch` query stay within their branches.
    const working = ctx.working;
    if (working && (!working.branch || !names.includes(working.branch)))
      RequestContext.patch({ working: { ...working, branch: fallback } });
    const query = req.query as Record<string, unknown>;
    if ('branch' in query) {
      const asked = typeof query.branch === 'string' ? query.branch : '';
      // A branch id (some screens send ids) or a name.
      if (!names.includes(asked) && !ids.includes(asked)) {
        Object.defineProperty(req, 'query', {
          value: { ...query, branch: ids.length && isUuid(asked) ? ids[0] : fallback },
          writable: true,
          configurable: true,
        });
      }
    }
    // Records named in the path: only at their branches.
    const params = (req.params ?? {}) as Record<string, string>;
    const tagged = this.reflector.getAllAndOverride<
      { kind: ScopedKind; param: string } | undefined
    >(SCOPED_BY, targets);
    const checks: [ScopedKind, string | undefined][] = [
      ['arm', params.armId],
      ['student', params.studentId],
      ...(tagged ? ([[tagged.kind, params[tagged.param]]] as [ScopedKind, string][]) : []),
    ];
    for (const [kind, value] of checks) {
      if (!value) continue;
      const at = await this.branchOf(ctx.schoolId!, kind, value);
      if (at && !ids.includes(at.id)) throw outOfBranch(names, at.name);
    }

    if (READS.has(req.method.toUpperCase())) return true;

    if (this.reflector.getAllAndOverride<boolean>(SCHOOL_WIDE, targets))
      throw schoolWideOnly(names);
    // Changes naming a branch: only theirs.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const named = [body.branch, ...(Array.isArray(body.branches) ? body.branches : [])].filter(
      (v): v is string => typeof v === 'string' && v !== '' && v !== ALL,
    );
    const byId = [body.branchId, ...(Array.isArray(body.branchIds) ? body.branchIds : [])].filter(
      (v): v is string => typeof v === 'string' && v !== '',
    );
    if (body.branch === ALL || named.some((n) => !names.includes(n)))
      throw outOfBranch(names, named.find((n) => !names.includes(n)) ?? null);
    if (byId.some((id) => !ids.includes(id))) throw outOfBranch(names);
    return true;
  }

  /** Where a record is: its branch id and name, or null when it isn't found (the route 404s). */
  private async branchOf(
    schoolId: string,
    kind: ScopedKind,
    value: string,
  ): Promise<{ id: string; name: string } | null> {
    const db = this.prisma;
    const branch = { select: { id: true, name: true } } as const;
    const uuid = isUuid(value);
    switch (kind) {
      case 'arm':
        return uuid
          ? ((await db.classArm.findFirst({ where: { schoolId, id: value }, select: { branch } }))
              ?.branch ?? null)
          : null;
      case 'level': {
        // School Admin's level id is "<levelId>~<branchId>".
        const branchId = value.split('~')[1];
        return branchId && isUuid(branchId)
          ? await db.branch.findFirst({ where: { schoolId, id: branchId }, ...branch })
          : null;
      }
      case 'student':
        return uuid
          ? ((
              await db.enrollment.findFirst({
                where: { schoolId, studentId: value },
                orderBy: [{ enrolledOn: 'desc' }, { createdAt: 'desc' }],
                select: { branch },
              })
            )?.branch ?? null)
          : null;
      case 'staff': {
        if (!uuid) return null;
        const st = await db.staff.findFirst({
          where: { schoolId, id: value },
          select: { allBranches: true, branches: { select: { branch } } },
        });
        if (!st || st.allBranches) return null;
        const scope = RequestContext.get()?.branchScope;
        // Allowed when any of their branches is the admin's.
        return (
          st.branches.find((b) => scope?.ids.includes(b.branch.id))?.branch ??
          st.branches[0]?.branch ??
          null
        );
      }
      case 'invoice': {
        const inv = await db.invoice.findFirst({
          where: { schoolId, ...(uuid ? { id: value } : { number: value }) },
          select: { studentId: true },
        });
        return inv ? this.branchOf(schoolId, 'student', inv.studentId) : null;
      }
      case 'payment': {
        const pay = await db.payment.findFirst({
          where: { schoolId, ...(uuid ? { id: value } : { number: value }) },
          select: { studentId: true },
        });
        return pay ? this.branchOf(schoolId, 'student', pay.studentId) : null;
      }
    }
  }
}

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
