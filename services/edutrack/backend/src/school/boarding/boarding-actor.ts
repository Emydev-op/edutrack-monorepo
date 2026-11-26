import type { AuthUserContext } from '../../auth/auth-context.js';
import { flattenPermissions } from '../../auth/permissions/school-permissions.js';
import { AppException } from '../../common/errors/app.exception.js';
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
  const allHostels = granted.has('boarding.manage');
  return {
    userId: auth.userId,
    name: `${m.user.firstName} ${m.user.lastName}`.trim(),
    staffId: m.staffId,
    // House staff posted to a hostel may view it, take its roll call and decide its exeats.
    can: (a) =>
      granted.has(`boarding.${a}`) ||
      (hostelIds.size > 0 && (a === 'view' || a === 'rollcall' || a === 'exeats')),
    hostelIds,
    allHostels,
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
