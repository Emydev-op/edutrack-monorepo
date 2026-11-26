import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { lagosToday } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel, staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { ON_ROLL } from '../students/student-view.js';
import { BoardingService, GENDER_LABEL } from './boarding.service.js';
import { boardingSession, roomUse } from './boarding-use.js';

const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);

/** What a boarding change asks of the caller before it goes ahead (an override). */
export class AllocationWarning extends AppException {
  constructor(readonly warnings: string[]) {
    super(HttpStatus.CONFLICT, warnings.join(' '), 'ALLOCATION_WARNING', {
      warnings: warnings.join(' '),
    });
  }
}

const STUDENT_GENDER = { MALE: 'boy', FEMALE: 'girl' } as const;

/**
 * Boarders: a student is Day or Boarder for a session (only where their campus and class take
 * boarders), and a boarder gets a room, and a bed when the room's beds are labelled. A full room
 * or a taken bed is refused; a hostel for the other gender, or for other classes, is a warning
 * the admin can override (`confirm`). Leaving boarding frees the bed.
 */
@Injectable()
export class BoardersService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly boarding: BoardingService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  private async session() {
    const s = await boardingSession(this.db);
    if (!s) throw conflict('There’s no session set up yet.', 'NO_SESSION');
    return s;
  }

  /** The student's enrolment this session, with what boarding needs. */
  private async enrolment(studentId: string, sessionId: string) {
    const e = isUuid(studentId)
      ? await this.db.enrollment.findFirst({
          where: { studentId, sessionId, status: 'ACTIVE' },
          include: {
            student: {
              select: { id: true, firstName: true, surname: true, gender: true, status: true },
            },
            branch: { select: { id: true, name: true } },
            level: { select: { id: true, name: true } },
            arm: { select: { name: true } },
            bedAllocation: {
              include: {
                room: {
                  include: {
                    floor: { select: { name: true } },
                    hostel: {
                      include: {
                        staff: {
                          include: {
                            staff: { select: { title: true, firstName: true, lastName: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : null;
    if (!e) {
      const exists = isUuid(studentId)
        ? await this.db.student.count({ where: { id: studentId, deletedAt: null } })
        : 0;
      if (!exists) throw AppException.notFound('That student doesn’t exist.', 'NOT_FOUND');
      throw conflict('Place the student in a class for this session first.', 'NOT_ENROLLED');
    }
    return e;
  }

  /** Whether the campus takes boarders in this class. */
  private async boardsAt(branchId: string, levelId: string) {
    return (await this.boarding.boardingLevels(branchId)).some((l) => l.id === levelId);
  }

  private placeOf(e: Awaited<ReturnType<BoardersService['enrolment']>>) {
    const a = e.bedAllocation;
    if (!a) return null;
    const masters = a.room.hostel.staff.filter(
      (s) =>
        s.role === 'HOUSE_MASTER' || (s.role === 'FLOOR_MASTER' && s.floorId === a.room.floorId),
    );
    return {
      hostelId: a.room.hostel.id,
      hostel: a.room.hostel.name,
      floor: a.room.floor?.name ?? null,
      roomId: a.room.id,
      room: a.room.name,
      bed: a.bed,
      since: a.allocatedOn.toISOString().slice(0, 10),
      houseStaff: masters.map((m) => ({
        staffId: m.staffId,
        name: staffName(m.staff),
        role: m.role === 'HOUSE_MASTER' ? 'House master / mistress' : 'Floor master / mistress',
      })),
    };
  }

  /** A student's boarding this session: whether they can board, whether they do, and where. */
  async student(studentId: string) {
    const session = await this.session();
    const e = await this.enrolment(studentId, session.id);
    const eligible = await this.boardsAt(e.branchId, e.levelId);
    return {
      studentId: e.student.id,
      name: `${e.student.firstName} ${e.student.surname}`,
      session: session.name,
      campus: e.branch.name,
      className: e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name,
      eligible,
      reason: eligible ? null : `${e.branch.name} doesn’t take boarders in ${e.level.name}.`,
      boarding: e.boarding,
      status: e.boarding ? 'Boarder' : 'Day',
      place: this.placeOf(e),
      editable: ON_ROLL.includes(e.student.status),
    };
  }

  /** Makes a student a boarder or a day student this session (optionally placing them too). */
  async setStatus(
    studentId: string,
    dto: { boarding: boolean; roomId?: string | null; bed?: string | null; confirm?: boolean },
  ) {
    const session = await this.session();
    const e = await this.enrolment(studentId, session.id);
    const name = `${e.student.firstName} ${e.student.surname}`;
    if (!ON_ROLL.includes(e.student.status))
      throw conflict(`${name} has left the school.`, 'STUDENT_LEFT');
    if (dto.boarding && !(await this.boardsAt(e.branchId, e.levelId)))
      throw invalid({ boarding: `${e.branch.name} doesn’t take boarders in ${e.level.name}.` });
    if (dto.boarding && dto.roomId) {
      // Check the place before changing anything, so a refusal leaves them as they were.
      await this.checkPlace(e, dto.roomId, dto.bed ?? null, !!dto.confirm, session.id);
    }
    await this.db.$transaction(async (tx) => {
      if (e.boarding !== dto.boarding) {
        await tx.enrollment.update({ where: { id: e.id }, data: { boarding: dto.boarding } });
        if (!dto.boarding) await tx.bedAllocation.deleteMany({ where: { enrollmentId: e.id } });
        await this.audit.record(
          {
            action: 'student.boarding',
            area: 'Boarding',
            entity: 'Student',
            entityId: e.studentId,
            summary: dto.boarding ? `${name} is now a boarder` : `${name} is now a day student`,
            detail: `${session.name}${!dto.boarding && e.bedAllocation ? ` · bed in ${e.bedAllocation.room.hostel.name} freed` : ''}`,
          },
          asTx(tx),
        );
      }
    });
    if (dto.boarding && dto.roomId)
      return this.allocate({ studentId, roomId: dto.roomId, bed: dto.bed ?? null, confirm: true });
    return this.student(studentId);
  }

  /** Marks several students as boarders or day students at once (each checked on its own). */
  async markMany(studentIds: string[], boarding: boolean) {
    const results: { studentId: string; name: string; done: boolean; reason: string | null }[] = [];
    for (const id of new Set(studentIds)) {
      try {
        const r = await this.setStatus(id, { boarding });
        results.push({ studentId: id, name: r.name, done: true, reason: null });
      } catch (err) {
        const s = isUuid(id)
          ? await this.db.student.findFirst({
              where: { id },
              select: { firstName: true, surname: true },
            })
          : null;
        results.push({
          studentId: id,
          name: s ? `${s.firstName} ${s.surname}` : 'Unknown student',
          done: false,
          reason: err instanceof Error ? err.message : 'Not changed',
        });
      }
    }
    return { results, changed: results.filter((r) => r.done).length };
  }

  /** Refusals (full room, taken bed, other campus) and warnings (gender, class) for a place. */
  private async checkPlace(
    e: Awaited<ReturnType<BoardersService['enrolment']>>,
    roomId: string,
    bed: string | null,
    confirm: boolean,
    sessionId: string,
  ) {
    const room = isUuid(roomId)
      ? await this.db.hostelRoom.findFirst({
          where: { id: roomId, archivedAt: null, hostel: { archivedAt: null } },
          include: { hostel: true },
        })
      : null;
    if (!room) throw invalid({ roomId: 'Choose a room.' });
    if (room.hostel.branchId !== e.branchId)
      throw invalid({ roomId: `${room.hostel.name} is at another campus.` });
    const use = (await roomUse(this.db, sessionId, [room.id])).get(room.id) ?? {
      taken: 0,
      beds: new Set<string>(),
    };
    const mine = e.bedAllocation?.roomId === room.id;
    const freeBeds = room.beds.filter(
      (b) => !use.beds.has(b) || (mine && e.bedAllocation?.bed === b),
    );
    if (!mine && use.taken >= room.capacity)
      throw conflict(
        `${room.hostel.name} · ${room.name} is full (${room.capacity} places).`,
        'ROOM_FULL',
      );
    let chosenBed: string | null = null;
    if (room.beds.length) {
      chosenBed = bed ?? freeBeds[0] ?? null;
      if (!chosenBed || !room.beds.includes(chosenBed))
        throw invalid({ bed: `Choose a bed in ${room.name}.` });
      if (!freeBeds.includes(chosenBed))
        throw conflict(`Bed ${chosenBed} in ${room.name} is taken.`, 'BED_TAKEN');
    }
    const warnings: string[] = [];
    const kind = STUDENT_GENDER[e.student.gender];
    if (room.hostel.gender === 'BOYS' && e.student.gender === 'FEMALE')
      warnings.push(`${room.hostel.name} is a boys’ hostel and this student is a ${kind}.`);
    if (room.hostel.gender === 'GIRLS' && e.student.gender === 'MALE')
      warnings.push(`${room.hostel.name} is a girls’ hostel and this student is a ${kind}.`);
    if (room.hostel.levelIds.length && !room.hostel.levelIds.includes(e.levelId))
      warnings.push(`${room.hostel.name} doesn’t usually take ${e.level.name} students.`);
    if (warnings.length && !confirm) throw new AllocationWarning(warnings);
    return { room, bed: chosenBed, warnings };
  }

  /** Gives a boarder a room (and bed), or moves them. */
  async allocate(dto: {
    studentId: string;
    roomId: string;
    bed?: string | null;
    confirm?: boolean;
  }) {
    const session = await this.session();
    const e = await this.enrolment(dto.studentId, session.id);
    const name = `${e.student.firstName} ${e.student.surname}`;
    if (!e.boarding)
      throw conflict(`${name} is a day student. Make them a boarder first.`, 'NOT_BOARDER');
    const place = await this.checkPlace(e, dto.roomId, dto.bed ?? null, !!dto.confirm, session.id);
    const today = lagosToday(this.clock.now());
    await this.db.$transaction(async (tx) => {
      // The room's places are checked again inside the transaction (two admins at once).
      const taken = await tx.bedAllocation.count({
        where: {
          roomId: place.room.id,
          enrollment: { sessionId: session.id, status: 'ACTIVE' },
          NOT: { enrollmentId: e.id },
        },
      });
      if (taken >= place.room.capacity)
        throw conflict(`${place.room.hostel.name} · ${place.room.name} is full.`, 'ROOM_FULL');
      await tx.bedAllocation.upsert({
        where: { schoolId_enrollmentId: { schoolId: this.schoolId(), enrollmentId: e.id } },
        create: {
          schoolId: this.schoolId(),
          enrollmentId: e.id,
          roomId: place.room.id,
          bed: place.bed,
          allocatedOn: today,
          allocatedById: RequestContext.get()?.userId ?? null,
        },
        update: {
          roomId: place.room.id,
          bed: place.bed,
          allocatedOn: today,
          allocatedById: RequestContext.get()?.userId ?? null,
        },
      });
      const where = `${place.room.hostel.name} · ${place.room.name}${place.bed ? ` · bed ${place.bed}` : ''}`;
      await this.audit.record(
        {
          action: 'student.bed',
          area: 'Boarding',
          entity: 'Student',
          entityId: e.studentId,
          summary: e.bedAllocation ? `${name} moved to ${where}` : `${name} placed in ${where}`,
          detail: place.warnings.length ? `Overridden: ${place.warnings.join(' ')}` : null,
        },
        asTx(tx),
      );
    });
    return this.student(dto.studentId);
  }

  /** Takes a boarder out of their room (they stay a boarder, waiting for a place). */
  async unallocate(studentId: string) {
    const session = await this.session();
    const e = await this.enrolment(studentId, session.id);
    if (!e.bedAllocation) return this.student(studentId);
    await this.db.$transaction(async (tx) => {
      await tx.bedAllocation.delete({ where: { id: e.bedAllocation!.id } });
      await this.audit.record(
        {
          action: 'student.bed',
          area: 'Boarding',
          entity: 'Student',
          entityId: e.studentId,
          summary: `${e.student.firstName} ${e.student.surname} taken out of ${e.bedAllocation!.room.hostel.name} · ${e.bedAllocation!.room.name}`,
        },
        asTx(tx),
      );
    });
    return this.student(studentId);
  }

  /** This session's boarders, with where each sleeps (or that they still need a place). */
  async boarders(q: {
    branchId?: string;
    hostelId?: string;
    levelId?: string;
    unplaced?: boolean;
    q?: string;
  }) {
    const session = await this.session();
    const text = (q.q ?? '').trim();
    const rows = await this.db.enrollment.findMany({
      where: {
        sessionId: session.id,
        status: 'ACTIVE',
        boarding: true,
        student: {
          status: { in: ON_ROLL },
          deletedAt: null,
          ...(text && {
            OR: [
              { firstName: { contains: text, mode: 'insensitive' } },
              { surname: { contains: text, mode: 'insensitive' } },
              { admissionNo: { contains: text, mode: 'insensitive' } },
            ],
          }),
        },
        ...(q.branchId && { branchId: q.branchId }),
        ...(q.levelId && { levelId: q.levelId }),
        ...(q.hostelId && { bedAllocation: { room: { hostelId: q.hostelId } } }),
        ...(q.unplaced && { bedAllocation: null }),
      },
      orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      include: {
        student: {
          select: { id: true, firstName: true, surname: true, admissionNo: true, gender: true },
        },
        branch: { select: { name: true } },
        level: { select: { name: true } },
        arm: { select: { name: true } },
        bedAllocation: {
          include: {
            room: {
              include: {
                hostel: { select: { id: true, name: true } },
                floor: { select: { name: true } },
              },
            },
          },
        },
      },
      take: 2000,
    });
    const list = rows.map((e) => ({
      studentId: e.student.id,
      name: `${e.student.firstName} ${e.student.surname}`,
      admissionNo: e.student.admissionNo,
      gender: e.student.gender === 'FEMALE' ? 'Female' : 'Male',
      campus: e.branch.name,
      branchId: e.branchId,
      levelId: e.levelId,
      className: e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name,
      place: e.bedAllocation
        ? {
            hostelId: e.bedAllocation.room.hostel.id,
            hostel: e.bedAllocation.room.hostel.name,
            floor: e.bedAllocation.room.floor?.name ?? null,
            roomId: e.bedAllocation.roomId,
            room: e.bedAllocation.room.name,
            bed: e.bedAllocation.bed,
          }
        : null,
    }));
    return {
      session: session.name,
      boarders: list,
      totals: {
        boarders: list.length,
        placed: list.filter((b) => b.place).length,
        unplaced: list.filter((b) => !b.place).length,
      },
    };
  }

  /** A hostel's rooms with who sleeps in each this session. */
  async occupancy(hostelId: string) {
    const session = await this.session();
    const hostel = await this.boarding.hostel(hostelId);
    const allocations = await this.db.bedAllocation.findMany({
      where: {
        room: { hostelId: hostel.id },
        enrollment: { sessionId: session.id, status: 'ACTIVE' },
      },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, firstName: true, surname: true, gender: true } },
            level: { select: { name: true } },
            arm: { select: { name: true } },
          },
        },
      },
    });
    const rooms = hostel.rooms.map((r) => {
      const here = allocations.filter((a) => a.roomId === r.id);
      return {
        ...r,
        taken: here.length,
        free: Math.max(0, r.capacity - here.length),
        occupants: here
          .map((a) => ({
            studentId: a.enrollment.student.id,
            name: `${a.enrollment.student.firstName} ${a.enrollment.student.surname}`,
            gender: a.enrollment.student.gender === 'FEMALE' ? 'Female' : 'Male',
            className: a.enrollment.arm
              ? armLabel(a.enrollment.level.name, a.enrollment.arm.name)
              : a.enrollment.level.name,
            bed: a.bed,
          }))
          .sort((x, y) =>
            (x.bed ?? x.name).localeCompare(y.bed ?? y.name, 'en', { numeric: true }),
          ),
      };
    });
    const taken = rooms.reduce((a, r) => a + r.taken, 0);
    return {
      session: session.name,
      hostel: { id: hostel.id, name: hostel.name, campus: hostel.campus, gender: hostel.gender },
      floors: hostel.floors.map((f) => ({ id: f.id, name: f.name })),
      rooms,
      totals: { places: hostel.totals.places, taken, free: hostel.totals.places - taken },
    };
  }

  /**
   * Fills a hostel's free places with boarders at its campus who have no place yet, matching its
   * gender and classes. Classmates go into the same rooms, or are spread across rooms.
   */
  async autoAllocate(hostelId: string, dto: { keepClassmates?: boolean }) {
    const session = await this.session();
    const hostel = await this.db.hostel.findFirst({
      where: { id: isUuid(hostelId) ? hostelId : undefined, archivedAt: null },
      include: {
        rooms: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!hostel) throw AppException.notFound('That hostel doesn’t exist.', 'NOT_FOUND');
    const boardingLevels = (await this.boarding.boardingLevels(hostel.branchId)).map((l) => l.id);
    const levels = hostel.levelIds.length ? hostel.levelIds : boardingLevels;
    const waiting = await this.db.enrollment.findMany({
      where: {
        sessionId: session.id,
        status: 'ACTIVE',
        boarding: true,
        branchId: hostel.branchId,
        levelId: { in: levels },
        bedAllocation: null,
        student: {
          status: { in: ON_ROLL },
          deletedAt: null,
          ...(hostel.gender === 'BOYS' && { gender: 'MALE' }),
          ...(hostel.gender === 'GIRLS' && { gender: 'FEMALE' }),
        },
      },
      include: {
        student: { select: { firstName: true, surname: true } },
        arm: { select: { name: true } },
        level: { select: { sortOrder: true } },
      },
    });
    const byClass = (a: (typeof waiting)[number], b: (typeof waiting)[number]) =>
      a.level.sortOrder - b.level.sortOrder ||
      (a.armId ?? '').localeCompare(b.armId ?? '') ||
      a.student.surname.localeCompare(b.student.surname);
    let queue = [...waiting].sort(byClass);
    if (!dto.keepClassmates) {
      // Take one from each class in turn, so rooms mix classes.
      const groups = new Map<string, typeof waiting>();
      for (const w of queue)
        groups.set(w.armId ?? w.levelId, [...(groups.get(w.armId ?? w.levelId) ?? []), w]);
      const lists = [...groups.values()];
      queue = [];
      for (let i = 0; lists.some((l) => l.length > i); i++)
        for (const l of lists) if (l[i]) queue.push(l[i]!);
    }
    const use = await roomUse(
      this.db,
      session.id,
      hostel.rooms.map((r) => r.id),
    );
    const today = lagosToday(this.clock.now());
    const placed: { enrollmentId: string; roomId: string; bed: string | null }[] = [];
    for (const room of hostel.rooms) {
      const u = use.get(room.id) ?? { taken: 0, beds: new Set<string>() };
      let free = room.capacity - u.taken;
      const freeBeds = room.beds.filter((b) => !u.beds.has(b));
      while (free > 0 && queue.length) {
        const next = queue.shift()!;
        placed.push({
          enrollmentId: next.id,
          roomId: room.id,
          bed: room.beds.length ? (freeBeds.shift() ?? null) : null,
        });
        free--;
      }
      if (!queue.length) break;
    }
    if (placed.length)
      await this.db.$transaction(async (tx) => {
        await tx.bedAllocation.createMany({
          data: placed.map((p) => ({
            schoolId: this.schoolId(),
            enrollmentId: p.enrollmentId,
            roomId: p.roomId,
            bed: p.bed,
            allocatedOn: today,
            allocatedById: RequestContext.get()?.userId ?? null,
          })),
          skipDuplicates: true,
        });
        await this.audit.record(
          {
            action: 'hostel.allocate',
            area: 'Boarding',
            entity: 'Hostel',
            entityId: hostel.id,
            summary: `${placed.length} boarder${placed.length === 1 ? '' : 's'} placed in ${hostel.name}`,
            detail: `${GENDER_LABEL[hostel.gender]} · ${dto.keepClassmates ? 'classmates together' : 'classes mixed'}${queue.length ? ` · ${queue.length} still waiting (no space)` : ''}`,
          },
          asTx(tx),
        );
      });
    return { placed: placed.length, waiting: queue.length, ...(await this.occupancy(hostel.id)) };
  }
}
