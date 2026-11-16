import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { addMonths, formatAgo, formatDay } from '../../platform/shared/format.js';
import { StorageService } from '../../storage/storage.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import type { DeactivateStaffDto, StaffPayloadDto, StaffQueryDto } from './dto/staff.dto.js';
import { StaffAccountsService } from './staff-accounts.service.js';
import { asAuditDb, plural, withNotice } from './staff-audit.js';
import { StaffDocumentsService } from './staff-documents.service.js';
import {
  StaffRecordsService,
  staffInclude,
  type Cleared,
  type CleanPayload,
  type Db,
  type DirectoryContext,
  type StaffListRowView,
  type StaffWithLinks,
  type Tx,
} from './staff-records.service.js';
import {
  accountLabel,
  armLabel,
  DEPARTMENTS,
  displayName,
  EMPLOYMENT_OF,
  GENDER_LABEL,
  GENDER_OF,
  GROUP_OF,
  groupOf,
  HOLDS_ACCESS,
  KIND_OF,
  parseUpload,
  POSITIONS,
  ROLE_FOR,
  type ParsedUpload,
} from './staff-view.js';

const PHOTO_LINK_SECONDS = 3600;
/** Leavers' documents and photos are kept two years from the day they left. */
const RETENTION_MONTHS = 24;

const TYPE_LABEL = {
  SUBJECT_TEACHER: 'Subject teacher',
  TEMPORARY: 'Temporary',
  PART_TIME: 'Part-time',
};

/** What the Setup Center's "Staff" step shows and checks. */
export interface StaffStepState {
  /** Staff on the roll (not deactivated). */
  current: number;
  /** Of those, teaching staff. */
  teachers: number;
  /** Staff with an Edutrack account that still counts (active, invited or suspended). */
  accounts: number;
  /** The school confirmed the step (`SetupStepState` "staff"). */
  confirmed: boolean;
}

