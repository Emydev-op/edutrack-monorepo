import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { requireScopedBranch, scopedBranchIds } from './boarding-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { HostelGender, HostelStaffRole } from '../../generated/prisma/enums.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { staffName } from '../academics/academic-format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { boardingSession, roomUse } from './boarding-use.js';

export const GENDER_LABEL: Record<HostelGender, 'Boys' | 'Girls' | 'Mixed'> = {
  BOYS: 'Boys',
  GIRLS: 'Girls',
  MIXED: 'Mixed',
};
export const GENDER_OF: Record<string, HostelGender> = {
  boys: 'BOYS',
  girls: 'GIRLS',
  mixed: 'MIXED',
};
export const ROLE_LABEL: Record<HostelStaffRole, string> = {
  HOUSE_MASTER: 'House master / mistress',
  FLOOR_MASTER: 'Floor master / mistress',
  ASSISTANT: 'Assistant',
};
const ROLE_OF: Record<string, HostelStaffRole> = {
  'house master / mistress': 'HOUSE_MASTER',
  house_master: 'HOUSE_MASTER',
  'floor master / mistress': 'FLOOR_MASTER',
  floor_master: 'FLOOR_MASTER',
  assistant: 'ASSISTANT',
};

export const MAX_ROOM_CAPACITY = 200;
const MAX_ROOMS_AT_ONCE = 200;

const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);
const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
const notFound = (what: string) =>
  AppException.notFound(`That ${what} doesn’t exist.`, 'NOT_FOUND');
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Bed labels for a room: none, 1…n, or A…Z (then AA, AB…). */
export function bedLabels(style: string | undefined, capacity: number): string[] {
  if (style === 'numbers') return Array.from({ length: capacity }, (_, i) => String(i + 1));
  if (style === 'letters')
    return Array.from({ length: capacity }, (_, i) => {
      let n = i;
      let s = '';
      do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      return s;
    });
  return [];
}

export interface HostelInput {
  branchId: string;
  name: string;
  gender: string;
  levelIds?: string[];
  note?: string;
}
export interface RoomInput {
  name: string;
  capacity: number;
  floorId?: string | null;
  beds?: string[];
}
export interface GenerateInput {
  floorId?: string | null;
  count: number;
  prefix?: string;
  startAt?: number;
  capacity: number;
  bedStyle?: 'none' | 'numbers' | 'letters';
}

/**
 * Boarding set-up: where the school takes boarders (each section at each campus, optionally only
 * some of its class levels), and its hostels: hostel (campus, boys/girls/mixed, the levels it
 * takes) → optional floors or wings → rooms with a capacity and optional bed labels, plus the
 * house staff (house master or mistress, floor masters, assistants) from the staff list.
 */
