import { isoDate } from '../academics/academic-format.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';

/**
 * Class rolls by date. `Enrollment.armId` is the arm a student is in now; when they move arms
 * during a session an `ArmMove` records the day, so each arm's registers, counts and attendance
 * rates only include the days the student was actually in it.
 */

/** One stretch of a session spent in one arm. `to` is the last day there (null: still there). */
export interface ArmSpan {
  armId: string;
  from: string;
  to: string | null;
}

interface Move {
  fromArmId: string;
  toArmId: string | null;
  movedOn: Date;
}

/** The arms a student was in this session, in order, from their enrollment and moves. */
export function armSpans(
  e: { armId: string | null; enrolledOn: Date; leftOn?: Date | null },
  moves: Move[],
): ArmSpan[] {
  const sorted = [...moves].sort((a, b) => a.movedOn.getTime() - b.movedOn.getTime());
  const spans: ArmSpan[] = [];
  let from = isoDate(e.enrolledOn);
  for (const m of sorted) {
    const moved = isoDate(m.movedOn);
    const last = dayBefore(moved);
    if (last >= from) spans.push({ armId: m.fromArmId, from, to: last });
    from = moved;
  }
  if (e.armId) spans.push({ armId: e.armId, from, to: e.leftOn ? isoDate(e.leftOn) : null });
  return spans;
}

const dayBefore = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Whether a span covers a day. */
export const covers = (s: ArmSpan, date: string) => s.from <= date && (!s.to || date <= s.to);

/** School days from a list that fall inside a span. */
export const daysIn = (s: ArmSpan, days: string[]) => days.filter((d) => covers(s, d));

/**
 * Everyone who was in any of these arms at some point this session (still enrolled), with the
 * stretch they spent in each. A student who moved between two of the arms appears once per arm.
 */
export async function armRollSpans(db: TenantPrismaClient, sessionId: string, armIds: string[]) {
  const rows = await db.enrollment.findMany({
    where: {
      sessionId,
      status: 'ACTIVE',
      OR: [
        { armId: { in: armIds } },
        {
          armMoves: {
            some: { OR: [{ fromArmId: { in: armIds } }, { toArmId: { in: armIds } }] },
          },
        },
      ],
    },
    include: {
      student: true,
      armMoves: { select: { fromArmId: true, toArmId: true, movedOn: true } },
    },
    orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
  });
  const wanted = new Set(armIds);
  return rows.flatMap((e) =>
    armSpans(e, e.armMoves)
      .filter((s) => wanted.has(s.armId))
      .map((span) => ({ ...e, span })),
  );
}

export type RollSpan = Awaited<ReturnType<typeof armRollSpans>>[number];
