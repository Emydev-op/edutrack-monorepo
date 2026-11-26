import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock, HOUR } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { buildTemplate, importText } from '../shared/excel-template.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { parseCsv } from '../staff/staff-view.js';
import { bedLabels, BoardingService, GENDER_OF, MAX_ROOM_CAPACITY } from './boarding.service.js';

const BATCH_TTL_MS = 24 * HOUR;
const EXPIRED = 'This import has expired. Upload the file again.';
const unprocessable = (message: string, code: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);
const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

export interface RoomImportRow {
  line: number;
  campus: string;
  branchId: string | null;
  hostel: string;
  gender: string;
  floor: string;
  room: string;
  capacity: number;
  beds: string[];
  /** The hostel isn't there yet: importing adds it. */
  newHostel: boolean;
  newFloor: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Boarding › Hostels › Bulk upload: one row per room (campus, hostel, boys/girls/mixed, optional
 * floor or wing, room, places, optional bed labels). Hostels and floors not there yet are added;
 * rooms already there are refused. Checked first, then imported within 24 hours.
 */
@Injectable()
export class HostelImportService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly boarding: BoardingService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** Campuses that take boarders, for the template's dropdown. */
  private async campuses() {
    const s = await this.boarding.settings();
    return s.campuses.filter((c) => c.sections.some((x) => x.boarding));
  }

  async template(): Promise<Buffer> {
    const campuses = await this.campuses();
    const campus = campuses[0]?.name ?? 'Main Campus';
    return buildTemplate(
      'Hostel rooms',
      [
        { header: 'campus', options: campuses.map((c) => c.name), width: 18 },
        { header: 'hostel', width: 22, hint: 'e.g. Queen Amina House. New names are added.' },
        { header: 'gender', options: ['Boys', 'Girls', 'Mixed'], width: 10 },
        { header: 'floor', width: 16, hint: 'Optional: a floor, wing or block' },
        { header: 'room', width: 14, hint: 'A name or number, e.g. Room 4' },
        { header: 'places', width: 10, hint: `Beds in the room (1–${MAX_ROOM_CAPACITY})` },
        {
          header: 'beds',
          width: 22,
          hint: 'Optional: "numbers", "letters", or labels separated by commas',
        },
      ],
      [
        [campus, 'Queen Amina House', 'Girls', 'Ground floor', 'Room 1', '4', 'letters'],
        [campus, 'Queen Amina House', 'Girls', 'Ground floor', 'Room 2', '4', 'letters'],
        [campus, 'Ahmadu Bello House', 'Boys', '', 'Dormitory A', '20', ''],
      ],
    );
  }

