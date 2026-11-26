import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PortalAccessService } from '../../auth/portal-access.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ExeatKind, ExeatStatus, Prisma } from '../../generated/prisma/client.js';
import { displayPhone } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { toE164 } from '../staff/staff-view.js';
import { ON_ROLL } from '../students/student-view.js';
import { boardingActor, requireBoarding, type BoardingActor } from './boarding-actor.js';
import { BoardingAlertsService } from './boarding-alerts.service.js';
import { boardingSession } from './boarding-use.js';

export const KIND_LABEL: Record<ExeatKind, string> = {
  WEEKEND: 'Weekend',
  MEDICAL: 'Medical',
  FAMILY: 'Family event',
  EMERGENCY: 'Emergency',
  TERM_BREAK: 'Term break',
  OTHER: 'Other',
};
const KIND_OF = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k])) as Record<
  string,
  ExeatKind
>;
export const STATUS_LABEL: Record<ExeatStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  OUT: 'Out',
  RETURNED: 'Returned',
};
const STATUS_OF = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([k, v]) => [v, k]),
) as Record<string, ExeatStatus>;

const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);
const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
const notFound = () => AppException.notFound('That exeat doesn’t exist.', 'EXEAT_NOT_FOUND');

/** "2026-12-04T15:00" (Lagos time, as the screens send it) or a full ISO time. */
function parseWhen(v: string | null | undefined) {
  if (!v) return null;
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.length === 16 ? `${v}:00` : v}+01:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** "Fri 4 Dec, 15:00" in Lagos time. */
export const whenLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

const EXEAT_INCLUDE = {
  student: {
    select: {
      id: true,
      firstName: true,
      surname: true,
      admissionNo: true,
      gender: true,
      guardians: {
        where: { guardian: { deletedAt: null, mergedIntoId: null } },
        orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
        select: {
          relationship: true,
          guardian: { select: { id: true, title: true, fullName: true, phone: true } },
        },
      },
    },
  },
  pickupPerson: true,
  branch: { select: { name: true } },
} satisfies Prisma.ExeatInclude;
type ExeatRow = Prisma.ExeatGetPayload<{ include: typeof EXEAT_INCLUDE }>;

const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

/**
 * Exeats (leave from school) and the gate. A parent asks for one in the Parent Portal (who
 * collects the child: themselves, another parent, or someone they've approved); the boarder's
 * house master or mistress approves or declines it, and the Head of boarding (anyone with
 * `boarding.manage`) can decide or cancel any. Staff can also create one directly, and the office
 * can send every boarder home for a term break in one go. At the gate the boarder is signed out
 * to an approved person and signed back in; overdue returns are flagged. Parents are told when an
 * exeat is decided and when their child leaves and returns.
 */
