import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { isUuid } from '../../platform/shared/params.js';
import { StorageService } from '../../storage/storage.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import { plural, withNotice } from '../staff/staff-audit.js';
import { parseUpload } from '../staff/staff-view.js';
import type { AssignArmDto, EnrollDto, TransferStudentDto } from './dto/students.dto.js';
import { MemberPermissions } from './member-permissions.js';
import { retainLeaverFiles, StudentAccessService } from './student-access.js';
import {
  armLabel,
  classOf,
  currentEnrollment,
  day,
  EXIT_KIND_LABEL,
  ON_ROLL,
  studentInclude,
  studentName,
  type StudentWithLinks,
} from './student-view.js';
import { STUDENT_NOT_FOUND, StudentsService } from './students.service.js';

const unprocessable = (message: string, code = 'VALIDATION', field?: string) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    message,
    code,
    field ? { [field]: message } : undefined,
  );

const parseDay = (iso: string): Date | null => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
};

/**
 * Writes on student records: transfers (to another branch, or out of the school) and withdrawals,
 * moving students between arms, and placing admitted students in an arm. Every change is audited
 * on the student's timeline.
 */
@Injectable()
export class StudentMovesService {
  constructor(
    private readonly students: StudentsService,
    private readonly permissions: MemberPermissions,
    private readonly access: StudentAccessService,
    private readonly storage: StorageService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.students.db;
  }

  /** Students by id, in the order asked, 404 for any that isn't this school's. */
  private async many(ids: string[]): Promise<StudentWithLinks[]> {
    const unique = [...new Set(ids)];
    const found = await this.db.student.findMany({
      where: { id: { in: unique.filter(isUuid) }, deletedAt: null },
      include: studentInclude,
    });
    if (found.length !== unique.length)
      throw AppException.notFound(STUDENT_NOT_FOUND, 'STUDENT_NOT_FOUND');
    return unique.map((id) => found.find((s) => s.id === id)!);
  }

  /* ---------------- Transfer & withdraw ---------------- */

  async transfer(id: string, dto: TransferStudentDto) {
    if (dto.kind === 'Branch') return this.changeBranch(id, dto);
    await this.permissions.require(
      'students.archive',
      'Recording a transfer or withdrawal needs the students.archive permission.',
    );
    const s = await this.students.find(id);
    const name = studentName(s);
    if (s.exitKind)
      throw AppException.conflict(
        `${name} already has a ${EXIT_KIND_LABEL[s.exitKind].toLowerCase()} recorded.`,
        'ALREADY_LEFT',
      );
    if (s.status === 'GRADUATED')
      throw AppException.conflict(`${name} has already graduated.`, 'ALREADY_LEFT');
    const on = parseDay(dto.date);
    if (!on) throw unprocessable('Choose the effective date.', 'VALIDATION', 'date');
    if (on < s.admittedOn)
      throw unprocessable(
        `The effective date can’t be before ${name} was admitted (${day(s.admittedOn)}).`,
        'VALIDATION',
        'date',
      );
    const isTransfer = dto.kind === 'Transfer';
    if (isTransfer && !dto.destination)
      throw unprocessable('Enter the destination school.', 'VALIDATION', 'destination');
    if (isTransfer && !dto.document?.trim())
      throw unprocessable(
        'Upload the transfer letter. Your school settings require it.',
        'TRANSFER_LETTER_REQUIRED',
        'document',
      );

    // A data URL is the letter itself: checked by its bytes and stored before the transaction.
    const schoolId = this.students.schoolId();
    let file: { id: string; storageKey: string; mime: string; bytes: Buffer; name: string } | null =
      null;
    if (dto.document?.startsWith('data:')) {
      const parsed = parseUpload(dto.document, 'document');
      const fileId = randomUUID();
      file = {
        id: fileId,
        storageKey: `schools/${schoolId}/students/${s.id}/documents/${fileId}.${parsed.ext}`,
        mime: parsed.mime,
        bytes: parsed.bytes,
        name: `transfer-letter.${parsed.ext}`,
      };
      await this.storage.upload(file.storageKey, file.bytes, file.mime);
    }

    const date = day(on);
    const status = isTransfer ? ('TRANSFERRED' as const) : ('WITHDRAWN' as const);
    const summary = isTransfer ? `Transferred to ${dto.destination}` : 'Withdrawn';
    const closed = await this.db.$transaction(async (tx) => {
      if (file)
        await tx.storedFile.create({
          data: {
            id: file.id,
            schoolId,
            storageKey: file.storageKey,
            originalName: file.name,
            mimeType: file.mime,
            sizeBytes: BigInt(file.bytes.length),
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            uploadedById: RequestContext.get()?.userId ?? null,
          },
        });
      await tx.student.update({
        where: { id: s.id },
        data: {
          status,
          exitKind: isTransfer ? 'TRANSFER' : 'WITHDRAWAL',
          exitOn: on,
          exitReason: dto.reason || null,
          exitDestination: isTransfer ? dto.destination : null,
          exitNotes: dto.notes || null,
          exitDocumentFileId: file?.id ?? null,
          leftOn: on,
        },
      });
      await tx.enrollment.updateMany({
        where: { studentId: s.id, status: 'ACTIVE' },
        data: { status: 'LEFT', leftOn: on, outcome: isTransfer ? 'TRANSFER' : 'WITHDRAW' },
      });
      if (isTransfer) await this.recordLetter(tx, s.id, file?.id ?? null);
      await retainLeaverFiles(tx, s.id, on);
      const closed = await this.access.close(
        s.id,
        tx,
        isTransfer ? 'Transferred out' : 'Withdrawn',
      );
      await this.audit.record(
        {
          action: 'student.exit',
          area: 'Students',
          entity: 'Student',
          entityId: s.id,
          summary,
          detail: [dto.reason, `effective ${date}`, closed && 'student sign-in closed']
            .filter(Boolean)
            .join(' · '),
          after: { status, exitOn: dto.date, destination: dto.destination || null },
        },
        asTx(tx),
      );
      return closed;
    });
    await this.access.forget(closed);
    return withNotice(await this.students.row(s.id), `${dto.kind} recorded for ${name}.`);
  }

