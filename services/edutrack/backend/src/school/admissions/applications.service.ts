import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ApplicationStage } from '../../generated/prisma/enums.js';
import { displayPhone, formatDay, lagosToday } from '../../platform/shared/format.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asAuditDb } from '../staff/staff-audit.js';
import { isUuid } from '../staff/staff-records.service.js';
import { EMAIL, GENDER_OF, toE164 } from '../staff/staff-view.js';
import { AdmissionRecordsService } from './admission-records.service.js';
import {
  ADMISSION_TYPE_LABEL,
  ADMISSION_TYPE_OF,
  normalise,
  parseDay,
  STAGE_LABEL,
} from './admissions-view.js';

/** Where an application can go from each stage (Admitted only through the admission wizard). */
const NEXT: Record<ApplicationStage, ApplicationStage[]> = {
  PENDING: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['OFFER_SENT', 'REJECTED', 'PENDING'],
  OFFER_SENT: ['OFFER_ACCEPTED', 'DECLINED', 'UNDER_REVIEW'],
  OFFER_ACCEPTED: ['DECLINED', 'OFFER_SENT'],
  REJECTED: ['UNDER_REVIEW'],
  DECLINED: ['OFFER_SENT', 'UNDER_REVIEW'],
  ADMITTED: [],
};
const STAGE_OF = Object.fromEntries(
  Object.entries(STAGE_LABEL).map(([k, v]) => [v, k as ApplicationStage]),
) as Record<string, ApplicationStage>;
/** What moving to each stage is called in the history. */
const ACTION: Record<ApplicationStage, string> = {
  PENDING: 'Moved back to pending',
  UNDER_REVIEW: 'Under review',
  OFFER_SENT: 'Offer sent',
  OFFER_ACCEPTED: 'Offer accepted',
  ADMITTED: 'Admitted',
  REJECTED: 'Rejected',
  DECLINED: 'Offer declined',
};

const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface ApplicationInput {
  firstName: string;
  surname: string;
  otherNames?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  type: string;
  branch: string;
  level: string;
  guardianName: string;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  previousSchool?: string | null;
  note?: string | null;
  appliedOn?: string | null;
}

export interface StageInput {
  stage: string;
  note?: string | null;
  assessmentOn?: string | null;
  assessmentResult?: string | null;
  offerExpiresOn?: string | null;
}