  async preview(dto: { fileName: string; text: string }) {
    if (!/\.(csv|xlsx)$/i.test(dto.fileName ?? ''))
      throw unprocessable('Upload the .xlsx or .csv template.', 'IMPORT_FORMAT');
    const rows = parseCsv(await importText(dto.fileName, dto.text ?? ''));
    if (rows.length < 2)
      throw unprocessable('The file has no room rows. Use the template’s columns.', 'IMPORT_EMPTY');
    if (rows.length > 1001)
      throw unprocessable('Import up to 1,000 rooms at a time. Split the file.', 'IMPORT_TOO_LONG');
    const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\*$/, ''));
    const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim();
    const missing = ['campus', 'hostel', 'gender', 'room', 'places'].filter(
      (k) => !head.includes(k),
    );
    if (missing.length)
      throw unprocessable(
        `The file is missing the ${missing.join(', ')} column(s).`,
        'IMPORT_COLUMNS',
      );

    const campuses = await this.campuses();
    const hostels = await this.db.hostel.findMany({
      where: { archivedAt: null },
      include: {
        floors: { select: { name: true } },
        rooms: { where: { archivedAt: null }, select: { name: true } },
      },
    });
    const inFile = new Set<string>();
    const fileHostel = new Map<string, string>(); // campus|hostel → gender seen first
    const out: RoomImportRow[] = rows.slice(1).flatMap((r, i) => {
      if (r.every((c) => !c.trim())) return [];
      const line = i + 2;
      const errors: string[] = [];
      const warnings: string[] = [];
      const campusName = col(r, 'campus');
      const campus = campuses.find((c) => norm(c.name) === norm(campusName));
      if (!campus)
        errors.push(
          campusName
            ? `${campusName} doesn’t take boarders (or isn’t a campus).`
            : 'Choose the campus.',
        );
      const hostelName = col(r, 'hostel').replace(/\s+/g, ' ');
      if (!hostelName) errors.push('Name the hostel.');
      const genderText = col(r, 'gender');
      const gender = GENDER_OF[genderText.toLowerCase()];
      if (!gender) errors.push('Gender must be Boys, Girls or Mixed.');
      const floor = col(r, 'floor').replace(/\s+/g, ' ');
      const room = col(r, 'room').replace(/\s+/g, ' ');
      if (!room) errors.push('Name or number the room.');
      const capacity = Number(col(r, 'places'));
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_ROOM_CAPACITY)
        errors.push(`Places must be a whole number from 1 to ${MAX_ROOM_CAPACITY}.`);
      const bedText = col(r, 'beds');
      let beds: string[] = [];
      if (/^(numbers|letters)$/i.test(bedText))
        beds = bedLabels(bedText.toLowerCase(), capacity || 0);
      else if (bedText) {
        beds = bedText
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean);
        if (beds.length !== capacity)
          errors.push(`Give ${capacity} bed labels (one per place), or leave beds blank.`);
      }
      const existing = campus
        ? hostels.find((h) => h.branchId === campus.branchId && norm(h.name) === norm(hostelName))
        : undefined;
      if (existing && gender && existing.gender !== gender)
        warnings.push(
          `${existing.name} is already set up as ${existing.gender.toLowerCase()}; that stays.`,
        );
      if (existing && room && existing.rooms.some((x) => norm(x.name) === norm(room)))
        errors.push(`${existing.name} already has ${room}.`);
      const key = `${campus?.branchId}|${norm(hostelName)}|${norm(room)}`;
      if (room && hostelName && inFile.has(key))
        errors.push(`${room} is in the file twice for ${hostelName}.`);
      inFile.add(key);
      const hk = `${campus?.branchId}|${norm(hostelName)}`;
      if (!existing && gender) {
        const first = fileHostel.get(hk);
        if (first && first !== gender)
          errors.push(`${hostelName} is given different genders in the file.`);
        else fileHostel.set(hk, gender);
      }
      const newFloor =
        !!floor && !(existing?.floors.some((f) => norm(f.name) === norm(floor)) ?? false);
      return [
        {
          line,
          campus: campus?.name ?? campusName,
          branchId: campus?.branchId ?? null,
          hostel: existing?.name ?? hostelName,
          gender: genderText,
          floor,
          room,
          capacity: Number.isInteger(capacity) ? capacity : 0,
          beds,
          newHostel: !existing,
          newFloor,
          errors,
          warnings,
        },
      ];
    });
    const batch = await this.db.importBatch.create({
      data: {
        schoolId: RequestContext.schoolId()!,
        kind: 'HOSTEL_ROOMS',
        fileName: dto.fileName,
        rowCount: out.length,
        validCount: out.filter((r) => !r.errors.length).length,
        rows: out as unknown as Prisma.InputJsonValue,
        issues: out.flatMap((r) => [
          ...r.errors.map((message) => ({ row: r.line, kind: 'error', message })),
          ...r.warnings.map((message) => ({ row: r.line, kind: 'warning', message })),
        ]),
        createdById: RequestContext.get()?.userId ?? null,
      },
    });
    return { id: batch.id, fileName: batch.fileName, rows: out };
  }

  /** Adds the valid rows: hostels and floors first if needed, then the rooms. */
  async commit(id: string) {
    const batch = isUuid(id)
      ? await this.db.importBatch.findFirst({ where: { id, kind: 'HOSTEL_ROOMS' } })
      : null;
    if (
      !batch ||
      batch.status !== 'VALIDATED' ||
      this.clock.nowMs() - batch.createdAt.getTime() > BATCH_TTL_MS
    )
      throw AppException.notFound(EXPIRED, 'IMPORT_EXPIRED');
    const rows = (batch.rows as unknown as RoomImportRow[]).filter((r) => !r.errors.length);
    const schoolId = RequestContext.schoolId()!;
    let rooms = 0;
    const newHostels = new Set<string>();
    const skipped: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const r of rows) {
        let hostel = await tx.hostel.findFirst({
          where: {
            branchId: r.branchId!,
            archivedAt: null,
            name: { equals: r.hostel, mode: 'insensitive' },
          },
        });
        if (!hostel) {
          hostel = await tx.hostel.create({
            data: {
              schoolId,
              branchId: r.branchId!,
              name: r.hostel,
              gender: GENDER_OF[r.gender.toLowerCase()]!,
            },
          });
          newHostels.add(hostel.id);
        }
        let floorId: string | null = null;
        if (r.floor) {
          const floor =
            (await tx.hostelFloor.findFirst({
              where: { hostelId: hostel.id, name: { equals: r.floor, mode: 'insensitive' } },
            })) ??
            (await tx.hostelFloor.create({
              data: {
                schoolId,
                hostelId: hostel.id,
                name: r.floor,
                sortOrder: await tx.hostelFloor.count({ where: { hostelId: hostel.id } }),
              },
            }));
          floorId = floor.id;
        }
        const taken = await tx.hostelRoom.findFirst({
          where: {
            hostelId: hostel.id,
            archivedAt: null,
            name: { equals: r.room, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (taken) {
          skipped.push(`Row ${r.line}: ${r.hostel} already has ${r.room}.`);
          continue;
        }
        await tx.hostelRoom.create({
          data: {
            schoolId,
            hostelId: hostel.id,
            floorId,
            name: r.room,
            capacity: r.capacity,
            beds: r.beds,
            sortOrder: await tx.hostelRoom.count({ where: { hostelId: hostel.id } }),
          },
        });
        rooms++;
      }
      const result = { rooms, hostels: newHostels.size, skipped };
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'COMMITTED', committedAt: this.clock.now(), result },
      });
      await this.audit.record(
        {
          action: 'hostel.import',
          area: 'Boarding',
          entity: 'Hostel',
          summary: `Imported ${rooms} room${rooms === 1 ? '' : 's'} from ${batch.fileName}`,
          detail: newHostels.size
            ? `${newHostels.size} new hostel${newHostels.size === 1 ? '' : 's'}`
            : null,
        },
        tx as unknown as Prisma.TransactionClient,
      );
    });
    return {
      imported: rooms,
      hostels: newHostels.size,
      skipped: skipped.length,
      problems: skipped,
    };
  }
}
