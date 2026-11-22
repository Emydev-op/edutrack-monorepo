import { Global, Injectable, Module } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { outOfBranch } from '../../common/plan/branch-scope.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/**
 * Records opened by id for a branch-scoped School Admin user: a student, staff member, class arm
 * or invoice at another branch is refused (BRANCH_SCOPE). Whole-school admins pass straight
 * through. The branches come from BranchScopeGuard (RequestContext.branchScope).
 */
@Injectable()
export class BranchAccessService {
  constructor(private readonly tenant: TenantPrismaService) {}

  /** The admin's branch ids, or null for a whole-school admin. */
  scope(): { ids: string[]; names: string[] } | null {
    return RequestContext.get()?.branchScope ?? null;
  }

  private async nameOf(branchId: string | null | undefined) {
    if (!branchId) return null;
    return (
      (await this.tenant.db.branch.findFirst({ where: { id: branchId }, select: { name: true } }))
        ?.name ?? null
    );
  }

  async requireBranch(branchId: string | null | undefined) {
    const s = this.scope();
    if (!s || (branchId && s.ids.includes(branchId))) return;
    throw outOfBranch(s.names, await this.nameOf(branchId));
  }

  async requireArm(armId: string | null | undefined) {
    const s = this.scope();
    if (!s || !armId) return;
    const arm = await this.tenant.db.classArm.findFirst({
      where: { id: armId },
      select: { branchId: true },
    });
    if (arm) await this.requireBranch(arm.branchId);
  }

  /** A student: the branch of their latest enrollment (their current campus). */
  async requireStudent(studentId: string | null | undefined) {
    const s = this.scope();
    if (!s || !studentId) return;
    const e = await this.tenant.db.enrollment.findFirst({
      where: { studentId },
      orderBy: [{ enrolledOn: 'desc' }, { createdAt: 'desc' }],
      select: { branchId: true },
    });
    if (e) await this.requireBranch(e.branchId);
  }

  /** A staff member: one of their branches is the admin's (or they work at all branches). */
  async requireStaff(staffId: string | null | undefined) {
    const s = this.scope();
    if (!s || !staffId) return;
    const st = await this.tenant.db.staff.findFirst({
      where: { id: staffId },
      select: { allBranches: true, branches: { select: { branchId: true } } },
    });
    if (!st || st.allBranches || st.branches.some((b) => s.ids.includes(b.branchId))) return;
    throw outOfBranch(s.names, await this.nameOf(st.branches[0]?.branchId));
  }
}

/** Available to every school module. */
@Global()
@Module({ providers: [BranchAccessService], exports: [BranchAccessService] })
export class BranchAccessModule {}
