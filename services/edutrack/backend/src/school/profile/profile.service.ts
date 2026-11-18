import { brandColorProblem } from '@edutrack/shared';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isNigerianState, lgasOf, DEFAULT_BRAND_COLOR } from '@edutrack/shared';
import { normalizePhone } from '../../auth/identifiers.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { StoredFile } from '../../generated/prisma/client.js';
import { displayPhone, formatDay, OWNERSHIP_LABEL } from '../../platform/shared/format.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SchoolBrandingService } from '../shared/school-branding.service.js';
import type { FileRefDto, UpdateSchoolProfileDto } from './dto/profile.dto.js';
import type { SchoolProfileResponse } from './dto/profile.responses.js';
import {
  isDataUrl,
  parseUpload,
  schoolFileKey,
  sizeText,
  type ParsedUpload,
  type UploadRule,
} from './school-files.js';
import { EMAIL, ON_ROLL, plainTx, timeline, UNLIMITED_BRANCHES } from './view.js';

export const LOGO_RULE: UploadRule = {
  kinds: ['png', 'jpeg'],
  maxBytes: 1024 * 1024,
  typeMessage: 'Use a PNG or JPG image for the logo.',
  sizeMessage: 'The logo is larger than 1 MB.',
  code: 'LOGO',
};

export const CERTIFICATE_RULE: UploadRule = {
  kinds: ['pdf', 'png', 'jpeg'],
  maxBytes: 5 * 1024 * 1024,
  typeMessage: 'Use a PDF, JPG or PNG for the certificate.',
  sizeMessage: 'The certificate is larger than 5 MB.',
  code: 'CERTIFICATE',
};

/** Profile fields as the screens name them, for the history line ("motto, logo"). */
const FIELD_LABELS = {
  name: 'display name',
  motto: 'motto',
  founded: 'year founded',
  brandColor: 'brand colour',
  logo: 'logo',
  email: 'email',
  phone: 'phone',
  website: 'website',
  street: 'address',
  city: 'town',
  lga: 'LGA',
  state: 'state',
  approvingBody: 'approving body',
  approvalNumber: 'approval number',
  cacNumber: 'CAC number',
  certificate: 'certificate',
} as const;
type Field = keyof typeof FIELD_LABELS;

type FileSlot = 'logo' | 'certificate';
/** What a save does to one file: keep it, remove it, or replace it with an upload. */
type FileChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upload'; name: string; upload: ParsedUpload; id: string; storageKey: string };

const LOCKED_LEGAL_NAME =
  'The legal name is set by EduTrack. Contact EduTrack support to change it.';

/**
 * The school's own details (Settings › School profile). Admins edit the display name, motto,
 * logo, brand colour, contact, address and registration; the legal name, ownership, sections
 * and plan are EduTrack's and are only shown.
 */
@Injectable()
export class SchoolProfileService {
  private readonly logger = new Logger(SchoolProfileService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly branding: SchoolBrandingService,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  private load(schoolId: string) {
    return this.tenant.db.school.findUniqueOrThrow({
      where: { id: schoolId },
      include: {
        logoFile: true,
        certificateFile: true,
        sections: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { name: true } },
        subscription: { include: { plan: true } },
      },
    });
  }

  async get(schoolId: string): Promise<SchoolProfileResponse> {
    const [school, students, history] = await Promise.all([
      this.load(schoolId),
      this.tenant.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
      this.audit.history('School', schoolId),
    ]);
    const plan = school.subscription?.plan;
    const fileRef = async (file: StoredFile | null, image: boolean) =>
      file && !file.deletedAt
        ? {
            name: file.originalName,
            size: sizeText(Number(file.sizeBytes)),
            dataUrl: image ? await this.branding.logoUrl(file) : null,
          }
        : null;
    return {
      name: school.name,
      legalName: school.legalName,
      ownership: OWNERSHIP_LABEL[school.ownership],
      sections: school.sections.map((s) => s.name),
      brandColor: school.brandColor ?? DEFAULT_BRAND_COLOR,
      motto: school.motto ?? '',
      founded: school.foundedYear ? String(school.foundedYear) : '',
      logo: await fileRef(school.logoFile, true),
      email: school.email ?? '',
      phone: displayPhone(school.phone),
      website: school.website ?? '',
      street: school.street ?? '',
      city: school.city ?? '',
      lga: school.lga ?? '',
      state: school.state ?? '',
      approvingBody: school.approvingBody ?? '',
      approvalNumber: school.approvalNumber ?? '',
      cacNumber: school.cacNumber ?? '',
      certificate: await fileRef(school.certificateFile, false),
      plan: {
        name: plan?.name ?? 'No plan',
        students,
        studentLimit: plan?.studentLimit ?? 0,
        branchLimit: plan ? (plan.branchLimit ?? UNLIMITED_BRANCHES) : 1,
        renews: school.subscription
          ? formatDay(school.subscription.renewsOn, { calendar: true })
          : '',
      },
      updatedAt: formatDay(school.updatedAt),
      history: timeline(history),
    };
  }