/**
 * The staff directory and records: list with filters, profile, add and edit, deactivate and
 * reactivate. Follows the School Admin mock (`handlers/staff.ts`): teaching changes ripple into
 * Academics (assignments in live terms are cleared, class-teacher posts ended), and deactivating
 * someone ends their Edutrack access.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly records: StaffRecordsService,
    private readonly accounts: StaffAccountsService,
    private readonly documents: StaffDocumentsService,
    private readonly audit: SchoolAuditService,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.records.db;
  }

  /* ---------------- Directory ---------------- */

  async list(q: StaffQueryDto) {
    const ctx = await this.records.context();
    const staff = await this.db.staff.findMany({ include: staffInclude });
    const rows = staff.map((s) => this.records.toRow(s, ctx));
    const current = rows.filter((r) => r.status === 'Active');
    const search = (q.search ?? '').trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (q.status ? r.status === q.status : true) &&
        (!q.group || q.group === 'All'
          ? true
          : q.group === 'No access'
            ? r.account === 'No account'
            : r.group === q.group) &&
        (!q.branch ||
          q.branch === 'All branches' ||
          r.branch === 'All branches' ||
          r.branch.includes(q.branch)) &&
        (!q.account || r.account === q.account) &&
        (!search ||
          `${r.name} ${r.staffNumber} ${r.position} ${r.email} ${r.phone} ${r.department}`
            .toLowerCase()
            .includes(search)),
    );
    const teachers = current.filter((r) => r.kind === 'Teaching');
    const surname = (name: string) => name.replace(/^\S+\s/, '');
    return {
      rows: filtered.sort((a, b) =>
        a.status === b.status
          ? surname(a.name).localeCompare(surname(b.name))
          : a.status === 'Active'
            ? -1
            : 1,
      ),
      counts: {
        All: current.length,
        Teaching: teachers.length,
        Administrative: current.filter((r) => r.group === 'Administrative').length,
        Finance: current.filter((r) => r.group === 'Finance').length,
        Operations: current.filter((r) => r.group === 'Operations').length,
        'No access': current.filter((r) => r.account === 'No account').length,
      },
      total: current.length,
      withAccounts: current.filter((r) => ['Active', 'Invited', 'Suspended'].includes(r.account))
        .length,
      pendingInvites: current.filter((r) => r.account === 'Invited').length,
      deactivated: rows.length - current.length,
      unassignedTeachers: teachers
        .filter((r) => !r.load?.subjects && !r.classTeacherOf.length)
        .map((r) => ({ id: r.id, name: r.name })),
      branchesWithoutTeachers: ctx.branches
        .filter((b) => b.active && !teachers.some((t) => t.branchIds.includes(b.id)))
        .map((b) => b.name),
    };
  }

  async formOptions() {
    const [branches, roles, subjects, departments] = await Promise.all([
      this.db.branch.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: [{ isOriginal: 'desc' }, { name: 'asc' }],
      }),
      this.db.schoolRole.findMany({
        where: { archivedAt: null, NOT: { key: 'owner' } },
        select: { name: true, description: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.subject.findMany({
        where: { status: 'ACTIVE' },
        select: { code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.department.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    const known = new Set<string>(DEPARTMENTS.map((d) => d.toLowerCase()));
    return {
      branches,
      positions: [...POSITIONS],
      departments: [
        ...DEPARTMENTS,
        ...departments.map((d) => d.name).filter((n) => !known.has(n.toLowerCase())),
      ],
      roles,
      subjects,
      roleForPosition: ROLE_FOR,
    };
  }

  async teachers() {
    const ctx = await this.records.context();
    const staff = await this.db.staff.findMany({
      where: { kind: 'TEACHING', status: 'ACTIVE' },
      include: {
        ...staffInclude,
        qualifications: { select: { subject: { select: { code: true } } } },
      },
    });
    const assignments = ctx.term
      ? await this.db.teachingAssignment.findMany({
          where: { termId: ctx.term.id, staffId: { in: staff.map((s) => s.id) } },
          select: {
            staffId: true,
            subject: { select: { code: true, name: true } },
            arm: { select: { name: true, level: { select: { name: true } } } },
          },
        })
      : [];
    return staff
      .map((s) => {
        const row = this.records.toRow(s, ctx);
        const bySubject = new Map<string, { code: string; name: string; arms: string[] }>();
        for (const a of assignments.filter((x) => x.staffId === s.id)) {
          const entry = bySubject.get(a.subject.code) ?? {
            code: a.subject.code,
            name: a.subject.name,
            arms: [],
          };
          entry.arms.push(armLabel(a.arm.level.name, a.arm.name));
          bySubject.set(a.subject.code, entry);
        }
        return {
          id: s.id,
          name: row.name,
          staffNumber: s.staffNumber,
          branch: row.branch,
          employment: row.employment,
          qualified: s.qualifications.map((q) => q.subject.code),
          periods: row.load?.periods ?? 0,
          max: s.maxPeriodsPerWeek,
          subjects: [...bySubject.values()],
          classTeacherOf: row.classTeacherOf,
          account: row.account,
        };
      })
      .sort((a, b) => b.periods - a.periods);
  }

  async get(id: string) {
    const s = await this.records.find(id);
    const ctx = await this.records.context();
    const row = this.records.toRow(s, ctx);
    const [full, membership, teaching, history] = await Promise.all([
      this.db.staff.findUniqueOrThrow({
        where: { id: s.id },
        select: {
          qualifications: { select: { subject: { select: { code: true, name: true } } } },
          photoFile: { select: { storageKey: true, deletedAt: true } },
        },
      }),
      s.membership && s.membership.status !== 'REVOKED'
        ? this.db.schoolMembership.findUnique({
            where: { id: s.membership.id },
            include: {
              user: { select: { email: true, lastSeenAt: true } },
              roles: { select: { role: { select: { name: true, archivedAt: true } } } },
              branches: { select: { branch: { select: { name: true } } } },
              invitations: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { email: true, lastSentAt: true, status: true },
              },
            },
          })
        : null,
      this.teachingOf(s, ctx),
      this.audit.history('Staff', s.id),
    ]);
    const now = this.clock.now();
    const invitation = membership?.invitations[0];
    const status = accountLabel(membership?.status);
    return {
      ...row,
      title: s.title ?? '',
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender ? GENDER_LABEL[s.gender] : '',
      address: s.address ?? '',
      emergencyContact: s.emergencyContactName ?? '',
      since: s.startedOn ? s.startedOn.toISOString().slice(0, 10) : '',
      qualified: full.qualifications.map((q) => q.subject.code),
      qualifiedNames: full.qualifications.map((q) => q.subject.name),
      maxPeriods: s.maxPeriodsPerWeek,
      photoUrl:
        full.photoFile && !full.photoFile.deletedAt
          ? await this.storage
              .getDownloadUrl(full.photoFile.storageKey, PHOTO_LINK_SECONDS)
              .catch(() => null)
          : null,
      documents: await this.documents.rows(s.id),
      user: membership
        ? {
            id: membership.id,
            email: (status === 'Invited' ? invitation?.email : null) ?? membership.user.email ?? '',
            status,
            roles: membership.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.name),
            scope:
              membership.scope === 'SCHOOL'
                ? 'Whole school'
                : membership.branches.map((b) => b.branch.name).join(', '),
            lastActive:
              (membership.lastActiveAt ?? membership.user.lastSeenAt)
                ? formatAgo((membership.lastActiveAt ?? membership.user.lastSeenAt)!, now)
                : '—',
            invited: status === 'Invited' && invitation ? formatDay(invitation.lastSentAt) : null,
          }
        : null,
      teaching,
      history: [
        ...history.map((h) => ({
          id: h.id,
          title: h.title,
          detail: h.detail,
          when: formatDay(new Date(h.at)),
        })),
        ...(s.startedOn
          ? [
              {
                id: 'joined',
                title: `Joined as ${row.position}`,
                detail: s.staffNumber,
                when: formatDay(s.startedOn, { calendar: true }),
              },
            ]
          : []),
      ],
    };
  }

  private async teachingOf(s: StaffWithLinks, ctx: DirectoryContext) {
    if (s.kind !== 'TEACHING') return null;
    const assignments = ctx.term
      ? await this.db.teachingAssignment.findMany({
          where: { termId: ctx.term.id, staffId: s.id },
          select: {
            id: true,
            type: true,
            periodsPerWeek: true,
            armId: true,
            subject: { select: { code: true, name: true } },
            arm: {
              select: {
                name: true,
                level: { select: { name: true } },
                branch: { select: { name: true } },
              },
            },
          },
        })
      : [];
    return {
      term: ctx.term?.name ?? '',
      assignments: assignments.map((a) => ({
        id: a.id,
        subject: a.subject.code,
        subjectName: a.subject.name,
        armId: a.armId,
        arm: armLabel(a.arm.level.name, a.arm.name),
        branch: a.arm.branch.name,
        type: TYPE_LABEL[a.type],
        periods: a.periodsPerWeek,
      })),
      classTeacherOf: ctx.classTeacher.get(s.id) ?? [],
    };
  }

  /* ---------------- Add & edit ---------------- */

  private fields(p: StaffPayloadDto, v: CleanPayload) {
    return {
      title: v.title,
      firstName: v.firstName,
      lastName: v.lastName,
      gender: p.gender ? GENDER_OF[p.gender] : null,
      phone: v.phone,
      email: v.email,
      address: p.address?.trim() || null,
      emergencyContactName: p.emergencyContact?.trim() || null,
      positionTitle: p.position.trim(),
      kind: KIND_OF[p.kind],
      group: GROUP_OF[groupOf(p.kind, p.position)],
      employment: EMPLOYMENT_OF[p.employment],
      allBranches: v.allBranches,
      maxPeriodsPerWeek: p.kind === 'Teaching' ? p.maxPeriods : 0,
    };
  }

  private async replaceLinks(tx: Tx, staffId: string, v: CleanPayload) {
    const schoolId = this.records.schoolId();
    await tx.staffBranch.deleteMany({ where: { staffId } });
    await tx.staffBranch.createMany({
      data: v.branchIds.map((branchId) => ({ schoolId, staffId, branchId })),
    });
    await tx.staffQualification.deleteMany({ where: { staffId } });
    await tx.staffQualification.createMany({
      data: v.subjectIds.map((subjectId) => ({ schoolId, staffId, subjectId })),
    });
  }

  /** Uploads a new photo (before the transaction) so the row can point at it. */
  private async uploadPhoto(staffId: string, photo: ParsedUpload) {
    const schoolId = this.records.schoolId();
    const fileId = randomUUID();
    const storageKey = `schools/${schoolId}/staff/${staffId}/photo/${fileId}.${photo.ext}`;
    await this.storage.upload(storageKey, photo.bytes, photo.mime);
    return {
      id: fileId,
      schoolId,
      storageKey,
      originalName: `photo.${photo.ext}`,
      mimeType: photo.mime,
      sizeBytes: BigInt(photo.bytes.length),
      sha256: createHash('sha256').update(photo.bytes).digest('hex'),
      uploadedById: RequestContext.get()?.userId ?? null,
    };
  }

  async create(p: StaffPayloadDto) {
    const v = await this.records.validate(p, { needsRole: p.access });
    const photo = p.photo ? parseUpload(p.photo, 'photo') : null;
    const schoolId = this.records.schoolId();
    const staffId = randomUUID();
    const file = photo ? await this.uploadPhoto(staffId, photo) : null;
    const { invitationId } = await this.db.$transaction(async (tx) => {
      if (file) await tx.storedFile.create({ data: file });
      const staff = await tx.staff.create({
        data: {
          id: staffId,
          schoolId,
          staffNumber: await this.records.nextStaffNumber(tx),
          ...this.fields(p, v),
          departmentId: await this.records.departmentId(p.department ?? '', tx),
          startedOn: v.startedOn,
          photoFileId: file?.id ?? null,
        },
      });
      await this.replaceLinks(tx, staff.id, v);
      const invitationId =
        p.access && v.roleId
          ? await this.accounts.createInvitation(tx, { ...staff, branchIds: v.branchIds }, [
              v.roleId,
            ])
          : null;
      const name = displayName(staff.title, staff.firstName, staff.lastName);
      await this.audit.record(
        {
          action: 'staff.create',
          area: 'Staff',
          entity: 'Staff',
          entityId: staff.id,
          summary: `Added as ${staff.positionTitle}`,
          detail: invitationId ? `Invitation sent to ${v.email}` : 'No portal access',
          after: { name, staffNumber: staff.staffNumber, position: staff.positionTitle },
        },
        asAuditDb(tx),
      );
      return { invitationId };
    });
    if (invitationId) await this.accounts.send([invitationId]);
    const row = await this.row(staffId);
    return withNotice(row, invitationId ? `Invitation sent to ${v.email}.` : `${row.name} added.`);
  }

  async update(id: string, p: StaffPayloadDto) {
    const s = await this.records.find(id);
    if (s.status === 'DEACTIVATED')
      throw AppException.conflict(
        'Reactivate this staff member before editing.',
        'STAFF_DEACTIVATED',
      );
    const myStaffId = await this.records.myStaffId();
    const isYou = s.id === myStaffId;
    const live = s.membership && s.membership.status !== 'REVOKED' ? s.membership : null;
    const v = await this.records.validate(p, {
      current: s.id,
      needsRole: p.access && !live && !isYou,
    });
    const photo = p.photo ? parseUpload(p.photo, 'photo') : null;
    const file = photo ? await this.uploadPhoto(s.id, photo) : null;
    const previousPhoto =
      p.photo !== undefined && s.photoFileId
        ? await this.db.storedFile.findUnique({ where: { id: s.photoFileId } })
        : null;

    const result = await this.db.$transaction(async (tx) => {
      const changes: string[] = [];
      const toSend: string[] = [];
      let invitedNow = false;
      // Becoming non-teaching, or leaving a branch, clears assignments there.
      const cleared: Cleared =
        s.kind === 'TEACHING' && p.kind === 'Non-teaching'
          ? await this.stripTeaching(tx, s.id, null)
          : s.kind === 'TEACHING'
            ? await this.stripTeaching(tx, s.id, v.branchIds)
            : { removed: 0, classes: 0 };
      if (cleared.removed || cleared.classes)
        changes.push(
          `${plural(cleared.removed, 'assignment')} and ${plural(cleared.classes, 'class-teacher role')} cleared`,
        );
      if ((s.positionTitle ?? '') !== p.position.trim())
        changes.push(`Position: ${s.positionTitle ?? '—'} → ${p.position.trim()}`);

      if (file) await tx.storedFile.create({ data: file });
      if (previousPhoto)
        await tx.storedFile.update({
          where: { id: previousPhoto.id },
          data: { deletedAt: this.clock.now() },
        });
      const staff = await tx.staff.update({
        where: { id: s.id },
        data: {
          ...this.fields(p, v),
          ...(p.department?.trim()
            ? { departmentId: await this.records.departmentId(p.department, tx) }
            : {}),
          ...(v.startedOn && { startedOn: v.startedOn }),
          ...(p.photo !== undefined && { photoFileId: file?.id ?? null }),
        },
      });
      await this.replaceLinks(tx, s.id, v);

      if (live?.status === 'INVITED') {
        const pending = await tx.invitation.findFirst({
          where: { membershipId: live.id, status: { in: ['PENDING', 'EXPIRED'] } },
          orderBy: { createdAt: 'desc' },
          select: { email: true },
        });
        if (!p.access) {
          await this.accounts.withdrawInvitation(tx, live.id);
          changes.push('Invitation cancelled');
        } else if (v.email && pending?.email?.toLowerCase() !== v.email) {
          // A new address means a new invitation (the old link stops working), same roles.
          const roles = await tx.membershipRole.findMany({
            where: { membershipId: live.id },
            select: { roleId: true },
          });
          await this.accounts.withdrawInvitation(tx, live.id);
          toSend.push(
            await this.accounts.createInvitation(
              tx,
              { ...staff, branchIds: v.branchIds },
              roles.map((r) => r.roleId),
            ),
          );
          changes.push(`New invitation sent to ${v.email}`);
        }
      } else if (p.access && !live && !isYou && v.roleId) {
        toSend.push(
          await this.accounts.createInvitation(tx, { ...staff, branchIds: v.branchIds }, [
            v.roleId,
          ]),
        );
        invitedNow = true;
        changes.push(`Invitation sent to ${v.email}`);
      }
      await this.audit.record(
        {
          action: 'staff.update',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: 'Details updated',
          detail: changes.join(' · ') || null,
        },
        asAuditDb(tx),
      );
      return { cleared, toSend, invitedNow };
    });
    await this.accounts.send(result.toSend);
    if (previousPhoto)
      await this.storage
        .remove(previousPhoto.storageKey)
        .catch((error: unknown) =>
          this.logger.warn({ msg: 'Old staff photo not removed', error: String(error) }),
        );
    const row = { ...(await this.row(s.id)), cleared: result.cleared };
    return withNotice(
      row,
      [
        result.invitedNow ? `Invitation sent to ${v.email}.` : 'Changes saved.',
        result.cleared.removed ? `${plural(result.cleared.removed, 'assignment')} cleared.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  private async row(id: string): Promise<StaffListRowView> {
    const [s, ctx] = await Promise.all([this.records.find(id), this.records.context()]);
    return this.records.toRow(s, ctx);
  }

  /**
   * Teaching changes ripple into Academics: clears the teacher's assignments in live (active and
   * upcoming) terms outside `keepBranches` (all of them when null), and ends their class-teacher
   * posts there. Result sheets and schedules that pointed at a cleared assignment keep their data
   * and lose the link.
   */
  private async stripTeaching(
    tx: Tx,
    staffId: string,
    keepBranches: string[] | null,
  ): Promise<Cleared> {
    const outside = keepBranches === null ? {} : { arm: { branchId: { notIn: keepBranches } } };
    const gone = await tx.teachingAssignment.findMany({
      where: { staffId, term: { status: { in: ['ACTIVE', 'UPCOMING'] } }, ...outside },
      select: { id: true },
    });
    const ids = gone.map((a) => a.id);
    if (ids.length) {
      await tx.resultSheet.updateMany({
        where: { teachingAssignmentId: { in: ids } },
        data: { teachingAssignmentId: null },
      });
      await tx.assessmentSchedule.updateMany({
        where: { teachingAssignmentId: { in: ids } },
        data: { teachingAssignmentId: null },
      });
      await tx.teachingAssignment.deleteMany({ where: { id: { in: ids } } });
    }
    const posts = await tx.classTeacherAssignment.updateMany({
      where: {
        staffId,
        endsOn: null,
        session: { status: { in: ['ACTIVE', 'UPCOMING'] } },
        ...outside,
      },
      data: { endsOn: this.records.today() },
    });
    return { removed: ids.length, classes: posts.count };
  }

  /* ---------------- Deactivate & reactivate ---------------- */

  async deactivate(id: string, dto: DeactivateStaffDto) {
    const s = await this.records.find(id);
    if (s.status === 'DEACTIVATED')
      throw AppException.conflict('Already deactivated.', 'ALREADY_DEACTIVATED');
    if (s.id === (await this.records.myStaffId()))
      throw AppException.conflict('You can’t deactivate yourself.', 'CANNOT_DEACTIVATE_SELF');
    const name = displayName(s.title, s.firstName, s.lastName);
    const held = await this.db.positionHolder.findMany({
      where: { staffId: s.id },
      select: {
        position: {
          select: { title: true, parentId: true, _count: { select: { holders: true } } },
        },
      },
    });
    const top = held.find((h) => !h.position.parentId && h.position._count.holders === 1);
    if (top)
      throw AppException.conflict(
        `${name} is the only ${top.position.title}. Assign someone else in the Organogram first.`,
        'ONLY_HOLDER',
      );
    // Check before changing anything: a refused request leaves their classes as they were.
    const teaches = await this.db.teachingAssignment.count({
      where: { staffId: s.id, term: { status: { in: ['ACTIVE', 'UPCOMING'] } } },
    });
    if (teaches && !dto.coverArranged)
      throw new AppException(
        422,
        'Confirm that you have arranged cover for their classes.',
        'COVER_NOT_CONFIRMED',
      );

    const schoolId = this.records.schoolId();
    const today = this.records.today();
    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });
    const live = s.membership && s.membership.status !== 'REVOKED' ? s.membership : null;
    const cleared = await this.db.$transaction(async (tx) => {
      const cleared = await this.stripTeaching(tx, s.id, null);
      await tx.positionHolder.deleteMany({ where: { staffId: s.id } });
      const heads = await tx.branch.findMany({
        where: { headStaffId: s.id },
        select: { name: true },
      });
      await tx.branch.updateMany({ where: { headStaffId: s.id }, data: { headStaffId: null } });
      await tx.department.updateMany({ where: { hodStaffId: s.id }, data: { hodStaffId: null } });
      await tx.staff.update({
        where: { id: s.id },
        data: { status: 'DEACTIVATED', leftOn: today },
      });
      await this.retain(tx, s.id, addMonths(today, RETENTION_MONTHS));
      if (live?.status === 'INVITED') await this.accounts.withdrawInvitation(tx, live.id);
      else if (live && HOLDS_ACCESS.includes(live.status))
        await tx.schoolMembership.update({
          where: { id: live.id },
          data: {
            status: 'DEACTIVATED',
            statusReason: `Deactivated on ${formatDay(today, { calendar: true })} when this staff member left ${school?.name ?? 'the school'}.`,
          },
        });
      await this.audit.record(
        {
          action: 'staff.deactivate',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: 'Deactivated',
          detail:
            [
              cleared.removed && `${cleared.removed} assignments need a replacement`,
              cleared.classes && `${cleared.classes} class-teacher roles cleared`,
              live && 'sign-in removed',
              heads.length && `no longer head of ${heads.map((h) => h.name).join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · ') || null,
        },
        asAuditDb(tx),
      );
      return cleared;
    });
    if (live) await this.accounts.endSessions(live.userId);
    const row = { ...(await this.row(s.id)), cleared };
    return withNotice(
      row,
      [
        `${name} deactivated.`,
        cleared.removed
          ? `${plural(cleared.removed, 'assignment')} now need a teacher in Teacher Assignments.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  /** Sets (or clears) the purge date on a staff member's documents and photo. */
  private async retain(db: Db, staffId: string, until: Date | null) {
    const staff = await db.staff.findUniqueOrThrow({
      where: { id: staffId },
      select: { photoFileId: true, documents: { select: { fileId: true } } },
    });
    const ids = [staff.photoFileId, ...staff.documents.map((d) => d.fileId)].filter(
      (x): x is string => Boolean(x),
    );
    if (ids.length)
      await db.storedFile.updateMany({ where: { id: { in: ids } }, data: { retainUntil: until } });
  }

  async reactivate(id: string) {
    const s = await this.records.find(id);
    if (s.status === 'ACTIVE')
      throw AppException.conflict('This staff member is active.', 'STAFF_ACTIVE');
    await this.db.$transaction(async (tx) => {
      await tx.staff.update({ where: { id: s.id }, data: { status: 'ACTIVE', leftOn: null } });
      await this.retain(tx, s.id, null);
      await this.audit.record(
        {
          action: 'staff.reactivate',
          area: 'Staff',
          entity: 'Staff',
          entityId: s.id,
          summary: 'Reactivated',
          detail: 'Access must be granted again from Users & Roles',
        },
        asAuditDb(tx),
      );
    });
    const row = await this.row(s.id);
    return withNotice(row, `${row.name} reactivated.`);
  }

  /* ---------------- Setup Center ---------------- */

  /**
   * The Setup Center's "Staff" step, mirroring `handlers/setup.ts`: staff on the roll, teachers
   * among them, staff with an account that still counts, and whether the school confirmed the
   * step. The Setup endpoint builds the description ("12 staff members · 8 teachers · 9 with
   * system accounts") from this; completing the step needs `teachers > 0`.
   */
  async staffStepState(): Promise<StaffStepState> {
    const [current, teachers, accounts, step] = await Promise.all([
      this.db.staff.count({ where: { status: 'ACTIVE' } }),
      this.db.staff.count({ where: { status: 'ACTIVE', kind: 'TEACHING' } }),
      this.db.schoolMembership.count({
        where: { kind: 'STAFF', staffId: { not: null }, status: { in: HOLDS_ACCESS } },
      }),
      this.db.setupStepState.findFirst({
        where: { stepKey: 'staff' },
        select: { confirmedAt: true },
      }),
    ]);
    return { current, teachers, accounts, confirmed: Boolean(step?.confirmedAt) };
  }
}
