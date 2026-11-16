import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { deviceLabel } from '../../auth/tokens.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  PLATFORM_SECURITY_KEY,
  readPlatformSecurity,
  type PlatformSecuritySettings,
} from '../../common/platform-settings.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { displayPhone, formatDay, formatStamp } from '../shared/format.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import { STAFF_STATUS_LABEL, unprocessable } from '../shared/staff.js';
import type { SecuritySettingsDto, UpdateProfileDto } from './dto/account.dto.js';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Signed photo links last an hour; the profile is fetched again well within that. */
const AVATAR_LINK_SECONDS = 3600;

const IMAGE_TYPES = {
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
} as const;

/** The signed-in staff member's own profile and photo, and the back office's security toggles. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: PlatformAuditService,
    private readonly clock: Clock,
  ) {}

  private me(): string {
    const id = RequestContext.get()?.userId;
    if (!id) throw AppException.unauthorized();
    return id;
  }

  /** A short-lived link to the user's photo, or null. */
  async avatarUrl(file: { storageKey: string; deletedAt: Date | null } | null) {
    if (!file || file.deletedAt) return null;
    return this.storage.getDownloadUrl(file.storageKey, AVATAR_LINK_SECONDS).catch(() => null);
  }

  async profile() {
    const userId = this.me();
    const [staff, lastSession] = await Promise.all([
      this.prisma.platformStaff.findUniqueOrThrow({
        where: { userId },
        include: { role: true, user: { include: { avatarFile: true } } },
      }),
      this.prisma.authSession.findFirst({
        where: { userId, portal: 'PLATFORM' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const { user } = staff;
    const signedInAt = user.lastSignInAt ?? lastSession?.createdAt;
    const where = lastSession
      ? [
          lastSession.deviceLabel ?? deviceLabel(lastSession.userAgent ?? undefined),
          lastSession.location,
        ]
          .filter(Boolean)
          .join(', ')
      : '';
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: displayPhone(user.phone),
      email: user.email ?? '',
      roleName: staff.role.name,
      status: STAFF_STATUS_LABEL[staff.status],
      memberSince: formatDay(staff.activatedAt ?? staff.createdAt),
      lastSignIn: signedInAt ? `${formatStamp(signedInAt)}${where ? ` · ${where}` : ''}` : '—',
      avatarUrl: await this.avatarUrl(user.avatarFile),
    };
  }

  async updateProfile(dto: UpdateProfileDto) {
    const userId = this.me();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    let phone: string | null = null;
    if (dto.phone) {
      phone = normalizePhone(dto.phone);
      if (!phone)
        throw AppException.validation({ phone: 'Enter a phone number, like 0803 412 7781.' });
      const taken = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (taken && taken.id !== userId)
        throw AppException.validation({
          phone: 'This phone number is already used by another EduTrack account.',
        });
    }
    const changed =
      dto.firstName !== user.firstName || dto.lastName !== user.lastName || phone !== user.phone;
    if (changed)
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { firstName: dto.firstName, lastName: dto.lastName, phone },
        });
        await this.audit.record(
          {
            action: 'user.update_self',
            entity: 'User',
            entityId: userId,
            summary: 'Updated own profile',
            previous: `${user.firstName} ${user.lastName} · ${displayPhone(user.phone)}`,
            next: `${dto.firstName} ${dto.lastName} · ${displayPhone(phone)}`,
          },
          tx,
        );
      });
    return this.profile();
  }

  /** Reads a `data:image/png;base64,…` (or JPEG) upload, checking its type, bytes and size. */
  private parseImage(dataUrl: string) {
    const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) throw unprocessable('Use a JPG or PNG image.', 'AVATAR_TYPE');
    const kind = match[1] === 'png' ? 'png' : 'jpeg';
    const bytes = Buffer.from(match[2]!, 'base64');
    if (bytes.length > AVATAR_MAX_BYTES)
      throw unprocessable('The photo is larger than 2 MB.', 'AVATAR_TOO_LARGE');
    const { mime, magic } = IMAGE_TYPES[kind];
    if (bytes.length < magic.length || magic.some((b, i) => bytes[i] !== b))
      throw unprocessable('Use a JPG or PNG image.', 'AVATAR_TYPE');
    return { bytes, mime, ext: kind === 'png' ? 'png' : 'jpg' };
  }

  async setAvatar(dataUrl: string | null) {
    const userId = this.me();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { avatarFile: true },
    });
    const previous = user.avatarFile;

    if (dataUrl === null) {
      if (!previous) return this.profile();
    } else {
      const { bytes, mime, ext } = this.parseImage(dataUrl);
      const fileId = randomUUID();
      const storageKey = `platform/avatars/${userId}/${fileId}.${ext}`;
      await this.storage.upload(storageKey, bytes, mime);
      await this.prisma.$transaction(async (tx) => {
        await tx.storedFile.create({
          data: {
            id: fileId,
            storageKey,
            originalName: `avatar.${ext}`,
            mimeType: mime,
            sizeBytes: BigInt(bytes.length),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            uploadedById: userId,
          },
        });
        await tx.user.update({ where: { id: userId }, data: { avatarFileId: fileId } });
      });
    }
    if (previous) {
      await this.prisma.$transaction(async (tx) => {
        if (dataUrl === null)
          await tx.user.update({ where: { id: userId }, data: { avatarFileId: null } });
        await tx.storedFile.update({
          where: { id: previous.id },
          data: { deletedAt: this.clock.now() },
        });
      });
      await this.storage
        .remove(previous.storageKey)
        .catch((error: unknown) =>
          this.logger.warn({ msg: 'Old photo not removed', error: String(error) }),
        );
    }
    await this.audit.record({
      action: 'user.avatar',
      entity: 'User',
      entityId: userId,
      summary: dataUrl ? 'Updated profile photo' : 'Removed profile photo',
    });
    return this.profile();
  }

  /* ---------- Security settings (back office wide) ---------- */

  async security(): Promise<PlatformSecuritySettings> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SECURITY_KEY },
    });
    return readPlatformSecurity(row?.value);
  }

  async updateSecurity(dto: SecuritySettingsDto) {
    const current = await this.security();
    if (dto.ipRestriction === true && !current.ipRestriction)
      throw unprocessable(
        'Add approved IP ranges before turning this on. Managing IP ranges isn’t available yet.',
        'IP_RANGES_REQUIRED',
      );
    const next: PlatformSecuritySettings = {
      newDeviceAlerts: dto.newDeviceAlerts ?? current.newDeviceAlerts,
      ipRestriction: dto.ipRestriction ?? current.ipRestriction,
    };
    if (
      next.newDeviceAlerts === current.newDeviceAlerts &&
      next.ipRestriction === current.ipRestriction
    )
      return current;
    const describe = (s: PlatformSecuritySettings) =>
      `New-device alerts ${s.newDeviceAlerts ? 'on' : 'off'} · IP restriction ${s.ipRestriction ? 'on' : 'off'}`;
    const userId = this.me();
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: PLATFORM_SECURITY_KEY },
        create: { key: PLATFORM_SECURITY_KEY, value: { ...next }, updatedById: userId },
        update: { value: { ...next }, updatedById: userId },
      });
      await this.audit.record(
        {
          action: 'settings.security',
          entity: 'Settings',
          entityId: 'security',
          summary: 'Sign-in security settings changed',
          previous: describe(current),
          next: describe(next),
        },
        tx,
      );
    });
    return next;
  }
}
