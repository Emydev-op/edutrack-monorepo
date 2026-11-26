import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { lagosToday } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { boardingActor, requireBoarding, type BoardingActor } from './boarding-actor.js';
import { BoardingAlertsService } from './boarding-alerts.service.js';
import { boardingSession } from './boarding-use.js';
import { whenLabel } from './exeats.service.js';

export const INCIDENT_CATEGORIES = [
  'Lateness',
  'Out of bounds',
  'Fighting',
  'Bullying',
  'Property damage',
  'Contraband',
  'Untidiness',
  'Health or welfare concern',
  'Other',
] as const;

export const DEFAULT_CHECKLIST = [
  'Mattress',
  'Bedsheets and pillow',
  'Bucket',
  'Cutlery and plate',
  'Toiletries',
  'Uniforms',
  'Provisions',
];

const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The rest of boarding-house life: visiting days (parents see them), hostel incidents (house
 * staff record them; ones shared with parents show in the Parent Portal and tell them), property
 * checklists at resumption and departure, and the boarding dashboard for the Head of boarding.
 */
@Injectable()
export class HouseLifeService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly alerts: BoardingAlertsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  /* ---------------- Visiting days ---------------- */

  async visitingDays(opts: { from?: Date; branchId?: string | null } = {}) {
    const from = opts.from ?? lagosToday(this.clock.now());
    const rows = await this.db.visitingDay.findMany({
      where: {
        date: { gte: from },
        ...(opts.branchId !== undefined && {
          OR: [{ branchId: opts.branchId }, { branchId: null }],
        }),
      },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
      include: { branch: { select: { name: true } } },
      take: 50,
    });
    return rows.map((v) => ({
      id: v.id,
      date: iso(v.date),
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      campus: v.branch?.name ?? 'All campuses',
      branchId: v.branchId,
      note: v.note,
    }));
  }

  async addVisitingDay(
    auth: AuthUserContext,
    dto: {
      branchId?: string | null;
      date: string;
      startsAt: string;
      endsAt: string;
      note?: string;
    },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'manage');
    const errors: Record<string, string> = {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dto.date ?? '')
      ? new Date(`${dto.date}T00:00:00.000Z`)
      : null;
    if (!date || Number.isNaN(date.getTime())) errors.date = 'Choose a date.';
    else if (date < lagosToday(this.clock.now())) errors.date = 'Choose a date from today on.';
    if (!TIME.test(dto.startsAt ?? '')) errors.startsAt = 'Choose a start time.';
    if (!TIME.test(dto.endsAt ?? '')) errors.endsAt = 'Choose an end time.';
    else if (TIME.test(dto.startsAt ?? '') && dto.endsAt <= dto.startsAt)
      errors.endsAt = 'It must end after it starts.';
    if (dto.branchId && !isUuid(dto.branchId)) errors.branchId = 'Choose a campus.';
    if (Object.keys(errors).length) throw invalid(errors);
    const day = await this.db.visitingDay.create({
      data: {
        schoolId: this.schoolId(),
        branchId: dto.branchId || null,
        date: date!,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        note: (dto.note ?? '').trim().slice(0, 300),
      },
    });
    // Parents of boarders at that campus hear about it.
    const session = await boardingSession(this.db);
    if (session) {
      const boarders = await this.db.enrollment.findMany({
        where: {
          sessionId: session.id,
          status: 'ACTIVE',
          boarding: true,
          ...(dto.branchId && { branchId: dto.branchId }),
        },
        select: { studentId: true },
      });
      for (const b of boarders)
        await this.alerts.parents(b.studentId, {
          title: 'Visiting day',
          body: `Visiting day: ${dto.date} from ${dto.startsAt} to ${dto.endsAt}.${dto.note ? ` ${dto.note}` : ''}`,
          link: '/boarding',
          entityType: 'VisitingDay',
          entityId: day.id,
        });
    }
    return this.visitingDays();
  }

  async removeVisitingDay(auth: AuthUserContext, id: string) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'manage');
    if (isUuid(id)) await this.db.visitingDay.deleteMany({ where: { id } });
    return this.visitingDays();
  }

  /* ---------------- Incidents ---------------- */

  private async hostelOf(studentId: string) {
    const session = await boardingSession(this.db);
    if (!session) return null;
    const e = await this.db.enrollment.findFirst({
      where: { studentId, sessionId: session.id, status: 'ACTIVE' },
      select: {
        boarding: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
        bedAllocation: {
          select: { room: { select: { hostelId: true, hostel: { select: { name: true } } } } },
        },
      },
    });
    return e
      ? {
          boarding: e.boarding,
          className: e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name,
          hostelId: e.bedAllocation?.room.hostelId ?? null,
          hostel: e.bedAllocation?.room.hostel.name ?? null,
        }
      : null;
  }

  private canSee(actor: BoardingActor, hostelId: string | null) {
    return actor.allHostels || (!!hostelId && actor.hostelIds.has(hostelId));
  }

  async incidents(
    auth: AuthUserContext,
    q: { studentId?: string; hostelId?: string; status?: string },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'view');
    const rows = await this.db.hostelIncident.findMany({
      where: {
        ...(q.studentId && isUuid(q.studentId) && { studentId: q.studentId }),
        ...(q.hostelId && isUuid(q.hostelId) && { hostelId: q.hostelId }),
        ...(q.status === 'Open' && { status: 'OPEN' }),
        ...(q.status === 'Closed' && { status: 'CLOSED' }),
        ...(!actor.allHostels && { hostelId: { in: [...actor.hostelIds] } }),
      },
      include: {
        student: { select: { id: true, firstName: true, surname: true, admissionNo: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 300,
    });
    const [hostels, users] = await Promise.all([
      this.db.hostel.findMany({
        where: { id: { in: rows.map((r) => r.hostelId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      }),
      this.db.user.findMany({
        where: { id: { in: rows.map((r) => r.reportedByUserId).filter((x): x is string => !!x) } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return {
      categories: INCIDENT_CATEGORIES,
      incidents: rows.map((r) => ({
        id: r.id,
        student: {
          id: r.student.id,
          name: `${r.student.firstName} ${r.student.surname}`,
          admissionNo: r.student.admissionNo,
        },
        hostel: hostels.find((h) => h.id === r.hostelId)?.name ?? null,
        occurredAt: r.occurredAt.toISOString(),
        when: whenLabel(r.occurredAt),
        category: r.category,
        description: r.description,
        action: r.action,
        status: r.status === 'OPEN' ? 'Open' : 'Closed',
        sharedWithParent: r.sharedWithParent,
        reportedBy: (() => {
          const u = users.find((x) => x.id === r.reportedByUserId);
          return u ? `${u.firstName} ${u.lastName}` : null;
        })(),
      })),
    };
  }

  async recordIncident(
    auth: AuthUserContext,
    dto: {
      studentId: string;
      category: string;
      description: string;
      action?: string;
      occurredAt?: string | null;
      shareWithParent?: boolean;
    },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'rollcall', 'Only house staff can record hostel incidents.');
    const errors: Record<string, string> = {};
    const place = isUuid(dto.studentId) ? await this.hostelOf(dto.studentId) : null;
    if (!place?.boarding) errors.studentId = 'Choose a boarder.';
    else if (!this.canSee(actor, place.hostelId))
      errors.studentId = 'That boarder isn’t in a hostel you look after.';
    if (!(INCIDENT_CATEGORIES as readonly string[]).includes(dto.category))
      errors.category = 'Choose what happened.';
    const description = (dto.description ?? '').trim();
    if (!description) errors.description = 'Describe what happened.';
    const occurredAt = dto.occurredAt
      ? new Date(
          /[zZ]|[+-]\d\d:?\d\d$/.test(dto.occurredAt)
            ? dto.occurredAt
            : `${dto.occurredAt}${dto.occurredAt.length === 16 ? ':00' : ''}+01:00`,
        )
      : this.clock.now();
    if (Number.isNaN(occurredAt.getTime()) || occurredAt > this.clock.now())
      errors.occurredAt = 'Choose when it happened (not in the future).';
    if (Object.keys(errors).length) throw invalid(errors);
    const share = !!dto.shareWithParent;
    const row = await this.db.$transaction(async (tx) => {
      const r = await tx.hostelIncident.create({
        data: {
          schoolId: this.schoolId(),
          studentId: dto.studentId,
          hostelId: place!.hostelId,
          occurredAt,
          category: dto.category,
          description: description.slice(0, 2000),
          action: (dto.action ?? '').trim().slice(0, 1000),
          sharedWithParent: share,
          reportedByUserId: auth.userId,
        },
      });
      await this.audit.record(
        {
          action: 'hostel.incident',
          area: 'Boarding',
          entity: 'Student',
          entityId: dto.studentId,
          summary: `Hostel incident: ${dto.category}`,
          detail: `Recorded by ${actor.name}${share ? ' · shared with parents' : ''}`,
        },
        asTx(tx),
      );
      return r;
    });
    if (share) {
      const s = await this.db.student.findFirstOrThrow({
        where: { id: dto.studentId },
        select: { firstName: true, surname: true },
      });
      await this.alerts.parents(dto.studentId, {
        title: `A note from ${place!.hostel ?? 'the boarding house'}`,
        body: `${s.firstName} ${s.surname} · ${dto.category}: ${description}${dto.action ? ` What we did: ${dto.action}` : ''}`,
        link: '/boarding',
        entityType: 'HostelIncident',
        entityId: row.id,
      });
    }
    return this.incidents(auth, { studentId: dto.studentId });
  }

  async closeIncident(auth: AuthUserContext, id: string, action?: string) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'rollcall', 'Only house staff can close hostel incidents.');
    const r = isUuid(id) ? await this.db.hostelIncident.findFirst({ where: { id } }) : null;
    if (!r || !this.canSee(actor, r.hostelId))
      throw AppException.notFound('That incident doesn’t exist.', 'NOT_FOUND');
    await this.db.hostelIncident.update({
      where: { id },
      data: {
        status: 'CLOSED',
        ...(action?.trim() && {
          action: [r.action, action.trim()].filter(Boolean).join('\n').slice(0, 1000),
        }),
      },
    });
    return this.incidents(auth, { studentId: r.studentId });
  }

  /* ---------------- Property checklists ---------------- */

  async checklist() {
    let items = await this.db.boardingChecklistItem.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (!items.length) {
      // A school starts with the usual list, which it can change.
      await this.db.boardingChecklistItem.createMany({
        data: DEFAULT_CHECKLIST.map((name, i) => ({
          schoolId: this.schoolId(),
          name,
          sortOrder: i,
        })),
        skipDuplicates: true,
      });
      items = await this.db.boardingChecklistItem.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }
    return items.map((i) => ({ id: i.id, name: i.name }));
  }

  async setChecklist(auth: AuthUserContext, names: string[]) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'manage');
    const clean = [
      ...new Set((names ?? []).map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)),
    ];
    if (!clean.length) throw invalid({ items: 'Keep at least one item.' });
    if (clean.length > 40) throw invalid({ items: 'Up to 40 items.' });
    await this.db.$transaction(async (tx) => {
      await tx.boardingChecklistItem.updateMany({
        where: { name: { notIn: clean } },
        data: { archivedAt: new Date() },
      });
      for (const [i, name] of clean.entries())
        await tx.boardingChecklistItem.upsert({
          where: { schoolId_name: { schoolId: this.schoolId(), name } },
          create: { schoolId: this.schoolId(), name: name.slice(0, 60), sortOrder: i },
          update: { sortOrder: i, archivedAt: null },
        });
    });
    return this.checklist();
  }

  private async term() {
    return (
      (await this.db.term.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
      })) ??
      (await this.db.term.findFirst({
        where: { startsOn: { lte: this.clock.now() } },
        orderBy: { startsOn: 'desc' },
        select: { id: true, name: true },
      }))
    );
  }

  /** A boarder's check-in and check-out this term, against the school's list. */
  async propertyChecks(studentId: string) {
    const [items, term] = await Promise.all([this.checklist(), this.term()]);
    const rows = term
      ? await this.db.propertyCheck.findMany({ where: { studentId, termId: term.id } })
      : [];
    const view = (kind: 'CHECK_IN' | 'CHECK_OUT') => {
      const r = rows.find((x) => x.kind === kind);
      return r
        ? {
            checkedAt: r.checkedAt.toISOString(),
            note: r.note,
            items: r.items as { item: string; present: boolean; quantity: number; note: string }[],
          }
        : null;
    };
    return {
      term: term?.name ?? null,
      items,
      checkIn: view('CHECK_IN'),
      checkOut: view('CHECK_OUT'),
    };
  }

  async staffPropertyChecks(auth: AuthUserContext, studentId: string) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'view');
    return this.propertyChecks(studentId);
  }

  async saveCheck(
    auth: AuthUserContext,
    studentId: string,
    dto: {
      kind: 'Check-in' | 'Check-out';
      items: { item: string; present: boolean; quantity?: number; note?: string }[];
      note?: string;
    },
  ) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'rollcall', 'Only house staff can check boarders’ property.');
    const place = isUuid(studentId) ? await this.hostelOf(studentId) : null;
    if (!place?.boarding) throw invalid({ studentId: 'Choose a boarder.' });
    if (!this.canSee(actor, place.hostelId))
      throw AppException.forbidden('That boarder isn’t in a hostel you look after.', 'FORBIDDEN');
    const kind =
      dto.kind === 'Check-out' ? 'CHECK_OUT' : dto.kind === 'Check-in' ? 'CHECK_IN' : null;
    if (!kind) throw invalid({ kind: 'Choose check-in or check-out.' });
    const term = await this.term();
    if (!term) throw new AppException(HttpStatus.CONFLICT, 'There’s no term under way.', 'NO_TERM');
    const items = (dto.items ?? [])
      .slice(0, 60)
      .map((i) => ({
        item: String(i.item ?? '')
          .trim()
          .slice(0, 60),
        present: !!i.present,
        quantity: Math.max(
          0,
          Math.min(99, Math.round(Number(i.quantity ?? (i.present ? 1 : 0)) || 0)),
        ),
        note: String(i.note ?? '')
          .trim()
          .slice(0, 120),
      }))
      .filter((i) => i.item);
    const data = {
      items: items as unknown as Prisma.InputJsonValue,
      note: (dto.note ?? '').trim().slice(0, 500),
      checkedByUserId: auth.userId,
      checkedAt: this.clock.now(),
    };
    await this.db.propertyCheck.upsert({
      where: { studentId_termId_kind: { studentId, termId: term.id, kind } },
      create: { schoolId: this.schoolId(), studentId, termId: term.id, kind, ...data },
      update: data,
    });
    return this.propertyChecks(studentId);
  }

  /* ---------------- Dashboard ---------------- */

  /** The boarding house at a glance for the Head of boarding (or their own hostels for house staff). */
  async dashboard(auth: AuthUserContext) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'view');
    const session = await boardingSession(this.db);
    const now = this.clock.now();
    const today = lagosToday(now);
    const hostelFilter = actor.allHostels ? {} : { id: { in: [...actor.hostelIds] } };
    const roomFilter = { room: { hostel: { archivedAt: null, ...hostelFilter } } };
    const [
      boarders,
      placed,
      hostels,
      out,
      overdue,
      requested,
      leavingToday,
      inSickBay,
      visitors,
      incidentsOpen,
      rollCalls,
    ] = await Promise.all([
      session
        ? this.db.enrollment.count({
            where: {
              sessionId: session.id,
              status: 'ACTIVE',
              boarding: true,
              ...(!actor.allHostels && { bedAllocation: roomFilter }),
            },
          })
        : 0,
      session
        ? this.db.bedAllocation.count({
            where: { enrollment: { sessionId: session.id, status: 'ACTIVE' }, ...roomFilter },
          })
        : 0,
      this.db.hostel.findMany({
        where: { archivedAt: null, ...hostelFilter },
        select: {
          id: true,
          rollCallSlots: true,
          rooms: { where: { archivedAt: null }, select: { capacity: true } },
        },
      }),
      this.db.exeat.count({ where: { status: 'OUT' } }),
      this.db.exeat.count({ where: { status: 'OUT', returnBy: { lt: now } } }),
      this.db.exeat.count({ where: { status: 'REQUESTED' } }),
      this.db.exeat.count({
        where: { status: 'APPROVED', leaveAt: { lte: new Date(today.getTime() + 2 * 86_400_000) } },
      }),
      this.db.sickBayVisit.count({ where: { outcome: 'ADMITTED', dischargedAt: null } }),
      this.db.gateVisitor.count({ where: { outAt: null } }),
      this.db.hostelIncident.count({
        where: {
          status: 'OPEN',
          ...(!actor.allHostels && { hostelId: { in: [...actor.hostelIds] } }),
        },
      }),
      this.db.rollCall.findMany({
        where: {
          date: today,
          ...(!actor.allHostels && { hostelId: { in: [...actor.hostelIds] } }),
        },
        select: {
          hostelId: true,
          slot: true,
          marks: { where: { mark: 'ABSENT' }, select: { id: true } },
        },
      }),
    ]);
    const expected = hostels.reduce((a, h) => a + h.rollCallSlots.length, 0);
    const places = hostels.reduce((a, h) => a + h.rooms.reduce((x, r) => x + r.capacity, 0), 0);
    return {
      session: session?.name ?? null,
      boarders,
      placed,
      needingPlace: Math.max(0, boarders - placed),
      places,
      freePlaces: Math.max(0, places - placed),
      onCampus: Math.max(0, placed - out),
      exeats: { requested, out, overdue, leavingSoon: leavingToday },
      sickBay: inSickBay,
      visitorsOnSite: visitors,
      incidentsOpen,
      rollCalls: {
        expected,
        taken: new Set(rollCalls.map((r) => `${r.hostelId}|${r.slot}`)).size,
        absentToday: rollCalls.reduce((a, r) => a + r.marks.length, 0),
      },
      nextVisitingDay: (await this.visitingDays())[0] ?? null,
    };
  }

  /**
   * Students to pick in boarding screens (the nurse, the Head of boarding, house staff): boarders
   * in the hostels they look after, or (sick bay, Head of boarding) anyone on the roll. Searchable
   * by name, admission number or class; up to 300 (all boarders in scope when `boarders`).
   */
  async students(auth: AuthUserContext, q: { q?: string; boarders?: boolean }) {
    const actor = await boardingActor(this.db, auth);
    requireBoarding(actor, 'view');
    const session = await boardingSession(this.db);
    if (!session) return [];
    const wide = actor.allHostels || actor.can('health');
    const text = (q.q ?? '').trim();
    const rows = await this.db.enrollment.findMany({
      where: {
        sessionId: session.id,
        status: 'ACTIVE',
        student: {
          status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] },
          deletedAt: null,
          ...(text && {
            OR: [
              { firstName: { contains: text, mode: 'insensitive' } },
              { surname: { contains: text, mode: 'insensitive' } },
              { admissionNo: { contains: text, mode: 'insensitive' } },
            ],
          }),
        },
        ...((q.boarders || !wide) && { boarding: true }),
        ...(!wide && { bedAllocation: { room: { hostelId: { in: [...actor.hostelIds] } } } }),
      },
      select: {
        boarding: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            admissionNo: true,
            medicalNotes: true,
          },
        },
        bedAllocation: {
          select: { room: { select: { name: true, hostel: { select: { name: true } } } } },
        },
      },
      orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      take: 300,
    });
    return rows.map((r) => ({
      studentId: r.student.id,
      name: `${r.student.firstName} ${r.student.surname}`,
      admissionNo: r.student.admissionNo,
      className: r.arm ? armLabel(r.level.name, r.arm.name) : r.level.name,
      boarder: r.boarding,
      place: r.bedAllocation
        ? `${r.bedAllocation.room.hostel.name} · ${r.bedAllocation.room.name}`
        : r.boarding
          ? 'Boarder · needs a place'
          : 'Day student',
      medicalNotes: r.student.medicalNotes ?? '',
    }));
  }

  /** Parent Portal: visiting days, and incidents shared with them. */
  async forParent(studentId: string) {
    const student = await this.db.student.findFirst({
      where: { id: studentId },
      select: { branchId: true },
    });
    const [days, incidents, checks] = await Promise.all([
      this.visitingDays({ branchId: student?.branchId ?? null }),
      this.db.hostelIncident.findMany({
        where: { studentId, sharedWithParent: true },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      }),
      this.propertyChecks(studentId),
    ]);
    return {
      visitingDays: days,
      incidents: incidents.map((i) => ({
        id: i.id,
        when: whenLabel(i.occurredAt),
        category: i.category,
        description: i.description,
        action: i.action,
      })),
      property: checks,
    };
  }
}
