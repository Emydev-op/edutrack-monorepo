import type { TenantTx } from '../shared/tenant-tx.js';

/** The places taken in rooms this session, by room id. */
export async function roomUse(db: TenantTx, sessionId: string, roomIds?: string[]) {
  const rows = await db.bedAllocation.findMany({
    where: {
      ...(roomIds && { roomId: { in: roomIds } }),
      enrollment: { sessionId, status: 'ACTIVE' },
    },
    select: { roomId: true, bed: true },
  });
  const use = new Map<string, { taken: number; beds: Set<string> }>();
  for (const r of rows) {
    const u = use.get(r.roomId) ?? { taken: 0, beds: new Set<string>() };
    u.taken++;
    if (r.bed) u.beds.add(r.bed);
    use.set(r.roomId, u);
  }
  return use;
}

/** The session boarding works on: the Active one, else the next Upcoming one. */
export async function boardingSession(db: TenantTx) {
  return (
    (await db.academicSession.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    })) ??
    (await db.academicSession.findFirst({
      where: { status: 'UPCOMING' },
      orderBy: { startsOn: 'asc' },
      select: { id: true, name: true },
    }))
  );
}

/** Whether a campus takes boarders in a class level. */
export async function boardsAt(db: TenantTx, branchId: string, levelId: string) {
  const level = await db.classLevel.findFirst({
    where: { id: levelId },
    select: { sectionId: true },
  });
  if (!level) return false;
  const bs = await db.branchSection.findFirst({
    where: { branchId, sectionId: level.sectionId, boarding: true },
    select: { boardingLevelIds: true },
  });
  return !!bs && (!bs.boardingLevelIds.length || bs.boardingLevelIds.includes(levelId));
}

/**
 * Carries a boarder into the next session's enrolment: they stay a boarder where their new class
 * still boards at the campus, and keep their room and bed when that hostel still takes the class
 * and the place is free; otherwise they wait for a place.
 */
export async function carryBoarding(
  db: TenantTx,
  schoolId: string,
  fromEnrollmentId: string,
  to: { id: string; sessionId: string; branchId: string; levelId: string },
  on: Date,
) {
  const from = await db.enrollment.findFirst({
    where: { id: fromEnrollmentId },
    select: {
      boarding: true,
      bedAllocation: { include: { room: { include: { hostel: true } } } },
    },
  });
  if (!from?.boarding) return { boarding: false, placed: false };
  const boards = await boardsAt(db, to.branchId, to.levelId);
  await db.enrollment.update({ where: { id: to.id }, data: { boarding: boards } });
  const a = from.bedAllocation;
  if (!boards || !a) return { boarding: boards, placed: false };
  const room = a.room;
  const fits =
    !room.archivedAt &&
    !room.hostel.archivedAt &&
    room.hostel.branchId === to.branchId &&
    (!room.hostel.levelIds.length || room.hostel.levelIds.includes(to.levelId));
  if (!fits) return { boarding: true, placed: false };
  const use = (await roomUse(db, to.sessionId, [room.id])).get(room.id);
  if ((use?.taken ?? 0) >= room.capacity || (a.bed && use?.beds.has(a.bed)))
    return { boarding: true, placed: false };
  await db.bedAllocation.create({
    data: { schoolId, enrollmentId: to.id, roomId: room.id, bed: a.bed, allocatedOn: on },
  });
  return { boarding: true, placed: true };
}

export interface BoardingPlace {
  hostel: string;
  floor: string | null;
  room: string;
  bed: string | null;
  houseStaff: { staffId: string; name: string; role: string }[];
}

/**
 * Where each of these students boards this session (null: a day student, or a boarder waiting for
 * a place: `placed` false), with the house master or mistress and their floor's master.
 */
export async function boardingOf(db: TenantTx, studentIds: string[], sessionId: string) {
  const rows = await db.enrollment.findMany({
    where: { studentId: { in: studentIds }, sessionId, status: 'ACTIVE', boarding: true },
    select: {
      studentId: true,
      bedAllocation: {
        select: {
          bed: true,
          room: {
            select: {
              name: true,
              floorId: true,
              floor: { select: { name: true } },
              hostel: {
                select: {
                  name: true,
                  staff: {
                    select: {
                      staffId: true,
                      role: true,
                      floorId: true,
                      staff: {
                        select: {
                          title: true,
                          firstName: true,
                          lastName: true,
                          status: true,
                          gender: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const out = new Map<string, { placed: boolean; place: BoardingPlace | null }>();
  for (const r of rows) {
    const a = r.bedAllocation;
    out.set(r.studentId, {
      placed: !!a,
      place: a
        ? {
            hostel: a.room.hostel.name,
            floor: a.room.floor?.name ?? null,
            room: a.room.name,
            bed: a.bed,
            houseStaff: a.room.hostel.staff
              .filter(
                (s) =>
                  s.staff.status === 'ACTIVE' &&
                  (s.role === 'HOUSE_MASTER' ||
                    (s.role === 'FLOOR_MASTER' && s.floorId === a.room.floorId)),
              )
              .map((s) => ({
                staffId: s.staffId,
                name: [s.staff.title, s.staff.firstName, s.staff.lastName]
                  .filter(Boolean)
                  .join(' '),
                // "House mistress" for a woman, "House master" for a man (both when not recorded).
                role: `${s.role === 'HOUSE_MASTER' ? 'House' : 'Floor'} ${
                  s.staff.gender === 'FEMALE'
                    ? 'mistress'
                    : s.staff.gender === 'MALE'
                      ? 'master'
                      : 'master / mistress'
                }`,
              })),
          }
        : null,
    });
  }
  return out;
}
