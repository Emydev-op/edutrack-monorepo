import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { RollMark } from '../../generated/prisma/enums.js';
import { lagosToday } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { boardingActor, requireBoarding, type BoardingActor } from './boarding-actor.js';
import { BoardingAlertsService } from './boarding-alerts.service.js';
import { boardingSession } from './boarding-use.js';

export const MARK_LABEL: Record<RollMark, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  EXEAT: 'On exeat',
  SICK_BAY: 'Sick bay',
  EXCUSED: 'Excused',
};
const MARK_OF = Object.fromEntries(Object.entries(MARK_LABEL).map(([k, v]) => [v, k])) as Record<
  string,
  RollMark
>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);

/**
 * Hostel roll calls: each hostel has its daily roll calls (Morning, Night, Prep…). House staff take
 * them for the hostel, or a floor master for their floor: every boarder placed there is Present,
 * Absent or Excused; boarders out on an exeat or admitted to the sick bay are marked so
 * automatically. A boarder marked Absent alerts their parents and the hostel's house staff.
 * Roll calls can be corrected until the end of the next day.
 */
@Injectable()
export class RollCallsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly alerts: BoardingAlertsService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** The floor a floor master covers ("all" for house masters and the Head of boarding). */
  private async scopeFor(actor: BoardingActor, hostelId: string) {
    if (!actor.staffId || actor.allHostels) return 'all';
    const post = await this.db.hostelStaff.findFirst({
      where: { hostelId, staffId: actor.staffId },
      select: { role: true, floorId: true },
    });
    return post?.role === 'FLOOR_MASTER' && post.floorId ? post.floorId : 'all';
  }

  private async hostel(actor: BoardingActor, hostelId: string) {
    const h = isUuid(hostelId)
      ? await this.db.hostel.findFirst({
          where: { id: hostelId, archivedAt: null },
          include: { floors: { orderBy: { sortOrder: 'asc' } } },
        })
      : null;
    if (!h) throw AppException.notFound('That hostel doesn’t exist.', 'NOT_FOUND');
    if (!actor.allHostels && !actor.hostelIds.has(h.id))
      throw AppException.forbidden('You don’t look after this hostel.', 'FORBIDDEN');
    return h;
  }

  private parseDate(v: string | undefined) {
    const today = lagosToday(this.clock.now());
    if (!v) return today;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(v))
      throw invalid({ date: 'Choose a real date.' });
    if (d > today) throw invalid({ date: 'Roll calls can’t be taken for a future day.' });
    return d;
  }

  /** Who is expected at a roll call, with automatic marks for exeats and the sick bay. */
  async sheet(auth: AuthUserContext, hostelId: string, q: { date?: string; slot?: string }) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'rollcall');
    const h = await this.hostel(actor, hostelId);
    const date = this.parseDate(q.date);
    const slot = q.slot && h.rollCallSlots.includes(q.slot) ? q.slot : h.rollCallSlots[0];
    if (!slot) throw invalid({ slot: 'This hostel has no roll calls set up.' });
    const scope = await this.scopeFor(actor, h.id);
    const session = await boardingSession(this.db);
    if (!session)
      throw new AppException(HttpStatus.CONFLICT, 'There’s no session set up yet.', 'NO_SESSION');
    const placed = await this.db.bedAllocation.findMany({
      where: {
        room: { hostelId: h.id, archivedAt: null, ...(scope !== 'all' && { floorId: scope }) },
        enrollment: { sessionId: session.id, status: 'ACTIVE', boarding: true },
      },
      include: {
        room: { select: { name: true, floor: { select: { name: true } } } },
        enrollment: {
          include: {
            student: { select: { id: true, firstName: true, surname: true, admissionNo: true } },
            level: { select: { name: true } },
            arm: { select: { name: true } },
          },
        },
      },
    });
    const ids = placed.map((p) => p.enrollment.studentId);
    // "Now" for today's roll call; the end of the day for an earlier one.
    const at =
      iso(date) === iso(lagosToday(this.clock.now()))
        ? this.clock.now()
        : new Date(date.getTime() + 20 * 3_600_000);
    const [outs, sick, existing] = await Promise.all([
      this.db.exeat.findMany({
        where: {
          studentId: { in: ids },
          OR: [
            { status: 'OUT', signedOutAt: { lte: at } },
            { status: 'RETURNED', signedOutAt: { lte: at }, signedInAt: { gt: at } },
          ],
        },
        select: { studentId: true },
      }),
      this.db.sickBayVisit.findMany({
        where: {
          studentId: { in: ids },
          outcome: 'ADMITTED',
          seenAt: { lte: at },
          OR: [{ dischargedAt: null }, { dischargedAt: { gt: at } }],
        },
        select: { studentId: true },
      }),
      this.db.rollCall.findFirst({
        where: { hostelId: h.id, scope, date, slot },
        include: { marks: true },
      }),
    ]);
    const out = new Set(outs.map((o) => o.studentId));
    const ill = new Set(sick.map((s) => s.studentId));
    const boarders = placed
      .map((p) => {
        const s = p.enrollment.student;
        const saved = existing?.marks.find((m) => m.studentId === s.id);
        const auto: RollMark | null = out.has(s.id) ? 'EXEAT' : ill.has(s.id) ? 'SICK_BAY' : null;
        return {
          studentId: s.id,
          name: `${s.firstName} ${s.surname}`,
          admissionNo: s.admissionNo,
          className: p.enrollment.arm
            ? armLabel(p.enrollment.level.name, p.enrollment.arm.name)
            : p.enrollment.level.name,
          floor: p.room.floor?.name ?? null,
          room: p.room.name,
          bed: p.bed,
          /** Set by an exeat or the sick bay, not by the person taking the roll. */
          automatic: auto ? MARK_LABEL[auto] : null,
          mark: saved ? MARK_LABEL[saved.mark] : auto ? MARK_LABEL[auto] : null,
          note: saved?.note ?? '',
        };
      })
      .sort(
        (a, b) =>
          (a.floor ?? '').localeCompare(b.floor ?? '') ||
          a.room.localeCompare(b.room, 'en', { numeric: true }) ||
          (a.bed ?? a.name).localeCompare(b.bed ?? b.name, 'en', { numeric: true }),
      );
    const takenBy = existing?.takenByUserId
      ? await this.db.user.findUnique({
          where: { id: existing.takenByUserId },
          select: { firstName: true, lastName: true },
        })
      : null;
    return {
      hostel: { id: h.id, name: h.name },
      scope: scope === 'all' ? null : (h.floors.find((f) => f.id === scope)?.name ?? null),
      date: iso(date),
      slot,
      slots: h.rollCallSlots,
      taken: !!existing,
      takenAt: existing?.takenAt.toISOString() ?? null,
      takenBy: takenBy ? `${takenBy.firstName} ${takenBy.lastName}` : null,
      editable: this.editable(date),
      boarders,
      counts: this.counts(boarders.map((b) => b.mark)),
    };
  }

  private editable(date: Date) {
    const today = lagosToday(this.clock.now());
    return today.getTime() - date.getTime() <= 86_400_000;
  }

  private counts(marks: (string | null)[]) {
    const n = (m: string) => marks.filter((x) => x === m).length;
    return {
      total: marks.length,
      present: n('Present'),
      absent: n('Absent'),
      exeat: n('On exeat'),
      sickBay: n('Sick bay'),
      excused: n('Excused'),
      unmarked: marks.filter((x) => !x).length,
    };
  }

  /** Saves a roll call. Absent boarders' parents and house staff are told (once). */
  async save(
    auth: AuthUserContext,
    hostelId: string,
    dto: {
      date?: string;
      slot: string;
      marks: { studentId: string; mark: string; note?: string }[];
    },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'rollcall');
    const sheet = await this.sheet(auth, hostelId, { date: dto.date, slot: dto.slot });
    if (sheet.slot !== dto.slot) throw invalid({ slot: 'Choose one of this hostel’s roll calls.' });
    if (!sheet.editable)
      throw new AppException(
        HttpStatus.CONFLICT,
        'Roll calls can be changed until the end of the next day.',
        'ROLL_CALL_LOCKED',
      );
    const byId = new Map(sheet.boarders.map((b) => [b.studentId, b]));
    const errors: Record<string, string> = {};
    const rows: { studentId: string; mark: RollMark; note: string }[] = [];
    for (const [i, m] of (dto.marks ?? []).entries()) {
      const b = byId.get(m.studentId);
      const mark = MARK_OF[m.mark];
      if (!b) errors[`marks.${i}`] = 'That boarder isn’t on this roll call.';
      else if (!mark || mark === 'EXEAT' || mark === 'SICK_BAY')
        // On exeat and sick bay come from the gate and the nurse, not the roll call.
        errors[`marks.${i}`] = 'Mark them Present, Absent or Excused.';
      else if (b.automatic) continue;
      else rows.push({ studentId: m.studentId, mark, note: (m.note ?? '').trim().slice(0, 200) });
    }
    const missing = sheet.boarders.filter(
      (b) => !b.automatic && !rows.some((r) => r.studentId === b.studentId),
    );
    if (missing.length) errors.marks = `Mark everyone: ${missing.length} not marked yet.`;
    if (Object.keys(errors).length) throw invalid(errors);

    const date = new Date(`${sheet.date}T00:00:00.000Z`);
    const scope = await this.scopeFor(actor, sheet.hostel.id);
    const schoolId = RequestContext.schoolId()!;
    const wasAbsent = new Set(
      sheet.boarders.filter((b) => b.mark === 'Absent').map((b) => b.studentId),
    );
    await this.db.$transaction(async (tx) => {
      const rc = await tx.rollCall.upsert({
        where: {
          hostelId_scope_date_slot: { hostelId: sheet.hostel.id, scope, date, slot: sheet.slot },
        },
        create: {
          schoolId,
          hostelId: sheet.hostel.id,
          scope,
          date,
          slot: sheet.slot,
          takenByUserId: auth.userId,
          takenAt: this.clock.now(),
        },
        update: { takenByUserId: auth.userId, takenAt: this.clock.now() },
      });
      await tx.rollCallMark.deleteMany({ where: { rollCallId: rc.id } });
      const auto = sheet.boarders
        .filter((b) => b.automatic)
        .map((b) => ({ studentId: b.studentId, mark: MARK_OF[b.automatic!]!, note: '' }));
      await tx.rollCallMark.createMany({
        data: [...rows, ...auto].map((r) => ({ schoolId, rollCallId: rc.id, ...r })),
      });
    });
    // Newly absent boarders: tell their parents and the hostel's house staff.
    const absent = rows.filter((r) => r.mark === 'ABSENT' && !wasAbsent.has(r.studentId));
    if (absent.length) {
      const staff = (
        await this.db.hostelStaff.findMany({
          where: { hostelId: sheet.hostel.id },
          select: { staffId: true },
        })
      ).map((s) => s.staffId);
      for (const a of absent) {
        const b = byId.get(a.studentId)!;
        const body = `${b.name} was marked absent at ${sheet.hostel.name}’s ${sheet.slot.toLowerCase()} roll call on ${sheet.date}.${a.note ? ` ${a.note}` : ''}`;
        await this.alerts.parents(a.studentId, {
          title: `${b.name} missed roll call`,
          body: `${body} The school is following up.`,
          link: '/boarding',
          entityType: 'Student',
          entityId: a.studentId,
        });
        await this.alerts.staff(
          staff.filter((id) => id !== actor.staffId),
          {
            title: `Missed roll call: ${b.name}`,
            body,
            link: `/roll-call/${sheet.hostel.id}`,
            entityType: 'Student',
            entityId: a.studentId,
          },
        );
      }
    }
    return this.sheet(auth, hostelId, { date: sheet.date, slot: sheet.slot });
  }

  /** A day's roll calls across the hostels the actor sees: taken or not, and absences. */
  async day(auth: AuthUserContext, q: { date?: string }) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'view');
    const date = this.parseDate(q.date);
    const hostels = await this.db.hostel.findMany({
      where: {
        archivedAt: null,
        ...(!actor.allHostels && { id: { in: [...actor.hostelIds] } }),
      },
      orderBy: [{ branch: { name: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        branch: { select: { name: true } },
        takenRollCalls: { where: { date }, include: { marks: { select: { mark: true } } } },
      },
    });
    return {
      date: iso(date),
      hostels: hostels.map((h) => ({
        id: h.id,
        name: h.name,
        campus: h.branch.name,
        slots: h.rollCallSlots.map((slot) => {
          const taken = h.takenRollCalls.filter((r) => r.slot === slot);
          const marks = taken.flatMap((r) => r.marks.map((m) => MARK_LABEL[m.mark]));
          return {
            slot,
            taken: taken.length > 0,
            takenAt: taken[0]?.takenAt.toISOString() ?? null,
            ...this.counts(marks),
          };
        }),
      })),
    };
  }

  /** Changes a hostel's daily roll calls (the Head of boarding). */
  async setSlots(auth: AuthUserContext, hostelId: string, slots: string[]) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'manage');
    const h = await this.hostel(actor, hostelId);
    const clean = [
      ...new Set((slots ?? []).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)),
    ];
    if (!clean.length) throw invalid({ slots: 'Keep at least one roll call.' });
    if (clean.length > 8) throw invalid({ slots: 'Up to 8 roll calls a day.' });
    if (clean.some((s) => s.length > 30))
      throw invalid({ slots: 'Keep each name to 30 characters.' });
    await this.db.hostel.update({ where: { id: h.id }, data: { rollCallSlots: clean } });
    return { hostelId: h.id, slots: clean };
  }
}