/**
 * Students › Admissions: applications the office records (a walk-in, a phone call, a form handed
 * in) and works through: Pending → Under review (entrance assessment or interview) → Offer sent →
 * Offer accepted → Admitted, or Rejected / Declined. Admitting happens in the admission wizard,
 * which the application fills in. Every change is in the application's history.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly records: AdmissionRecordsService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.records.db;
  }

  private today() {
    return lagosToday(this.clock.now());
  }

  private async find(id: string) {
    const a = isUuid(id)
      ? await this.db.admissionApplication.findFirst({
          where: { id },
          include: {
            applyingForLevel: { select: { name: true } },
            branch: { select: { name: true } },
            session: { select: { name: true } },
          },
        })
      : null;
    if (!a) throw AppException.notFound('This application doesn’t exist.', 'APPLICATION_NOT_FOUND');
    return a;
  }

  /** The application with what the screens need, and its history. */
  async detail(id: string) {
    const a = await this.find(id);
    const history = await this.db.auditEvent.findMany({
      where: { entityType: 'AdmissionApplication', entityId: a.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { summary: true, detail: true, createdAt: true, actorName: true },
    });
    return {
      id: a.id,
      number: a.number,
      firstName: a.firstName,
      surname: a.surname,
      otherNames: a.otherNames ?? '',
      applicant: [a.firstName, a.surname].join(' '),
      gender: a.gender === 'MALE' ? 'Male' : a.gender === 'FEMALE' ? 'Female' : '',
      dateOfBirth: iso(a.dateOfBirth),
      type: ADMISSION_TYPE_LABEL[a.type],
      session: a.session.name,
      branch: a.branch?.name ?? '',
      level: a.applyingForLevel.name,
      guardianName: a.guardianName ?? '',
      guardianPhone: a.guardianPhone ? displayPhone(a.guardianPhone) : '',
      guardianEmail: a.guardianEmail ?? '',
      previousSchool: a.previousSchool ?? '',
      note: a.note ?? '',
      appliedOn: iso(a.appliedOn)!,
      applied: formatDay(a.appliedOn, { calendar: true }),
      stage: STAGE_LABEL[a.stage],
      stageNote: a.stageNote ?? '',
      assessmentOn: iso(a.assessmentOn),
      assessmentResult: a.assessmentResult ?? '',
      offerSentOn: iso(a.offerSentOn),
      offerExpiresOn: iso(a.offerExpiresOn),
      offerExpired:
        a.stage === 'OFFER_SENT' && !!a.offerExpiresOn && a.offerExpiresOn < this.today(),
      studentId: a.studentId,
      /** Stages it can move to from here. */
      next: NEXT[a.stage].map((s) => STAGE_LABEL[s]),
      canEdit: a.stage !== 'ADMITTED',
      canAdmit: a.stage === 'OFFER_ACCEPTED' && !a.studentId,
      history: history.map((h) => ({
        at: h.createdAt.toISOString(),
        title: h.summary,
        detail: h.detail ?? '',
        by: h.actorName ?? '',
      })),
    };
  }

  /** Checks and resolves what the screen sent. */
  private async fields(dto: ApplicationInput) {
    const errors: Record<string, string> = {};
    const firstName = (dto.firstName ?? '').trim();
    const surname = (dto.surname ?? '').trim();
    if (!firstName) errors.firstName = 'Enter the first name.';
    if (!surname) errors.surname = 'Enter the surname.';
    const type = ADMISSION_TYPE_OF[dto.type as keyof typeof ADMISSION_TYPE_OF];
    if (!type) errors.type = 'Choose New intake or Transfer in.';
    const gender = dto.gender ? GENDER_OF[dto.gender as keyof typeof GENDER_OF] : null;
    if (dto.gender && !gender) errors.gender = 'Choose Male or Female.';
    const today = this.today();
    const birth = dto.dateOfBirth ? parseDay(dto.dateOfBirth) : null;
    if (dto.dateOfBirth && (!birth || birth >= today))
      errors.dateOfBirth = 'Enter a real date of birth.';
    const appliedOn = dto.appliedOn ? parseDay(dto.appliedOn) : today;
    if (!appliedOn || appliedOn > today)
      errors.appliedOn = 'Enter the day they applied (not in the future).';
    const guardianName = (dto.guardianName ?? '').trim();
    if (!guardianName) errors.guardianName = 'Enter the parent or guardian’s name.';
    const phone = dto.guardianPhone?.trim() ? toE164(dto.guardianPhone) : null;
    if (dto.guardianPhone?.trim() && !phone)
      errors.guardianPhone = 'Enter a Nigerian phone number.';
    const email = dto.guardianEmail?.trim().toLowerCase() || null;
    if (email && !EMAIL.test(email)) errors.guardianEmail = 'Enter a valid email address.';
    if (!phone && !email && !errors.guardianPhone && !errors.guardianEmail)
      errors.guardianPhone = 'Enter a phone number or an email to reach the family.';

    const { session } = await this.records.current();
    if (!session)
      throw AppException.conflict('Set up a session before taking applications.', 'NO_SESSION');
    const placement = await this.records.placement(session.id);
    const branch = placement.branches.find((b) => normalise(b.name) === normalise(dto.branch));
    if (!branch) errors.branch = 'Choose a branch.';
    const arm = branch
      ? placement.arms.find(
          (a) => a.branchId === branch.id && normalise(a.levelName) === normalise(dto.level),
        )
      : undefined;
    if (branch && !arm) errors.level = 'Choose a class this branch has.';
    if (Object.keys(errors).length) throw invalid(errors);
    return {
      sessionId: session.id,
      branchId: branch!.id,
      applyingForLevelId: arm!.levelId,
      type: type!,
      firstName,
      surname,
      otherNames: dto.otherNames?.trim() || null,
      gender,
      dateOfBirth: birth,
      guardianName,
      guardianPhone: phone,
      guardianEmail: email,
      previousSchool: dto.previousSchool?.trim() || null,
      note: dto.note?.trim() || null,
      appliedOn: appliedOn!,
      label: `${arm!.levelName} · ${branch!.name}`,
    };
  }

  /** The next APP-<year>-<####> number. */
  private async nextNumber(year: number) {
    const prefix = `APP-${year}-`;
    const last = await this.db.admissionApplication.findMany({
      where: { number: { startsWith: prefix } },
      select: { number: true },
    });
    const max = last.reduce((m, r) => Math.max(m, Number(r.number.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  async create(dto: ApplicationInput) {
    const f = await this.fields(dto);
    const { label, ...data } = f;
    // Two people saving at once could take the same number: try the next one.
    for (let attempt = 0; ; attempt++) {
      const number = await this.nextNumber(f.appliedOn.getUTCFullYear());
      try {
        const a = await this.db.$transaction(async (tx) => {
          const row = await tx.admissionApplication.create({
            data: { schoolId: this.records.schoolId(), number, ...data, stage: 'PENDING' },
          });
          await this.audit.record(
            {
              action: 'application.create',
              area: 'Students',
              entity: 'AdmissionApplication',
              entityId: row.id,
              summary: 'Application recorded',
              detail: `${number} · ${f.firstName} ${f.surname} for ${label}`,
            },
            asAuditDb(tx),
          );
          return row;
        });
        return this.detail(a.id);
      } catch (e) {
        if (attempt < 3 && (e as { code?: string }).code === 'P2002') continue;
        throw e;
      }
    }
  }

  async update(id: string, dto: ApplicationInput) {
    const a = await this.find(id);
    if (a.stage === 'ADMITTED')
      throw AppException.conflict(
        'This applicant is now a student. Change their details on the student record.',
        'APPLICATION_ADMITTED',
      );
    const { label, ...data } = await this.fields({
      ...dto,
      appliedOn: dto.appliedOn ?? iso(a.appliedOn),
    });
    await this.db.$transaction(async (tx) => {
      await tx.admissionApplication.update({
        where: { id: a.id },
        data: { ...data, sessionId: a.sessionId },
      });
      await this.audit.record(
        {
          action: 'application.update',
          area: 'Students',
          entity: 'AdmissionApplication',
          entityId: a.id,
          summary: 'Details updated',
          detail: `${data.firstName} ${data.surname} for ${label}`,
        },
        asAuditDb(tx),
      );
    });
    return this.detail(a.id);
  }

  /** Moves an application to another stage, with what that stage needs. */
  async move(id: string, dto: StageInput) {
    const a = await this.find(id);
    const to = STAGE_OF[dto.stage];
    if (!to || to === 'ADMITTED')
      throw invalid({ stage: 'Choose a stage. Admit the student from the admission wizard.' });
    if (!NEXT[a.stage].includes(to))
      throw AppException.conflict(
        `A ${STAGE_LABEL[a.stage].toLowerCase()} application can’t move to ${STAGE_LABEL[to].toLowerCase()}.`,
        'STAGE_NOT_ALLOWED',
      );
    const errors: Record<string, string> = {};
    const note = dto.note?.trim() || null;
    const assessmentOn = dto.assessmentOn ? parseDay(dto.assessmentOn) : null;
    if (dto.assessmentOn && !assessmentOn) errors.assessmentOn = 'Enter a real date.';
    const offerExpiresOn = dto.offerExpiresOn ? parseDay(dto.offerExpiresOn) : null;
    const today = this.today();
    if (dto.offerExpiresOn && (!offerExpiresOn || offerExpiresOn < today))
      errors.offerExpiresOn = 'Choose a date from today on.';
    if ((to === 'REJECTED' || to === 'DECLINED') && !note) errors.note = 'Say why, for the record.';
    if (Object.keys(errors).length) throw invalid(errors);

    const data = {
      stage: to,
      stageNote: note,
      ...(to === 'UNDER_REVIEW' && {
        ...(dto.assessmentOn !== undefined && { assessmentOn }),
        ...(dto.assessmentResult !== undefined && {
          assessmentResult: dto.assessmentResult?.trim() || null,
        }),
      }),
      ...(to === 'OFFER_SENT' && { offerSentOn: today, offerExpiresOn }),
    };
    const detail = [
      to === 'UNDER_REVIEW' && assessmentOn && `Assessment ${formatDay(assessmentOn)}`,
      to === 'UNDER_REVIEW' &&
        dto.assessmentResult?.trim() &&
        `Result: ${dto.assessmentResult.trim()}`,
      to === 'OFFER_SENT' && offerExpiresOn && `Accept by ${formatDay(offerExpiresOn)}`,
      note,
    ]
      .filter(Boolean)
      .join(' · ');
    await this.db.$transaction(async (tx) => {
      // Only if it hasn't moved meanwhile (someone else, or the wizard admitting it).
      const moved = await tx.admissionApplication.updateMany({
        where: { id: a.id, stage: a.stage, studentId: null },
        data,
      });
      if (!moved.count)
        throw AppException.conflict(
          'This application changed while you were looking at it. Reload and try again.',
          'APPLICATION_CHANGED',
        );
      await this.audit.record(
        {
          action: 'application.stage',
          area: 'Students',
          entity: 'AdmissionApplication',
          entityId: a.id,
          summary: ACTION[to],
          detail: detail || null,
          before: { stage: STAGE_LABEL[a.stage] },
          after: { stage: STAGE_LABEL[to] },
        },
        asAuditDb(tx),
      );
    });
    return this.detail(a.id);
  }
}