@Injectable()
export class BoardingService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  /* ---------------- Where boarding is offered ---------------- */

  /** Each active campus with its sections and class levels, and which of them take boarders. */
  async settings() {
    const [branches, levels] = await Promise.all([
      this.db.branch.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ isOriginal: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          branchSections: {
            select: {
              sectionId: true,
              boarding: true,
              boardingLevelIds: true,
              section: { select: { name: true, sortOrder: true } },
            },
          },
        },
      }),
      this.db.classLevel.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sectionId: true },
      }),
    ]);
    const campuses = branches.map((b) => ({
      branchId: b.id,
      name: b.name,
      sections: b.branchSections
        .sort((x, y) => x.section.sortOrder - y.section.sortOrder)
        .map((s) => ({
          sectionId: s.sectionId,
          name: s.section.name,
          boarding: s.boarding,
          /** Empty = every level of the section boards. */
          levelIds: s.boardingLevelIds,
          levels: levels
            .filter((l) => l.sectionId === s.sectionId)
            .map((l) => ({ id: l.id, name: l.name })),
        })),
    }));
    return {
      enabled: campuses.some((c) => c.sections.some((s) => s.boarding)),
      campuses,
    };
  }

  /** Sets which sections take boarders at each campus (and, optionally, which of their levels). */
  async saveSettings(
    campuses: {
      branchId: string;
      sections: { sectionId: string; boarding: boolean; levelIds?: string[] }[];
    }[],
  ) {
    const current = await this.settings();
    const changes: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const c of campuses ?? []) {
        const campus = current.campuses.find((x) => x.branchId === c.branchId);
        if (!campus) throw invalid({ campuses: 'Choose campuses that are open.' });
        for (const s of c.sections ?? []) {
          const section = campus.sections.find((x) => x.sectionId === s.sectionId);
          if (!section) throw invalid({ campuses: `${campus.name} doesn’t run that section.` });
          const allowed = new Set(section.levels.map((l) => l.id));
          const levelIds = [...new Set(s.levelIds ?? [])].filter((id) => allowed.has(id));
          // Every level chosen is the same as "all levels".
          const stored = levelIds.length === allowed.size ? [] : levelIds;
          if (s.boarding && (s.levelIds ?? []).length && !levelIds.length)
            throw invalid({
              campuses: `Choose which ${section.name} classes board at ${campus.name}.`,
            });
          if (
            section.boarding === !!s.boarding &&
            [...section.levelIds].sort().join() === [...stored].sort().join()
          )
            continue;
          // Classes that stop boarding can't still have boarders this session.
          const stillBoard = s.boarding
            ? stored.length
              ? new Set(stored)
              : new Set(section.levels.map((l) => l.id))
            : new Set<string>();
          const stopping = section.levels.filter((l) => !stillBoard.has(l.id)).map((l) => l.id);
          const session = stopping.length ? await boardingSession(tx) : null;
          const left = session
            ? await tx.enrollment.count({
                where: {
                  sessionId: session.id,
                  status: 'ACTIVE',
                  boarding: true,
                  branchId: c.branchId,
                  levelId: { in: stopping },
                },
              })
            : 0;
          if (left)
            throw conflict(
              `${left} ${section.name} student${left === 1 ? ' is a boarder' : 's are boarders'} at ${campus.name}. Make them day students first.`,
              'BOARDERS_REMAIN',
            );
          await tx.branchSection.update({
            where: { branchId_sectionId: { branchId: c.branchId, sectionId: s.sectionId } },
            data: { boarding: !!s.boarding, boardingLevelIds: s.boarding ? stored : [] },
          });
          changes.push(
            `${campus.name} · ${section.name}: ${
              s.boarding
                ? stored.length
                  ? `boarding for ${section.levels
                      .filter((l) => stored.includes(l.id))
                      .map((l) => l.name)
                      .join(', ')}`
                  : 'boarding'
                : 'day only'
            }`,
          );
        }
      }
      if (changes.length)
        await this.audit.record(
          {
            action: 'boarding.settings',
            area: 'Boarding',
            entity: 'School',
            summary: 'Boarding set-up changed',
            detail: changes.join(' · '),
          },
          asTx(tx),
        );
    });
    return this.settings();
  }

  /** The class levels that board at a campus (every level of each boarding section, or those chosen). */
  async boardingLevels(branchId: string) {
    const sections = await this.db.branchSection.findMany({
      where: { branchId, boarding: true },
      select: { sectionId: true, boardingLevelIds: true },
    });
    if (!sections.length) return [];
    const levels = await this.db.classLevel.findMany({
      where: { sectionId: { in: sections.map((s) => s.sectionId) } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, sectionId: true },
    });
    return levels.filter((l) => {
      const s = sections.find((x) => x.sectionId === l.sectionId)!;
      return !s.boardingLevelIds.length || s.boardingLevelIds.includes(l.id);
    });
  }

  /* ---------------- Hostels ---------------- */

  private hostelInclude = {
    branch: { select: { id: true, name: true } },
    floors: { orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }] },
    rooms: {
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
    },
    staff: {
      include: {
        staff: { select: { id: true, title: true, firstName: true, lastName: true, status: true } },
      },
    },
  };

  private async findHostel(id: string) {
    const h = isUuid(id)
      ? await this.db.hostel.findFirst({
          where: { id, archivedAt: null },
          include: this.hostelInclude,
        })
      : null;
    if (!h) throw notFound('hostel');
    return h;
  }

  private view(
    h: Awaited<ReturnType<BoardingService['findHostel']>>,
    levelNames: Map<string, string>,
    use: Map<string, { taken: number }>,
  ) {
    const places = h.rooms.reduce((a, r) => a + r.capacity, 0);
    const takenIn = (roomId: string) => use.get(roomId)?.taken ?? 0;
    const taken = h.rooms.reduce((a, r) => a + takenIn(r.id), 0);
    const room = (r: (typeof h.rooms)[number]) => ({
      id: r.id,
      name: r.name,
      floorId: r.floorId,
      capacity: r.capacity,
      beds: r.beds,
      taken: takenIn(r.id),
    });
    const staff = (s: (typeof h.staff)[number]) => ({
      id: s.id,
      staffId: s.staffId,
      name: staffName(s.staff),
      role: ROLE_LABEL[s.role],
      floorId: s.floorId,
      active: s.staff.status === 'ACTIVE',
    });
    return {
      id: h.id,
      name: h.name,
      branchId: h.branch.id,
      campus: h.branch.name,
      gender: GENDER_LABEL[h.gender],
      levelIds: h.levelIds,
      levels: h.levelIds.length
        ? h.levelIds.map((id) => levelNames.get(id) ?? 'Removed class')
        : ['All boarding classes'],
      note: h.note,
      floors: h.floors.map((f) => ({
        id: f.id,
        name: f.name,
        rooms: h.rooms.filter((r) => r.floorId === f.id).length,
        places: h.rooms.filter((r) => r.floorId === f.id).reduce((a, r) => a + r.capacity, 0),
        staff: h.staff.filter((s) => s.floorId === f.id).map(staff),
      })),
      rooms: h.rooms.map(room),
      staff: h.staff.map(staff),
      totals: {
        floors: h.floors.length,
        rooms: h.rooms.length,
        places,
        taken,
        free: places - taken,
      },
    };
  }

  /** Places taken this session in these rooms (empty before any session exists). */
  private async use(roomIds?: string[]) {
    const session = await boardingSession(this.db);
    return session
      ? roomUse(this.db, session.id, roomIds)
      : new Map<string, { taken: number; beds: Set<string> }>();
  }

  private async levelNames() {
    const levels = await this.db.classLevel.findMany({ select: { id: true, name: true } });
    return new Map(levels.map((l) => [l.id, l.name]));
  }

  /** Every hostel with its campus, who it houses, and its rooms and places. */
  async hostels(branchId?: string | null) {
    const [rows, names] = await Promise.all([
      this.db.hostel.findMany({
        where: {
          archivedAt: null,
          ...(branchId && { branchId }),
          ...(scopedBranchIds() && { AND: [{ branchId: { in: scopedBranchIds()! } }] }),
        },
        orderBy: [{ branch: { name: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: this.hostelInclude,
      }),
      this.levelNames(),
    ]);
    const use = await this.use(rows.flatMap((h) => h.rooms.map((r) => r.id)));
    const list = rows.map((h) => this.view(h, names, use));
    return {
      hostels: list,
      totals: {
        hostels: list.length,
        rooms: list.reduce((a, h) => a + h.totals.rooms, 0),
        places: list.reduce((a, h) => a + h.totals.places, 0),
        taken: list.reduce((a, h) => a + h.totals.taken, 0),
      },
    };
  }

  async hostel(id: string) {
    const h = await this.findHostel(id);
    requireScopedBranch(h.branchId);
    return this.view(h, await this.levelNames(), await this.use(h.rooms.map((r) => r.id)));
  }

  /** Checks a hostel's details against the campus's boarding set-up. */
  private async checkHostel(dto: HostelInput, exceptId?: string) {
    const errors: Record<string, string> = {};
    const name = clean(dto.name);
    if (!name) errors.name = 'Name the hostel.';
    else if (name.length > 60) errors.name = 'Keep the name to 60 characters.';
    const gender = GENDER_OF[clean(dto.gender).toLowerCase()];
    if (!gender) errors.gender = 'Choose Boys, Girls or Mixed.';
    const branch = isUuid(dto.branchId)
      ? await this.db.branch.findFirst({
          where: { id: dto.branchId, status: 'ACTIVE' },
          select: { id: true, name: true },
        })
      : null;
    if (!branch) errors.branchId = 'Choose a campus.';
    let levelIds: string[] = [];
    if (branch) {
      const boarding = await this.boardingLevels(branch.id);
      if (!boarding.length)
        errors.branchId = `${branch.name} doesn’t take boarders yet. Turn boarding on for a section there first.`;
      levelIds = [...new Set(dto.levelIds ?? [])];
      const allowed = new Set(boarding.map((l) => l.id));
      if (levelIds.some((id) => !allowed.has(id)))
        errors.levelIds = 'Choose classes that board at this campus.';
      if (levelIds.length === allowed.size) levelIds = [];
      if (name && !errors.name) {
        const same = await this.db.hostel.findFirst({
          where: {
            branchId: branch.id,
            archivedAt: null,
            name: { equals: name, mode: 'insensitive' },
            ...(exceptId && { id: { not: exceptId } }),
          },
          select: { id: true },
        });
        if (same) errors.name = `${branch.name} already has a hostel called ${name}.`;
      }
    }
    if (Object.keys(errors).length) throw invalid(errors);
    return {
      name,
      gender: gender!,
      branchId: branch!.id,
      levelIds,
      note: clean(dto.note).slice(0, 300),
    };
  }

  async createHostel(dto: HostelInput) {
    const data = await this.checkHostel(dto);
    const h = await this.db.$transaction(async (tx) => {
      const row = await tx.hostel.create({ data: { schoolId: this.schoolId(), ...data } });
      await this.audit.record(
        {
          action: 'hostel.create',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: row.id,
          summary: `${row.name} added`,
          detail: GENDER_LABEL[row.gender],
        },
        asTx(tx),
      );
      return row;
    });
    return this.hostel(h.id);
  }

  async updateHostel(id: string, dto: HostelInput) {
    const h = await this.findHostel(id);
    const data = await this.checkHostel({ ...dto, branchId: dto.branchId ?? h.branchId }, h.id);
    if (data.branchId !== h.branchId && h.rooms.length)
      throw conflict(
        'A hostel with rooms can’t move to another campus. Add a new hostel there instead.',
        'HOSTEL_HAS_ROOMS',
      );
    await this.db.$transaction(async (tx) => {
      await tx.hostel.update({ where: { id: h.id }, data });
      await this.audit.record(
        {
          action: 'hostel.update',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: h.id,
          summary: `${data.name} updated`,
        },
        asTx(tx),
      );
    });
    return this.hostel(h.id);
  }

  /** Removes a hostel (kept in history). Refused while students sleep there (Phase 1 part 2). */
  async removeHostel(id: string) {
    const h = await this.findHostel(id);
    const use = await this.use(h.rooms.map((r) => r.id));
    const taken = [...use.values()].reduce((a, u) => a + u.taken, 0);
    if (taken)
      throw conflict(
        `${taken} boarder${taken === 1 ? '' : 's'} sleep${taken === 1 ? 's' : ''} in ${h.name}. Move them first.`,
        'HOSTEL_OCCUPIED',
      );
    await this.db.$transaction(async (tx) => {
      await tx.hostel.update({ where: { id: h.id }, data: { archivedAt: new Date() } });
      await tx.hostelStaff.deleteMany({ where: { hostelId: h.id } });
      await this.audit.record(
        {
          action: 'hostel.remove',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: h.id,
          summary: `${h.name} removed`,
        },
        asTx(tx),
      );
    });
    return { name: h.name, ...(await this.hostels()) };
  }

  /** A new hostel laid out like this one: same floors and rooms, no staff. */
  async copyHostel(id: string, dto: { name: string; gender?: string }) {
    const from = await this.findHostel(id);
    const data = await this.checkHostel({
      branchId: from.branchId,
      name: dto.name,
      gender: dto.gender ?? GENDER_LABEL[from.gender],
      levelIds: from.levelIds,
      note: from.note,
    });
    const created = await this.db.$transaction(async (tx) => {
      const h = await tx.hostel.create({
        data: { schoolId: this.schoolId(), ...data, sortOrder: from.sortOrder + 1 },
      });
      const floorMap = new Map<string, string>();
      for (const f of from.floors) {
        const nf = await tx.hostelFloor.create({
          data: { schoolId: this.schoolId(), hostelId: h.id, name: f.name, sortOrder: f.sortOrder },
        });
        floorMap.set(f.id, nf.id);
      }
      if (from.rooms.length)
        await tx.hostelRoom.createMany({
          data: from.rooms.map((r) => ({
            schoolId: this.schoolId(),
            hostelId: h.id,
            floorId: r.floorId ? (floorMap.get(r.floorId) ?? null) : null,
            name: r.name,
            capacity: r.capacity,
            beds: r.beds,
            sortOrder: r.sortOrder,
          })),
        });
      await this.audit.record(
        {
          action: 'hostel.create',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: h.id,
          summary: `${h.name} added`,
          detail: `Laid out like ${from.name}: ${from.rooms.length} rooms`,
        },
        asTx(tx),
      );
      return h;
    });
    return this.hostel(created.id);
  }

  /* ---------------- Floors ---------------- */

  async addFloor(hostelId: string, name: string) {
    const h = await this.findHostel(hostelId);
    const n = clean(name);
    if (!n) throw invalid({ name: 'Name the floor or wing.' });
    if (h.floors.some((f) => f.name.toLowerCase() === n.toLowerCase()))
      throw invalid({ name: `${h.name} already has ${n}.` });
    await this.db.hostelFloor.create({
      data: { schoolId: this.schoolId(), hostelId: h.id, name: n, sortOrder: h.floors.length },
    });
    return this.hostel(h.id);
  }

  async renameFloor(hostelId: string, floorId: string, name: string) {
    const h = await this.findHostel(hostelId);
    const f = h.floors.find((x) => x.id === floorId);
    if (!f) throw notFound('floor');
    const n = clean(name);
    if (!n) throw invalid({ name: 'Name the floor or wing.' });
    if (h.floors.some((x) => x.id !== f.id && x.name.toLowerCase() === n.toLowerCase()))
      throw invalid({ name: `${h.name} already has ${n}.` });
    await this.db.hostelFloor.update({ where: { id: f.id }, data: { name: n } });
    return this.hostel(h.id);
  }

  /** Removes a floor; its rooms stay in the hostel without a floor. */
  async removeFloor(hostelId: string, floorId: string) {
    const h = await this.findHostel(hostelId);
    const f = h.floors.find((x) => x.id === floorId);
    if (!f) throw notFound('floor');
    await this.db.$transaction(async (tx) => {
      await tx.hostelRoom.updateMany({ where: { floorId: f.id }, data: { floorId: null } });
      await tx.hostelFloor.delete({ where: { id: f.id } });
    });
    return this.hostel(h.id);
  }

  /* ---------------- Rooms ---------------- */

  private checkRoom(
    h: { name: string; floors: { id: string }[]; rooms: { id: string; name: string }[] },
    dto: RoomInput,
    exceptId?: string,
  ) {
    const errors: Record<string, string> = {};
    const name = clean(dto.name);
    if (!name) errors.name = 'Name or number the room.';
    else if (h.rooms.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase()))
      errors.name = `${h.name} already has a room called ${name}.`;
    const capacity = Number(dto.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_ROOM_CAPACITY)
      errors.capacity = `Places must be a whole number from 1 to ${MAX_ROOM_CAPACITY}.`;
    const floorId = dto.floorId || null;
    if (floorId && !h.floors.some((f) => f.id === floorId))
      errors.floorId = 'Choose a floor of this hostel.';
    const beds = (dto.beds ?? []).map(clean).filter(Boolean);
    if (beds.length && beds.length !== capacity)
      errors.beds = `Give ${capacity} bed labels, one per place, or none.`;
    if (new Set(beds.map((b) => b.toLowerCase())).size !== beds.length)
      errors.beds = 'Each bed label must be different.';
    if (Object.keys(errors).length) throw invalid(errors);
    return { name, capacity, floorId, beds };
  }

  async addRoom(hostelId: string, dto: RoomInput) {
    const h = await this.findHostel(hostelId);
    const data = this.checkRoom(h, dto);
    await this.db.hostelRoom.create({
      data: { schoolId: this.schoolId(), hostelId: h.id, ...data, sortOrder: h.rooms.length },
    });
    return this.hostel(h.id);
  }

  async updateRoom(hostelId: string, roomId: string, dto: RoomInput) {
    const h = await this.findHostel(hostelId);
    const r = h.rooms.find((x) => x.id === roomId);
    if (!r) throw notFound('room');
    const data = this.checkRoom(h, dto, r.id);
    const u = (await this.use([r.id])).get(r.id);
    if (u && data.capacity < u.taken)
      throw invalid({
        capacity: `${u.taken} boarders sleep in ${r.name}. Move some before lowering its places.`,
      });
    const lost = u ? [...u.beds].filter((b) => !data.beds.includes(b)) : [];
    if (lost.length)
      throw invalid({
        beds: `Bed${lost.length === 1 ? '' : 's'} ${lost.join(', ')} ${lost.length === 1 ? 'is' : 'are'} taken. Keep ${lost.length === 1 ? 'it' : 'them'}, or move those boarders first.`,
      });
    if (u?.taken && !data.beds.length && r.beds.length)
      throw invalid({
        beds: 'Boarders have labelled beds in this room. Keep the labels, or move them first.',
      });
    await this.db.hostelRoom.update({ where: { id: r.id }, data });
    return this.hostel(h.id);
  }

  async removeRoom(hostelId: string, roomId: string) {
    const h = await this.findHostel(hostelId);
    const r = h.rooms.find((x) => x.id === roomId);
    if (!r) throw notFound('room');
    const u = (await this.use([r.id])).get(r.id);
    if (u?.taken)
      throw conflict(
        `${u.taken} boarder${u.taken === 1 ? '' : 's'} sleep${u.taken === 1 ? 's' : ''} in ${r.name}. Move them first.`,
        'ROOM_OCCUPIED',
      );
    await this.db.hostelRoom.update({ where: { id: r.id }, data: { archivedAt: new Date() } });
    return this.hostel(h.id);
  }

  /** Adds several rooms at once: "Room 1–10, 4 places each, beds A–D". */
  async generateRooms(hostelId: string, dto: GenerateInput) {
    const h = await this.findHostel(hostelId);
    const errors: Record<string, string> = {};
    const count = Number(dto.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_ROOMS_AT_ONCE)
      errors.count = `Add 1 to ${MAX_ROOMS_AT_ONCE} rooms at a time.`;
    const capacity = Number(dto.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_ROOM_CAPACITY)
      errors.capacity = `Places must be a whole number from 1 to ${MAX_ROOM_CAPACITY}.`;
    const floorId = dto.floorId || null;
    if (floorId && !h.floors.some((f) => f.id === floorId))
      errors.floorId = 'Choose a floor of this hostel.';
    const startAt = dto.startAt === undefined || dto.startAt === null ? 1 : Number(dto.startAt);
    if (!Number.isInteger(startAt) || startAt < 0) errors.startAt = 'Start from a whole number.';
    if (Object.keys(errors).length) throw invalid(errors);
    const prefix = clean(dto.prefix ?? 'Room').slice(0, 30);
    const names = Array.from(
      { length: count },
      (_, i) => `${prefix ? `${prefix} ` : ''}${startAt + i}`,
    );
    const taken = names.filter((n) =>
      h.rooms.some((r) => r.name.toLowerCase() === n.toLowerCase()),
    );
    if (taken.length)
      throw invalid({
        startAt: `${h.name} already has ${taken.slice(0, 3).join(', ')}${taken.length > 3 ? '…' : ''}. Start from another number.`,
      });
    const beds = bedLabels(dto.bedStyle, capacity);
    await this.db.$transaction(async (tx) => {
      await tx.hostelRoom.createMany({
        data: names.map((name, i) => ({
          schoolId: this.schoolId(),
          hostelId: h.id,
          floorId,
          name,
          capacity,
          beds,
          sortOrder: h.rooms.length + i,
        })),
      });
      await this.audit.record(
        {
          action: 'hostel.rooms',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: h.id,
          summary: `${count} room${count === 1 ? '' : 's'} added to ${h.name}`,
          detail: `${names[0]}${count > 1 ? `–${names.at(-1)}` : ''} · ${capacity} place${capacity === 1 ? '' : 's'} each`,
        },
        asTx(tx),
      );
    });
    return this.hostel(h.id);
  }

  /* ---------------- House staff ---------------- */

  /** Replaces the hostel's house staff. Each staff member once; floor masters need a floor. */
  async setStaff(
    hostelId: string,
    entries: { staffId: string; role: string; floorId?: string | null }[],
  ) {
    const h = await this.findHostel(hostelId);
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    const rows: { staffId: string; role: HostelStaffRole; floorId: string | null }[] = [];
    const staff = await this.db.staff.findMany({
      where: { id: { in: (entries ?? []).map((e) => e.staffId).filter(isUuid) }, status: 'ACTIVE' },
      select: { id: true, title: true, firstName: true, lastName: true },
    });
    (entries ?? []).forEach((e, i) => {
      const role = ROLE_OF[clean(e.role).toLowerCase()];
      const person = staff.find((s) => s.id === e.staffId);
      if (!person) errors[`entries.${i}`] = 'Choose a staff member who is still at the school.';
      else if (seen.has(person.id))
        errors[`entries.${i}`] = `${staffName(person)} is listed twice.`;
      else if (!role) errors[`entries.${i}`] = 'Choose a role.';
      else if (role === 'FLOOR_MASTER' && !h.floors.some((f) => f.id === e.floorId))
        errors[`entries.${i}`] = 'Choose the floor or wing they look after.';
      else {
        seen.add(person.id);
        rows.push({
          staffId: person.id,
          role,
          floorId: role === 'FLOOR_MASTER' ? e.floorId! : null,
        });
      }
    });
    if (Object.keys(errors).length) throw invalid(errors);
    await this.db.$transaction(async (tx) => {
      await tx.hostelStaff.deleteMany({ where: { hostelId: h.id } });
      if (rows.length)
        await tx.hostelStaff.createMany({
          data: rows.map((r) => ({ schoolId: this.schoolId(), hostelId: h.id, ...r })),
        });
      await this.audit.record(
        {
          action: 'hostel.staff',
          area: 'Boarding',
          entity: 'Hostel',
          entityId: h.id,
          summary: `House staff updated for ${h.name}`,
          detail:
            rows
              .map(
                (r) =>
                  `${staffName(staff.find((s) => s.id === r.staffId)!)} (${ROLE_LABEL[r.role]})`,
              )
              .join(', ') || 'None',
        },
        asTx(tx),
      );
    });
    return this.hostel(h.id);
  }
}