  /** The transfer letter on the student's documents (verified: the school recorded it). */
  private async recordLetter(tx: TenantTx, studentId: string, fileId: string | null) {
    const existing = await tx.studentDocument.findFirst({
      where: { studentId, key: 'transfer_letter', deletedAt: null },
    });
    const userId = RequestContext.get()?.userId ?? null;
    const fields = {
      label: 'Transfer letter',
      status: 'VERIFIED' as const,
      fileId: fileId ?? existing?.fileId ?? null,
      verifiedAt: new Date(),
      verifiedById: userId,
    };
    if (existing) await tx.studentDocument.update({ where: { id: existing.id }, data: fields });
    else
      await tx.studentDocument.create({
        data: {
          schoolId: this.students.schoolId(),
          studentId,
          key: 'transfer_letter',
          ...fields,
        },
      });
  }

  /** Moves a student to another branch: same class level, the arm given there (or none yet). */
  private async changeBranch(id: string, dto: TransferStudentDto) {
    const s = await this.students.find(id);
    const name = studentName(s);
    if (!ON_ROLL.includes(s.status))
      throw AppException.conflict(`${name} has left the school.`, 'STUDENT_LEFT');
    const branch = isUuid(dto.branchId ?? '')
      ? await this.db.branch.findFirst({ where: { id: dto.branchId, status: 'ACTIVE' } })
      : null;
    if (!branch) throw unprocessable('Choose an active branch.', 'VALIDATION', 'branchId');
    if (branch.id === s.branchId)
      throw unprocessable(`${name} is already at ${branch.name}.`, 'SAME_BRANCH', 'branchId');
    const session = await this.students.currentSession();
    const current = currentEnrollment(s, session?.id ?? null);
    const enrollment =
      current && current.sessionId === session?.id && current.status === 'ACTIVE' ? current : null;
    let arm: { id: string; name: string; capacity: number } | null = null;
    if (enrollment) {
      const runs = await this.db.branchLevel.findFirst({
        where: { branchId: branch.id, levelId: enrollment.levelId },
      });
      if (!runs)
        throw unprocessable(
          `${branch.name} doesn’t run ${enrollment.level.name}.`,
          'LEVEL_NOT_AT_BRANCH',
          'branchId',
        );
      if (dto.arm) {
        arm = await this.db.classArm.findFirst({
          where: {
            branchId: branch.id,
            levelId: enrollment.levelId,
            name: dto.arm,
            archivedAt: null,
          },
          select: { id: true, name: true, capacity: true },
        });
        if (!arm)
          throw unprocessable(
            `${enrollment.level.name} has no arm ${dto.arm} at ${branch.name}.`,
            'VALIDATION',
            'arm',
          );
        const used = (await this.students.armUsage(session!.id, [arm.id])).get(arm.id) ?? 0;
        if (used + 1 > arm.capacity)
          throw AppException.conflict(
            `${armLabel(enrollment.level.name, arm.name)} at ${branch.name} is full (${used} of ${arm.capacity}). Choose another arm or raise capacity in Classes & Arms.`,
            'ARM_FULL',
          );
      }
    } else if (dto.arm)
      throw AppException.conflict(
        `${name} isn’t enrolled this session. Place them in a class after the move.`,
        'NOT_ENROLLED',
      );
    const from = classOf(current);
    const to = enrollment && arm ? armLabel(enrollment.level.name, arm.name) : '';
    await this.db.$transaction(async (tx) => {
      await tx.student.update({ where: { id: s.id }, data: { branchId: branch.id } });
      if (enrollment) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { branchId: branch.id, armId: arm?.id ?? null },
        });
        // Their days in the old arm stay with it (registers, attendance rates).
        if (enrollment.armId && enrollment.armId !== arm?.id)
          await tx.armMove.create({
            data: {
              schoolId: this.students.schoolId(),
              enrollmentId: enrollment.id,
              fromArmId: enrollment.armId,
              toArmId: arm?.id ?? null,
              movedOn: this.students.today(),
            },
          });
      }
      await this.audit.record(
        {
          action: 'student.branch_transfer',
          area: 'Students',
          entity: 'Student',
          entityId: s.id,
          summary: `Moved to ${branch.name}`,
          detail: [
            `from ${s.branch.name}`,
            enrollment && `${from || enrollment.level.name} → ${to || 'awaiting an arm'}`,
          ]
            .filter(Boolean)
            .join(' · '),
          before: { branchId: s.branchId, armId: enrollment?.armId ?? null },
          after: { branchId: branch.id, armId: arm?.id ?? null },
        },
        asTx(tx),
      );
    });
    return withNotice(
      await this.students.row(s.id),
      `${name} moved to ${branch.name}${to ? ` (${to})` : enrollment ? '. Place them in an arm there' : ''}.`,
    );
  }

  /* ---------------- Arms ---------------- */

  /** Moves students of one class level (at one branch) to another arm, this session. */
  async assignArm(dto: AssignArmDto) {
    if (!dto.studentIds.length)
      throw unprocessable('Choose at least one student.', 'VALIDATION', 'studentIds');
    const list = await this.many(dto.studentIds);
    const session = await this.students.currentSession();
    if (!session) throw AppException.conflict('Start a session first.', 'NO_SESSION');
    const enrollments = list.map((s) => {
      const e = currentEnrollment(s, session.id);
      if (!ON_ROLL.includes(s.status))
        throw AppException.conflict(`${studentName(s)} has left the school.`, 'STUDENT_LEFT');
      if (!e || e.sessionId !== session.id || e.status !== 'ACTIVE')
        throw AppException.conflict(
          `${studentName(s)} isn’t enrolled for ${session.name}.`,
          'NOT_ENROLLED',
        );
      return { s, e };
    });
    if (new Set(enrollments.map((x) => x.e.levelId)).size > 1)
      throw unprocessable('Choose students from one class level to move them to another arm.');
    if (new Set(enrollments.map((x) => x.e.branchId)).size > 1)
      throw unprocessable('Choose students from one branch to move them to another arm.');
    const { e: first } = enrollments[0]!;
    const level = first.level.name;
    const arm = await this.db.classArm.findFirst({
      where: { branchId: first.branchId, levelId: first.levelId, name: dto.arm, archivedAt: null },
    });
    if (!arm) throw unprocessable(`${level} has no arm ${dto.arm}.`, 'VALIDATION', 'arm');
    const label = armLabel(level, arm.name);
    const moving = enrollments.filter((x) => x.e.armId !== arm.id);
    const after =
      ((await this.students.armUsage(session.id, [arm.id])).get(arm.id) ?? 0) + moving.length;
    if (moving.length && after > arm.capacity)
      throw AppException.conflict(
        `${label} would have ${after} of ${arm.capacity} places. Move fewer students or raise capacity in Classes & Arms.`,
        'ARM_FULL',
      );
    await this.db.$transaction(async (tx) => {
      for (const { s, e } of moving) {
        await tx.enrollment.update({ where: { id: e.id }, data: { armId: arm.id } });
        // From today they're on the new arm's roll; earlier days stay with the old arm.
        if (e.armId)
          await tx.armMove.create({
            data: {
              schoolId: this.students.schoolId(),
              enrollmentId: e.id,
              fromArmId: e.armId,
              toArmId: arm.id,
              movedOn: this.students.today(),
            },
          });
        const from = classOf(e);
        await this.audit.record(
          {
            action: 'enrollment.move',
            area: 'Students',
            entity: 'Student',
            entityId: s.id,
            summary: from ? `Moved from ${from} to ${label}` : `Placed in ${label}`,
            before: { armId: e.armId },
            after: { armId: arm.id },
          },
          asTx(tx),
        );
      }
    });
    return withNotice(
      { moved: moving.length },
      `${plural(moving.length, 'student')} moved to ${label}.`,
    );
  }

  /** Places admitted students (awaiting an arm this session) in an arm of their class level. */
  async enroll(dto: EnrollDto) {
    if (!dto.studentIds.length)
      throw unprocessable('Choose at least one student.', 'VALIDATION', 'studentIds');
    const list = await this.many(dto.studentIds);
    const session = await this.students.currentSession();
    if (!session) throw AppException.conflict('Start a session first.', 'NO_SESSION');
    const enrollments = list.map((s) => ({ s, e: currentEnrollment(s, session.id) }));
    if (enrollments.some(({ e }) => e?.sessionId === session.id && !!e.armId))
      throw AppException.conflict(
        'Some of these students are already enrolled this session.',
        'ALREADY_ENROLLED',
      );
    for (const { s, e } of enrollments) {
      if (!ON_ROLL.includes(s.status))
        throw AppException.conflict(`${studentName(s)} has left the school.`, 'STUDENT_LEFT');
      if (!e || e.sessionId !== session.id || e.status !== 'ACTIVE')
        throw AppException.conflict(
          `${studentName(s)} has no place for ${session.name} yet. Admit or promote them first.`,
          'NOT_ADMITTED',
        );
    }
    const branches = new Set(enrollments.map(({ e }) => e!.branchId));
    if (branches.size > 1)
      throw unprocessable('Choose students from one branch to enroll them together.');
    const branchId = enrollments[0]!.e!.branchId;
    const arm = await this.db.classArm.findFirst({
      where: { branchId, name: dto.arm, archivedAt: null, level: { name: dto.level } },
      include: { level: { select: { id: true, name: true } } },
    });
    if (!arm) throw unprocessable('Choose a class arm.', 'VALIDATION', 'arm');
    const label = armLabel(arm.level.name, arm.name);
    if (enrollments.some(({ e }) => e!.levelId !== arm.levelId))
      throw unprocessable(
        `Only students admitted into ${arm.level.name} can be enrolled in ${label}.`,
      );
    const after =
      ((await this.students.armUsage(session.id, [arm.id])).get(arm.id) ?? 0) + list.length;
    if (after > arm.capacity)
      throw AppException.conflict(
        `${label} would be over capacity (${after} of ${arm.capacity}). Split the group across arms, or raise capacity in Classes & Arms.`,
        'ARM_FULL',
      );
    const today = this.students.today();
    await this.db.$transaction(async (tx) => {
      for (const { s, e } of enrollments) {
        await tx.enrollment.update({
          where: { id: e!.id },
          data: { armId: arm.id, enrolledOn: today },
        });
        await this.audit.record(
          {
            action: 'enrollment.place',
            area: 'Students',
            entity: 'Student',
            entityId: s.id,
            summary: `Enrolled in ${session.name} · ${label}`,
            after: { armId: arm.id, sessionId: session.id },
          },
          asTx(tx),
        );
      }
    });
    return withNotice(
      { enrolled: list.length, className: label },
      `${plural(list.length, 'student')} enrolled in ${label} for ${session.name}. Their teachers can see them now.`,
    );
  }
}