  /** Checks what the DTO can't: rules that depend on other fields or on the stored school. */
  private check(dto: UpdateSchoolProfileDto, legalName: string) {
    if (dto.legalName !== undefined && dto.legalName.trim() !== legalName)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        LOCKED_LEGAL_NAME,
        'LEGAL_NAME_LOCKED',
        { legalName: LOCKED_LEGAL_NAME },
      );
    if (!EMAIL.test(dto.email))
      throw AppException.validation({ email: 'Enter a valid school email.' });
    const phone = normalizePhone(dto.phone);
    if (!phone) throw AppException.validation({ phone: 'Enter a Nigerian phone number.' });
    if (!isNigerianState(dto.state))
      throw AppException.validation({ state: 'Choose a Nigerian state.' });
    if (dto.lga && !lgasOf(dto.state).includes(dto.lga))
      throw AppException.validation({ lga: 'Choose an LGA in the chosen state.' });
    const year = this.clock.now().getFullYear();
    if (dto.founded && (+dto.founded < 1900 || +dto.founded > year))
      throw AppException.validation({ founded: `Enter a year between 1900 and ${year}.` });
    return phone;
  }

  /** Reads one file field of the form: unchanged, removed, or a new upload. */
  private fileChange(
    schoolId: string,
    slot: FileSlot,
    ref: FileRefDto | null | undefined,
    current: StoredFile | null,
  ): FileChange {
    if (ref === undefined) return { kind: 'keep' };
    if (ref === null) return { kind: current ? 'remove' : 'keep' };
    const rule = slot === 'logo' ? LOGO_RULE : CERTIFICATE_RULE;
    if (!isDataUrl(ref.dataUrl)) {
      // The stored file sent back as it was shown.
      if (current) return { kind: 'keep' };
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        rule.typeMessage,
        `${rule.code}_TYPE`,
        {
          [slot]: rule.typeMessage,
        },
      );
    }
    const upload = parseUpload(ref.dataUrl, rule);
    const { id, storageKey } = schoolFileKey(schoolId, slot, upload.ext);
    const name = ref.name.trim() || `${slot}.${upload.ext}`;
    return { kind: 'upload', name, upload, id, storageKey };
  }

  async update(schoolId: string, dto: UpdateSchoolProfileDto): Promise<SchoolProfileResponse> {
    const school = await this.load(schoolId);
    const phone = this.check(dto, school.legalName);
    // School names are unique across EduTrack (the back office enforces it when creating and
    // editing); a rename here follows the same rule.
    if (dto.name.trim().toLowerCase() !== school.name.toLowerCase()) {
      const taken = await this.tenant.db.school.findFirst({
        where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, id: { not: schoolId } },
        select: { id: true },
      });
      if (taken)
        throw AppException.validation(
          { name: 'Another school on EduTrack already uses this name.' },
          'Another school on EduTrack already uses this name.',
        );
    }
    // Only a new colour is checked, so a school whose stored colour predates the rule can still save.
    const colour =
      dto.brandColor && dto.brandColor.toUpperCase() !== school.brandColor?.toUpperCase()
        ? brandColorProblem(dto.brandColor)
        : null;
    if (colour) throw AppException.validation({ brandColor: colour });
    const files = {
      logo: this.fileChange(schoolId, 'logo', dto.logo, school.logoFile),
      certificate: this.fileChange(
        schoolId,
        'certificate',
        dto.certificate,
        school.certificateFile,
      ),
    };
    const next = {
      name: dto.name,
      motto: dto.motto || null,
      foundedYear: dto.founded ? Number(dto.founded) : null,
      brandColor: dto.brandColor?.toUpperCase() ?? school.brandColor,
      email: dto.email.toLowerCase(),
      phone,
      website: dto.website || null,
      street: dto.street || null,
      city: dto.city || null,
      lga: dto.lga || null,
      state: dto.state,
      approvingBody: dto.approvingBody || null,
      approvalNumber: dto.approvalNumber,
      cacNumber: dto.cacNumber ? dto.cacNumber.toUpperCase() : null,
    };
    const before: Record<Field, unknown> = {
      name: school.name,
      motto: school.motto,
      founded: school.foundedYear,
      brandColor: school.brandColor,
      logo: school.logoFile?.originalName ?? null,
      email: school.email,
      phone: school.phone,
      website: school.website,
      street: school.street,
      city: school.city,
      lga: school.lga,
      state: school.state,
      approvingBody: school.approvingBody,
      approvalNumber: school.approvalNumber,
      cacNumber: school.cacNumber,
      certificate: school.certificateFile?.originalName ?? null,
    };
    const fileName = (slot: FileSlot) => {
      const change = files[slot];
      return change.kind === 'upload'
        ? change.name
        : change.kind === 'remove'
          ? null
          : before[slot];
    };
    const after: Record<Field, unknown> = {
      ...next,
      founded: next.foundedYear,
      logo: fileName('logo'),
      certificate: fileName('certificate'),
    };
    const changed = (Object.keys(FIELD_LABELS) as Field[]).filter(
      (k) => before[k] !== after[k] || (k in files && files[k as FileSlot].kind === 'upload'),
    );

    const uploads = (['logo', 'certificate'] as const).flatMap((slot) => {
      const c = files[slot];
      return c.kind === 'upload' ? [{ slot, ...c }] : [];
    });
    for (const u of uploads) await this.storage.upload(u.storageKey, u.upload.bytes, u.upload.mime);

    const ctx = RequestContext.get();
    const now = this.clock.now();
    const replaced = (['logo', 'certificate'] as const)
      .filter((slot) => files[slot].kind !== 'keep')
      .map((slot) => (slot === 'logo' ? school.logoFile : school.certificateFile))
      .filter((f): f is StoredFile => !!f);
    try {
      await this.tenant.db.$transaction(async (tx) => {
        for (const u of uploads)
          await tx.storedFile.create({
            data: {
              id: u.id,
              schoolId,
              storageKey: u.storageKey,
              originalName: u.name,
              mimeType: u.upload.mime,
              sizeBytes: BigInt(u.upload.bytes.length),
              sha256: u.upload.sha256,
              uploadedById: ctx?.userId ?? null,
            },
          });
        const fileId = (slot: FileSlot) => {
          const c = files[slot];
          return c.kind === 'upload' ? c.id : c.kind === 'remove' ? null : undefined;
        };
        await tx.school.update({
          where: { id: schoolId },
          data: { ...next, logoFileId: fileId('logo'), certificateFileId: fileId('certificate') },
        });
        for (const f of replaced)
          await tx.storedFile.update({ where: { id: f.id }, data: { deletedAt: now } });
        // Saving the profile is what completes the Setup Center's School Profile step.
        await tx.setupStepState.upsert({
          where: { schoolId_stepKey: { schoolId, stepKey: 'school-profile' } },
          create: {
            schoolId,
            stepKey: 'school-profile',
            confirmedAt: now,
            confirmedById: ctx?.userId ?? null,
          },
          update: {},
        });
        if (changed.length)
          await this.audit.record(
            {
              action: 'profile.update',
              area: 'School',
              entity: 'School',
              entityId: schoolId,
              summary: 'Updated school details',
              detail:
                changed
                  .slice(0, 4)
                  .map((k) => FIELD_LABELS[k])
                  .join(', ') + (changed.length > 4 ? ` +${changed.length - 4} more` : ''),
              before: Object.fromEntries(changed.map((k) => [k, before[k]])),
              after: Object.fromEntries(changed.map((k) => [k, after[k]])),
            },
            plainTx(tx),
          );
      });
    } catch (error) {
      await Promise.all(uploads.map((u) => this.storage.remove(u.storageKey).catch(() => null)));
      throw error;
    }
    for (const f of replaced)
      await this.storage
        .remove(f.storageKey)
        .catch((error: unknown) =>
          this.logger.warn({ msg: 'Old school file not removed', error: String(error) }),
        );
    return this.get(schoolId);
  }
}