@Injectable()
export class ExeatsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: PortalAccessService,
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

  actor(auth: AuthUserContext) {
    return boardingActor(this.db, auth);
  }

  /* ---------------- Where boarders are ---------------- */

  /** Each student's boarding this session: class, campus and hostel (when placed). */
  private async places(studentIds: string[]) {
    const session = await boardingSession(this.db);
    if (!session || !studentIds.length) return new Map<string, Place>();
    const rows = await this.db.enrollment.findMany({
      where: { sessionId: session.id, studentId: { in: studentIds }, status: 'ACTIVE' },
      select: {
        studentId: true,
        boarding: true,
        branchId: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
        bedAllocation: {
          select: {
            bed: true,
            room: { select: { name: true, hostel: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    return new Map<string, Place>(
      rows.map((r) => [
        r.studentId,
        {
          boarding: r.boarding,
          branchId: r.branchId,
          className: r.arm ? armLabel(r.level.name, r.arm.name) : r.level.name,
          hostelId: r.bedAllocation?.room.hostel.id ?? null,
          hostel: r.bedAllocation?.room.hostel.name ?? null,
          room: r.bedAllocation?.room.name ?? null,
        },
      ]),
    );
  }

  /** Staff see their own hostels' boarders; the Head of boarding sees everyone. */
  private inScope(actor: BoardingActor, place: Place | undefined) {
    if (actor.allHostels) return true;
    return !!place?.hostelId && actor.hostelIds.has(place.hostelId);
  }

  private async names(userIds: (string | null)[]) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    const users = ids.length
      ? await this.db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private view(e: ExeatRow, place: Place | undefined, names: Map<string, string>, now: Date) {
    const g = e.student.guardians;
    return {
      id: e.id,
      student: {
        id: e.student.id,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        className: place?.className ?? '',
        hostel: place?.hostel ?? null,
        room: place?.room ?? null,
      },
      campus: e.branch.name,
      kind: KIND_LABEL[e.kind],
      reason: e.reason,
      leaveAt: e.leaveAt.toISOString(),
      returnBy: e.returnBy.toISOString(),
      leaves: whenLabel(e.leaveAt),
      returns: whenLabel(e.returnBy),
      pickup: e.pickupPerson
        ? {
            pickupPersonId: e.pickupPerson.id,
            name: e.pickupPerson.name,
            relationship: e.pickupPerson.relationship,
            phone: displayPhone(e.pickupPerson.phone),
            note: e.pickupPerson.note,
          }
        : null,
      /** Who may collect at the gate: the named pickup person, or else the parents. */
      collectors: e.pickupPerson
        ? [
            {
              key: `pickup:${e.pickupPerson.id}`,
              name: e.pickupPerson.name,
              relationship: e.pickupPerson.relationship,
            },
          ]
        : g.map((x) => ({
            key: `guardian:${x.guardian.id}`,
            name: guardianName(x.guardian),
            relationship: x.relationship,
          })),
      status: STATUS_LABEL[e.status],
      requestedBy: e.requestedByParent ? 'Parent' : 'School',
      requestedByName: names.get(e.requestedByUserId ?? '') ?? null,
      decidedBy: names.get(e.decidedByUserId ?? '') ?? null,
      decisionNote: e.decisionNote,
      signedOutAt: e.signedOutAt?.toISOString() ?? null,
      collectedBy: e.collectedBy,
      signedInAt: e.signedInAt?.toISOString() ?? null,
      overdue: e.status === 'OUT' && e.returnBy < now,
      lateReturn: !!e.signedInAt && e.signedInAt > e.returnBy,
    };
  }

  private async views(rows: ExeatRow[]) {
    const [places, names] = await Promise.all([
      this.places(rows.map((r) => r.studentId)),
      this.names(rows.flatMap((r) => [r.requestedByUserId, r.decidedByUserId])),
    ]);
    const now = this.clock.now();
    return rows.map((r) => this.view(r, places.get(r.studentId), names, now));
  }

  private async find(id: string) {
    const e = isUuid(id)
      ? await this.db.exeat.findFirst({ where: { id }, include: EXEAT_INCLUDE })
      : null;
    if (!e) throw notFound();
    return e;
  }

  private async one(id: string) {
    return (await this.views([await this.find(id)]))[0]!;
  }

  /* ---------------- Lists ---------------- */

  /** Exeats staff can see, newest first (their hostels', or every one for the Head of boarding). */
  async list(
    auth: AuthUserContext,
    q: {
      status?: string;
      branchId?: string;
      hostelId?: string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'view');
    const status = q.status ? STATUS_OF[q.status] : undefined;
    const text = q.q?.trim();
    const rows = await this.db.exeat.findMany({
      where: {
        ...(status && { status }),
        ...(q.branchId && { branchId: q.branchId }),
        ...(q.from && { returnBy: { gte: parseWhen(`${q.from}T00:00`) ?? undefined } }),
        ...(q.to && { leaveAt: { lte: parseWhen(`${q.to}T23:59`) ?? undefined } }),
        ...(text && {
          student: {
            OR: [
              { firstName: { contains: text, mode: 'insensitive' } },
              { surname: { contains: text, mode: 'insensitive' } },
              { admissionNo: { contains: text, mode: 'insensitive' } },
            ],
          },
        }),
      },
      include: EXEAT_INCLUDE,
      orderBy: [{ leaveAt: 'desc' }],
      take: 500,
    });
    const all = await this.views(rows);
    const places = await this.places(rows.map((r) => r.studentId));
    const mine = all.filter(
      (v) =>
        this.inScope(actor, places.get(v.student.id)) &&
        (!q.hostelId || places.get(v.student.id)?.hostelId === q.hostelId),
    );
    return {
      exeats: mine,
      totals: {
        requested: mine.filter((x) => x.status === 'Requested').length,
        out: mine.filter((x) => x.status === 'Out').length,
        overdue: mine.filter((x) => x.overdue).length,
      },
    };
  }

  async get(auth: AuthUserContext, id: string) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'view');
    const e = await this.find(id);
    const place = (await this.places([e.studentId])).get(e.studentId);
    if (!this.inScope(actor, place) && !actor.can('gate')) throw notFound();
    return this.one(id);
  }

  /* ---------------- Asking and deciding ---------------- */

  /** Checks the dates, kind, pickup person and that the student is a boarder. */
  private async checkRequest(
    studentId: string,
    dto: {
      kind: string;
      reason?: string;
      leaveAt: string;
      returnBy: string;
      pickupPersonId?: string | null;
    },
    allowTermBreak = false,
  ) {
    const errors: Record<string, string> = {};
    const kind = KIND_OF[dto.kind];
    if (!kind || (kind === 'TERM_BREAK' && !allowTermBreak))
      errors.kind = 'Choose the kind of exeat.';
    const leaveAt = parseWhen(dto.leaveAt);
    const returnBy = parseWhen(dto.returnBy);
    const now = this.clock.now();
    if (!leaveAt) errors.leaveAt = 'Choose when they leave.';
    else if (leaveAt.getTime() < now.getTime() - 3_600_000)
      errors.leaveAt = 'Choose a time from now on.';
    if (!returnBy) errors.returnBy = 'Choose when they come back.';
    else if (leaveAt && returnBy <= leaveAt)
      errors.returnBy = 'They must come back after they leave.';
    else if (leaveAt && returnBy.getTime() - leaveAt.getTime() > 120 * 86_400_000)
      errors.returnBy = 'An exeat can last up to 120 days.';
    const reason = (dto.reason ?? '').trim();
    if (reason.length > 500) errors.reason = 'Keep the reason to 500 characters.';
    if ((kind === 'MEDICAL' || kind === 'EMERGENCY' || kind === 'OTHER') && !reason)
      errors.reason = 'Say why.';
    const place = (await this.places([studentId])).get(studentId);
    if (!place?.boarding) errors.studentId = 'Exeats are for boarders.';
    let pickupPersonId: string | null = null;
    if (dto.pickupPersonId) {
      const p = isUuid(dto.pickupPersonId)
        ? await this.db.pickupPerson.findFirst({
            where: { id: dto.pickupPersonId, studentId, removedAt: null },
            select: { id: true },
          })
        : null;
      if (!p) errors.pickupPersonId = 'Choose someone on the approved pickup list.';
      else pickupPersonId = p.id;
    }
    if (Object.keys(errors).length) throw invalid(errors);
    return {
      kind: kind!,
      reason,
      leaveAt: leaveAt!,
      returnBy: returnBy!,
      pickupPersonId,
      place: place!,
    };
  }

  /** No two live exeats for a student at the same time. */
  private async noOverlap(studentId: string, leaveAt: Date, returnBy: Date, exceptId?: string) {
    const clash = await this.db.exeat.findFirst({
      where: {
        studentId,
        status: { in: ['REQUESTED', 'APPROVED', 'OUT'] },
        leaveAt: { lt: returnBy },
        returnBy: { gt: leaveAt },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { leaveAt: true },
    });
    if (clash)
      throw conflict(
        `There’s already an exeat for those dates (leaving ${whenLabel(clash.leaveAt)}).`,
        'EXEAT_OVERLAP',
      );
  }

  /** House staff of the boarder's hostel, to tell them about a request. */
  private async houseStaffOf(hostelId: string | null) {
    if (!hostelId) return [];
    return (
      await this.db.hostelStaff.findMany({ where: { hostelId }, select: { staffId: true } })
    ).map((s) => s.staffId);
  }

  /** Parent Portal: a parent asks for an exeat for their boarder. */
  async parentRequest(
    auth: AuthUserContext,
    studentId: string,
    dto: {
      kind: string;
      reason?: string;
      leaveAt: string;
      returnBy: string;
      pickupPersonId?: string | null;
    },
  ) {
    const guardian = await this.guardian(auth, studentId);
    const r = await this.checkRequest(studentId, dto);
    await this.noOverlap(studentId, r.leaveAt, r.returnBy);
    const e = await this.db.$transaction(async (tx) => {
      const row = await tx.exeat.create({
        data: {
          schoolId: this.schoolId(),
          studentId,
          branchId: r.place.branchId,
          kind: r.kind,
          reason: r.reason,
          leaveAt: r.leaveAt,
          returnBy: r.returnBy,
          pickupPersonId: r.pickupPersonId,
          status: 'REQUESTED',
          requestedByUserId: auth.userId,
          requestedByParent: true,
        },
      });
      await this.audit.record(
        {
          action: 'exeat.request',
          area: 'Boarding',
          entity: 'Student',
          entityId: studentId,
          summary: `Exeat requested by ${guardian}`,
          detail: `${KIND_LABEL[r.kind]} · ${whenLabel(r.leaveAt)} – ${whenLabel(r.returnBy)}`,
        },
        asTx(tx),
      );
      return row;
    });
    const view = await this.one(e.id);
    await this.alerts.staff(await this.houseStaffOf(r.place.hostelId), {
      title: `Exeat request: ${view.student.name}`,
      body: `${guardian} asked for a ${view.kind.toLowerCase()} exeat: ${view.leaves} to ${view.returns}.${r.reason ? ` ${r.reason}` : ''}`,
      link: `/exeats/${e.id}`,
      entityType: 'Exeat',
      entityId: e.id,
    });
    return view;
  }

  /** Staff create an exeat directly: it's approved straight away. */
  async create(
    auth: AuthUserContext,
    dto: {
      studentId: string;
      kind: string;
      reason?: string;
      leaveAt: string;
      returnBy: string;
      pickupPersonId?: string | null;
    },
  ) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'exeats');
    if (!isUuid(dto.studentId)) throw invalid({ studentId: 'Choose a boarder.' });
    const r = await this.checkRequest(dto.studentId, dto);
    if (!this.inScope(actor, r.place))
      throw AppException.forbidden('That boarder isn’t in a hostel you look after.', 'FORBIDDEN');
    await this.noOverlap(dto.studentId, r.leaveAt, r.returnBy);
    const now = this.clock.now();
    const e = await this.db.$transaction(async (tx) => {
      const row = await tx.exeat.create({
        data: {
          schoolId: this.schoolId(),
          studentId: dto.studentId,
          branchId: r.place.branchId,
          kind: r.kind,
          reason: r.reason,
          leaveAt: r.leaveAt,
          returnBy: r.returnBy,
          pickupPersonId: r.pickupPersonId,
          status: 'APPROVED',
          requestedByUserId: auth.userId,
          decidedByUserId: auth.userId,
          decidedAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'exeat.create',
          area: 'Boarding',
          entity: 'Student',
          entityId: dto.studentId,
          summary: `Exeat given by ${actor.name}`,
          detail: `${KIND_LABEL[r.kind]} · ${whenLabel(r.leaveAt)} – ${whenLabel(r.returnBy)}`,
        },
        asTx(tx),
      );
      return row;
    });
    const view = await this.one(e.id);
    await this.alerts.parents(dto.studentId, {
      title: `Exeat for ${view.student.name}`,
      body: `The school has given ${view.student.name} a ${view.kind.toLowerCase()} exeat: ${view.leaves} to ${view.returns}.`,
      link: '/boarding',
      entityType: 'Exeat',
      entityId: e.id,
    });
    return view;
  }

  /** The house master approves or declines a request; the Head of boarding can decide any. */
  async decide(auth: AuthUserContext, id: string, dto: { approve: boolean; note?: string }) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'exeats');
    const e = await this.find(id);
    const place = (await this.places([e.studentId])).get(e.studentId);
    if (!this.inScope(actor, place))
      throw AppException.forbidden('That boarder isn’t in a hostel you look after.', 'FORBIDDEN');
    if (e.status !== 'REQUESTED')
      throw conflict(
        `This exeat is already ${STATUS_LABEL[e.status].toLowerCase()}.`,
        'EXEAT_DECIDED',
      );
    const note = (dto.note ?? '').trim().slice(0, 500);
    if (!dto.approve && !note) throw invalid({ note: 'Say why it’s declined, for the parent.' });
    const moved = await this.db.$transaction(async (tx) => {
      const r = await tx.exeat.updateMany({
        where: { id: e.id, status: 'REQUESTED' },
        data: {
          status: dto.approve ? 'APPROVED' : 'DECLINED',
          decidedByUserId: auth.userId,
          decidedAt: this.clock.now(),
          decisionNote: note,
        },
      });
      if (r.count)
        await this.audit.record(
          {
            action: 'exeat.decide',
            area: 'Boarding',
            entity: 'Student',
            entityId: e.studentId,
            summary: `Exeat ${dto.approve ? 'approved' : 'declined'} by ${actor.name}`,
            detail: note || null,
          },
          asTx(tx),
        );
      return r.count;
    });
    if (!moved)
      throw conflict('This exeat changed meanwhile. Reload and try again.', 'EXEAT_CHANGED');
    const view = await this.one(e.id);
    await this.alerts.parents(e.studentId, {
      title: `Exeat ${dto.approve ? 'approved' : 'declined'}: ${view.student.name}`,
      body: dto.approve
        ? `${view.student.name}’s exeat is approved: ${view.leaves} to ${view.returns}.${note ? ` ${note}` : ''}`
        : `${view.student.name}’s exeat request was declined. ${note}`,
      link: '/boarding',
      entityType: 'Exeat',
      entityId: e.id,
    });
    return view;
  }

  /** Cancels an exeat that hasn't started (the parent who asked, house staff or the Head). */
  async cancel(auth: AuthUserContext, id: string, asParent = false) {
    const e = await this.find(id);
    if (asParent) {
      await this.guardian(auth, e.studentId);
      if (e.status !== 'REQUESTED' && e.status !== 'APPROVED')
        throw conflict('Only an exeat that hasn’t started can be cancelled.', 'EXEAT_STARTED');
    } else {
      const actor = await this.actor(auth);
      requireBoarding(actor, 'exeats');
      const place = (await this.places([e.studentId])).get(e.studentId);
      if (!this.inScope(actor, place))
        throw AppException.forbidden('That boarder isn’t in a hostel you look after.', 'FORBIDDEN');
      if (e.status !== 'REQUESTED' && e.status !== 'APPROVED')
        throw conflict('Only an exeat that hasn’t started can be cancelled.', 'EXEAT_STARTED');
    }
    await this.db.$transaction(async (tx) => {
      await tx.exeat.update({ where: { id: e.id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        {
          action: 'exeat.cancel',
          area: 'Boarding',
          entity: 'Student',
          entityId: e.studentId,
          summary: `Exeat cancelled${asParent ? ' by a parent' : ''}`,
        },
        asTx(tx),
      );
    });
    return this.one(e.id);
  }

  /** Sends every boarder at a campus (or in one hostel) home for a term break: approved exeats. */
  async termBreak(
    auth: AuthUserContext,
    dto: {
      branchId: string;
      hostelId?: string | null;
      leaveAt: string;
      returnBy: string;
      reason?: string;
    },
  ) {
    const actor = await this.actor(auth);
    requireBoarding(
      actor,
      'manage',
      'Only the Head of boarding can send boarders home for a break.',
    );
    const leaveAt = parseWhen(dto.leaveAt);
    const returnBy = parseWhen(dto.returnBy);
    if (!leaveAt) throw invalid({ leaveAt: 'Choose when they leave.' });
    if (!returnBy || returnBy <= leaveAt)
      throw invalid({ returnBy: 'They must come back after they leave.' });
    const session = await boardingSession(this.db);
    if (!session) throw conflict('There’s no session set up yet.', 'NO_SESSION');
    const boarders = await this.db.enrollment.findMany({
      where: {
        sessionId: session.id,
        status: 'ACTIVE',
        boarding: true,
        branchId: dto.branchId,
        student: { status: { in: ON_ROLL }, deletedAt: null },
        ...(dto.hostelId && { bedAllocation: { room: { hostelId: dto.hostelId } } }),
      },
      select: { studentId: true },
    });
    const busy = new Set(
      (
        await this.db.exeat.findMany({
          where: {
            studentId: { in: boarders.map((b) => b.studentId) },
            status: { in: ['REQUESTED', 'APPROVED', 'OUT'] },
            leaveAt: { lt: returnBy },
            returnBy: { gt: leaveAt },
          },
          select: { studentId: true },
        })
      ).map((x) => x.studentId),
    );
    const go = boarders.filter((b) => !busy.has(b.studentId));
    const batchId = randomUUID();
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      if (go.length)
        await tx.exeat.createMany({
          data: go.map((b) => ({
            schoolId: this.schoolId(),
            studentId: b.studentId,
            branchId: dto.branchId,
            kind: 'TERM_BREAK' as const,
            reason: (dto.reason ?? '').trim().slice(0, 500),
            leaveAt,
            returnBy,
            status: 'APPROVED' as const,
            requestedByUserId: auth.userId,
            decidedByUserId: auth.userId,
            decidedAt: now,
            batchId,
          })),
        });
      await this.audit.record(
        {
          action: 'exeat.term_break',
          area: 'Boarding',
          entity: 'School',
          summary: `${go.length} boarder${go.length === 1 ? '' : 's'} sent home for a break`,
          detail: `${whenLabel(leaveAt)} – ${whenLabel(returnBy)}${busy.size ? ` · ${busy.size} already had an exeat` : ''}`,
        },
        asTx(tx),
      );
    });
    for (const b of go)
      await this.alerts.parents(b.studentId, {
        title: 'Break: time to collect your child',
        body: `Boarders go home from ${whenLabel(leaveAt)} and return by ${whenLabel(returnBy)}.${dto.reason ? ` ${dto.reason}` : ''} Please come with your Parent Portal pickup details.`,
        link: '/boarding',
        entityType: 'Exeat',
        entityId: batchId,
      });
    return { created: go.length, skipped: busy.size, batchId };
  }

  /* ---------------- The gate ---------------- */

  /** Who leaves today (approved, not yet out), who is out (and overdue), and visitors on site. */
  async gate(auth: AuthUserContext, branchId?: string | null) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'gate', 'Only gate staff can use the gate.');
    const now = this.clock.now();
    const endOfToday = new Date(now.getTime() + 24 * 3_600_000);
    const where = branchId ? { branchId } : {};
    const [leaving, out, visitors] = await Promise.all([
      this.db.exeat.findMany({
        where: { ...where, status: 'APPROVED', leaveAt: { lte: endOfToday } },
        include: EXEAT_INCLUDE,
        orderBy: { leaveAt: 'asc' },
      }),
      this.db.exeat.findMany({
        where: { ...where, status: 'OUT' },
        include: EXEAT_INCLUDE,
        orderBy: { returnBy: 'asc' },
      }),
      this.db.gateVisitor.findMany({
        where: { ...where, outAt: null },
        orderBy: { inAt: 'desc' },
        include: { student: { select: { firstName: true, surname: true } } },
      }),
    ]);
    const outViews = await this.views(out);
    return {
      leaving: await this.views(leaving),
      out: outViews,
      overdue: outViews.filter((x) => x.overdue).length,
      visitors: visitors.map((v) => ({
        id: v.id,
        name: v.name,
        phone: v.phone ? displayPhone(v.phone) : '',
        purpose: v.purpose,
        visiting: v.student ? `${v.student.firstName} ${v.student.surname}` : null,
        inAt: v.inAt.toISOString(),
      })),
    };
  }

  /** Signs a boarder out to someone allowed to collect them. */
  async signOut(auth: AuthUserContext, id: string, dto: { collector: string }) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'gate', 'Only gate staff can sign boarders out.');
    const e = await this.find(id);
    if (e.status !== 'APPROVED')
      throw conflict(
        e.status === 'REQUESTED'
          ? 'This exeat isn’t approved yet. They can’t leave.'
          : `This exeat is ${STATUS_LABEL[e.status].toLowerCase()}.`,
        'EXEAT_NOT_APPROVED',
      );
    const view = (await this.views([e]))[0]!;
    // Term breaks: any parent or approved pickup person may collect.
    const extra =
      e.kind === 'TERM_BREAK'
        ? (
            await this.db.pickupPerson.findMany({
              where: { studentId: e.studentId, removedAt: null },
            })
          ).map((p) => ({ key: `pickup:${p.id}`, name: p.name, relationship: p.relationship }))
        : [];
    const allowed = [
      ...view.collectors,
      ...(e.kind === 'TERM_BREAK'
        ? e.student.guardians.map((x) => ({
            key: `guardian:${x.guardian.id}`,
            name: guardianName(x.guardian),
            relationship: x.relationship,
          }))
        : []),
      ...extra,
    ];
    const who = allowed.find((c) => c.key === dto.collector);
    if (!who)
      throw invalid({
        collector: 'Only a parent or someone on the approved list can collect them.',
      });
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      const r = await tx.exeat.updateMany({
        where: { id: e.id, status: 'APPROVED' },
        data: {
          status: 'OUT',
          signedOutAt: now,
          signedOutByUserId: auth.userId,
          collectedBy: `${who.name} (${who.relationship})`,
        },
      });
      if (!r.count)
        throw conflict('This exeat changed meanwhile. Reload and try again.', 'EXEAT_CHANGED');
      await this.audit.record(
        {
          action: 'exeat.out',
          area: 'Boarding',
          entity: 'Student',
          entityId: e.studentId,
          summary: `Signed out at the gate to ${who.name}`,
          detail: `By ${actor.name}`,
        },
        asTx(tx),
      );
    });
    await this.alerts.parents(e.studentId, {
      title: `${view.student.name} has left school`,
      body: `${view.student.name} was signed out at ${whenLabel(now)} to ${who.name} (${who.relationship}). Due back by ${view.returns}.`,
      link: '/boarding',
      entityType: 'Exeat',
      entityId: e.id,
    });
    return this.one(e.id);
  }

  /** Signs a boarder back in. */
  async signIn(auth: AuthUserContext, id: string) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'gate', 'Only gate staff can sign boarders in.');
    const e = await this.find(id);
    if (e.status !== 'OUT') throw conflict('This boarder isn’t signed out.', 'EXEAT_NOT_OUT');
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      await tx.exeat.update({
        where: { id: e.id },
        data: { status: 'RETURNED', signedInAt: now, signedInByUserId: auth.userId },
      });
      await this.audit.record(
        {
          action: 'exeat.in',
          area: 'Boarding',
          entity: 'Student',
          entityId: e.studentId,
          summary: `Back at school${now > e.returnBy ? ' (late)' : ''}`,
          detail: `Signed in by ${actor.name}`,
        },
        asTx(tx),
      );
    });
    const view = await this.one(e.id);
    await this.alerts.parents(e.studentId, {
      title: `${view.student.name} is back at school`,
      body: `${view.student.name} was signed back in at ${whenLabel(now)}.`,
      link: '/boarding',
      entityType: 'Exeat',
      entityId: e.id,
    });
    return view;
  }

  async logVisitor(
    auth: AuthUserContext,
    dto: {
      branchId: string;
      name: string;
      phone?: string;
      purpose: string;
      studentId?: string | null;
    },
  ) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'gate', 'Only gate staff can log visitors.');
    const errors: Record<string, string> = {};
    const name = (dto.name ?? '').trim();
    if (!name) errors.name = 'Enter the visitor’s name.';
    const purpose = (dto.purpose ?? '').trim();
    if (!purpose) errors.purpose = 'Say why they’re visiting.';
    const phone = dto.phone?.trim() ? toE164(dto.phone) : null;
    if (dto.phone?.trim() && !phone) errors.phone = 'Enter a Nigerian phone number.';
    const branch = isUuid(dto.branchId)
      ? await this.db.branch.findFirst({ where: { id: dto.branchId }, select: { id: true } })
      : null;
    if (!branch) errors.branchId = 'Choose the campus.';
    if (dto.studentId && !isUuid(dto.studentId)) errors.studentId = 'Choose a student.';
    if (Object.keys(errors).length) throw invalid(errors);
    await this.db.gateVisitor.create({
      data: {
        schoolId: this.schoolId(),
        branchId: branch!.id,
        name,
        phone: phone ?? '',
        purpose: purpose.slice(0, 200),
        studentId: dto.studentId || null,
        inAt: this.clock.now(),
        loggedByUserId: auth.userId,
      },
    });
    return this.gate(auth, branch!.id);
  }

  async visitorOut(auth: AuthUserContext, id: string) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'gate', 'Only gate staff can log visitors.');
    const v = isUuid(id) ? await this.db.gateVisitor.findFirst({ where: { id } }) : null;
    if (!v) throw AppException.notFound('That visitor isn’t logged.', 'NOT_FOUND');
    if (!v.outAt)
      await this.db.gateVisitor.update({ where: { id }, data: { outAt: this.clock.now() } });
    return this.gate(auth, v.branchId);
  }

  /* ---------------- Pickup people ---------------- */

  /** The parent's own name (403/404 unless the child is theirs and still at the school). */
  private async guardian(auth: AuthUserContext, studentId: string) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'GUARDIAN', status: 'ACTIVE' },
      include: { guardian: true },
    });
    if (!m?.guardian)
      throw AppException.forbidden('This isn’t a parent account here.', 'NO_ACCESS');
    const links = await this.access.parentChildren(this.schoolId(), m.guardian.id);
    if (!links.some((l) => l.studentId === studentId && l.access === 'full'))
      throw AppException.notFound('That child isn’t linked to your account.', 'NOT_FOUND');
    return guardianName(m.guardian);
  }

  async pickups(studentId: string) {
    const rows = await this.db.pickupPerson.findMany({
      where: { studentId, removedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      phone: displayPhone(p.phone),
      note: p.note,
    }));
  }

  async addPickup(
    studentId: string,
    userId: string,
    dto: { name: string; relationship: string; phone: string; note?: string },
  ) {
    const errors: Record<string, string> = {};
    const name = (dto.name ?? '').trim();
    if (!name) errors.name = 'Enter their full name.';
    const relationship = (dto.relationship ?? '').trim();
    if (!relationship) errors.relationship = 'Say who they are to the child (e.g. Uncle, Driver).';
    const phone = toE164(dto.phone ?? '');
    if (!phone) errors.phone = 'Enter a Nigerian phone number.';
    if (Object.keys(errors).length) throw invalid(errors);
    const count = await this.db.pickupPerson.count({ where: { studentId, removedAt: null } });
    if (count >= 10) throw conflict('Up to 10 people can be on the pickup list.', 'PICKUP_LIMIT');
    await this.db.pickupPerson.create({
      data: {
        schoolId: this.schoolId(),
        studentId,
        name: name.slice(0, 120),
        relationship: relationship.slice(0, 60),
        phone: phone!,
        note: (dto.note ?? '').trim().slice(0, 200),
        addedByUserId: userId,
      },
    });
    return this.pickups(studentId);
  }

  async removePickup(studentId: string, id: string) {
    const p = isUuid(id)
      ? await this.db.pickupPerson.findFirst({ where: { id, studentId, removedAt: null } })
      : null;
    if (!p) throw AppException.notFound('That person isn’t on the list.', 'NOT_FOUND');
    await this.db.pickupPerson.update({ where: { id }, data: { removedAt: this.clock.now() } });
    return this.pickups(studentId);
  }

  /** Parent Portal: a child's pickup list and exeats. */
  async parentView(auth: AuthUserContext, studentId: string) {
    await this.guardian(auth, studentId);
    const place = (await this.places([studentId])).get(studentId);
    const rows = await this.db.exeat.findMany({
      where: { studentId },
      include: EXEAT_INCLUDE,
      orderBy: { leaveAt: 'desc' },
      take: 50,
    });
    return {
      boarder: !!place?.boarding,
      pickups: await this.pickups(studentId),
      exeats: await this.views(rows),
    };
  }

  async parentAddPickup(
    auth: AuthUserContext,
    studentId: string,
    dto: { name: string; relationship: string; phone: string; note?: string },
  ) {
    await this.guardian(auth, studentId);
    return this.addPickup(studentId, auth.userId, dto);
  }

  async parentRemovePickup(auth: AuthUserContext, studentId: string, id: string) {
    await this.guardian(auth, studentId);
    return this.removePickup(studentId, id);
  }

  async parentCancel(auth: AuthUserContext, id: string) {
    return this.cancel(auth, id, true);
  }

  /** Staff: a boarder's pickup list (house staff of their hostel or the Head of boarding). */
  async staffPickups(auth: AuthUserContext, studentId: string) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'view');
    return this.pickups(studentId);
  }

  async staffAddPickup(
    auth: AuthUserContext,
    studentId: string,
    dto: { name: string; relationship: string; phone: string; note?: string },
  ) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'exeats');
    return this.addPickup(studentId, auth.userId, dto);
  }

  async staffRemovePickup(auth: AuthUserContext, studentId: string, id: string) {
    const actor = await this.actor(auth);
    requireBoarding(actor, 'exeats');
    return this.removePickup(studentId, id);
  }
}

interface Place {
  boarding: boolean;
  branchId: string;
  className: string;
  hostelId: string | null;
  hostel: string | null;
  room: string | null;
}
