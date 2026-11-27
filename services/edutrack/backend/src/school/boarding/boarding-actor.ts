import type { AuthUserContext } from '../../auth/auth-context.js';
import { flattenPermissions } from '../../auth/permissions/school-permissions.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { outOfBranch } from '../../common/plan/branch-scope.js';
import type { TenantTx } from '../shared/tenant-tx.js';

/**
 * Who is doing something in boarding, and what they may do: their boarding permissions, and the
 * hostels they look after as house staff (house staff see and approve only their own hostels'
 * boarders; anyone with `boarding.manage`, such as the Head of boarding, sees all of them).
 */
export interface BoardingActor {
  userId: string;
  name: string;
  staffId: string | null;
  can: (action: 'view' | 'manage' | 'exeats' | 'gate' | 'health' | 'rollcall') => boolean;
  /** Hostels they look after (any house staff post). */
  hostelIds: Set<string>;
  /** Sees every hostel (boarding.manage), not just their own. */
  allHostels: boolean;
  /**
   * A branch-scoped School Admin user's branches (null for everyone else). Their "every hostel" is
   * every hostel at those branches, and boarders elsewhere are out of reach.
   */
  branchIds: string[] | null;
}

export async function boardingActor(db: TenantTx, auth: AuthUserContext): Promise<BoardingActor> {
  const m = await db.schoolMembership.findFirst({
    where: { id: auth.membershipId, userId: auth.userId, status: 'ACTIVE' },
    select: {
      staffId: true,
      user: { select: { firstName: true, lastName: true } },
      roles: { select: { role: { select: { permissions: true, archivedAt: true } } } },
    },
  });
  if (!m) throw AppException.forbidden('This account can’t use boarding here.', 'NO_ACCESS');
  const granted = new Set(
    flattenPermissions(m.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.permissions)),
  );
  const posts = m.staffId
    ? await db.hostelStaff.findMany({
        where: { staffId: m.staffId, hostel: { archivedAt: null } },
        select: { hostelId: true },
      })
    : [];
  const hostelIds = new Set(posts.map((p) => p.hostelId));
  const posted = hostelIds.size > 0;
  let allHostels = granted.has('boarding.manage');
  const branchIds = RequestContext.get()?.branchScope?.ids ?? null;
  if (branchIds && allHostels) {
    // Every hostel at their branches, rather than every hostel in the school.
    const hostels = await db.hostel.findMany({
      where: { branchId: { in: branchIds }, archivedAt: null },
      select: { id: true },
    });
    for (const h of hostels) hostelIds.add(h.id);
    allHostels = false;
  }
  return {
    userId: auth.userId,
    name: `${m.user.firstName} ${m.user.lastName}`.trim(),
    staffId: m.staffId,
    // House staff posted to a hostel may view it, take its roll call and decide its exeats.
    can: (a) =>
      granted.has(`boarding.${a}`) ||
      (posted && (a === 'view' || a === 'rollcall' || a === 'exeats')),
    hostelIds,
    allHostels,
    branchIds,
  };
}

/** 403 unless the actor may do this. */
export function requireBoarding(
  actor: BoardingActor,
  action: Parameters<BoardingActor['can']>[0],
  message = 'You don’t have permission to do that in boarding.',
) {
  if (!actor.can(action)) throw AppException.forbidden(message, 'FORBIDDEN');
}

/** A Prisma filter limiting rows with a `branchId` to the actor's branches (none when unscoped). */
export function inActorBranches(actor: BoardingActor) {
  return actor.branchIds ? { branchId: { in: actor.branchIds } } : {};
}

/** A branch-scoped School Admin user's branch ids, or null for a whole-school user. */
export function scopedBranchIds(): string[] | null {
  return RequestContext.get()?.branchScope?.ids ?? null;
}

/** 403 BRANCH_SCOPE when a branch-scoped admin reaches a record at another branch. */
export function requireScopedBranch(branchId: string | null | undefined) {
  const scope = RequestContext.get()?.branchScope;
  if (scope && branchId && !scope.ids.includes(branchId)) throw outOfBranch(scope.names);
}
