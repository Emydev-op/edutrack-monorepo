import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { Clock, DAY, HOUR } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import type { AuthSession, Portal, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { deviceLabel, randomToken, sha256 } from './tokens.js';

export type RevokeReason =
  | 'sign_out'
  | 'sign_out_all'
  | 'signed_out_elsewhere'
  | 'password_changed'
  | 'password_reset'
  | 'reuse_detected'
  | 'access_lost'
  | 'school_suspended'
  | 'admin';

/** The session facts the auth guard needs on every request (cached briefly in Redis). */
export interface SessionSnapshot {
  id: string;
  userId: string;
  portal: Portal;
  schoolId: string | null;
  supportSessionId: string | null;
  revoked: boolean;
  expiresAt: number;
}

export interface NewSession {
  userId: string;
  portal: Portal;
  schoolId: string | null;
  rememberMe: boolean;
  ip?: string;
  userAgent?: string;
}

const CACHE_SECONDS = 30;
const cacheKey = (id: string) => `auth:session:${id}`;
const seenKey = (id: string) => `auth:seen:${id}`;
const rotatedKey = (hash: string) => `auth:rotated:${hash}`;

/**
 * Sign-in sessions and their rotating refresh tokens. Only SHA-256 hashes are stored; the token
 * itself exists in the cookie alone. Every refresh rotates the token; presenting a rotated token
 * again (outside a short grace window for parallel tabs) is treated as theft and ends the session.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly rememberMs: number;
  private readonly sessionMs: number;
  private readonly graceMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.rememberMs = config.get('REFRESH_TTL_REMEMBER_DAYS', { infer: true }) * DAY;
    this.sessionMs = config.get('REFRESH_TTL_SESSION_HOURS', { infer: true }) * HOUR;
    this.graceMs = config.get('REFRESH_REUSE_GRACE_SECONDS', { infer: true }) * 1000;
  }

  async create(input: NewSession): Promise<{ session: AuthSession; refreshToken: string }> {
    const refreshToken = randomToken();
    const now = this.clock.now();
    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        portal: input.portal,
        schoolId: input.schoolId,
        refreshTokenHash: sha256(refreshToken),
        rememberMe: input.rememberMe,
        deviceLabel: deviceLabel(input.userAgent),
        userAgent: input.userAgent?.slice(0, 512),
        ip: input.ip ?? null,
        lastSeenAt: now,
        // Absolute lifetime from sign-in: 30 days with "keep me signed in", a working day without.
        expiresAt: new Date(now.getTime() + (input.rememberMe ? this.rememberMs : this.sessionMs)),
      },
    });
    return { session, refreshToken };
  }

  /**
   * Swaps a refresh token for a new one. Throws 401 when the token is unknown, expired or its
   * session ended, and revokes the session when a rotated token is replayed.
   */
  async rotate(
    refreshToken: string,
    portal: Portal,
    expect: { schoolId?: string } = {},
  ): Promise<{ session: AuthSession; refreshToken: string }> {
    const hash = sha256(refreshToken);
    const now = this.clock.now();
    const session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: hash } });

    if (!session) {
      await this.handleUnknownToken(hash, now);
      throw ended();
    }
    if (session.portal !== portal) throw ended();
    // A school-subdomain session only refreshes on its own school's subdomain.
    if (expect.schoolId !== undefined && session.schoolId !== expect.schoolId) throw ended();
    if (session.revokedAt || session.expiresAt <= now) throw ended();

    const next = randomToken();
    // Compare-and-swap on the current hash: of two parallel refreshes, exactly one wins.
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: sha256(next), previousRefreshTokenHash: hash, lastSeenAt: now },
    });
    if (count !== 1) throw raced();
    // Remember when this token stopped being current (clock time, for the parallel-tab grace).
    await this.redis
      .set(rotatedKey(hash), String(now.getTime()), 'EX', Math.max(60, this.graceMs / 1000))
      .catch(() => undefined);
    const updated = await this.prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
    await this.uncache(session.id);
    return { session: updated, refreshToken: next };
  }

  /** A token that is not current: either a parallel-tab race (grace) or a replayed stolen token. */
  private async handleUnknownToken(hash: string, now: Date) {
    const previous = await this.prisma.authSession.findFirst({
      where: { previousRefreshTokenHash: hash },
    });
    if (!previous || previous.revokedAt) return;
    const rotatedAt = Number(await this.redis.get(rotatedKey(hash)).catch(() => null));
    if (rotatedAt && now.getTime() - rotatedAt <= this.graceMs) throw raced();
    this.logger.warn({
      msg: 'Refresh token reuse detected; session revoked',
      sessionId: previous.id,
      userId: previous.userId,
    });
    await this.revoke(previous.id, 'reuse_detected');
    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      'For your security this session was ended. Sign in again.',
      'SESSION_REUSED',
    );
  }

  async findByRefreshToken(refreshToken: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
  }

  async revoke(sessionId: string, reason: RevokeReason): Promise<boolean> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedReason: reason },
    });
    await this.uncache(sessionId);
    return count > 0;
  }

  /** Ends every live session of a user (optionally keeping one); returns how many ended. */
  async revokeAllForUser(userId: string, reason: RevokeReason, keepSessionId?: string) {
    return this.revokeWhere(
      { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
      reason,
    );
  }

  /** Ends every live session opened on a school (e.g. when the school is suspended). */
  async revokeAllForSchool(schoolId: string, reason: RevokeReason) {
    return this.revokeWhere({ schoolId }, reason);
  }

  private async revokeWhere(where: Prisma.AuthSessionWhereInput, reason: RevokeReason) {
    const now = this.clock.now();
    const live = await this.prisma.authSession.findMany({
      where: { ...where, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (live.length === 0) return 0;
    const ids = live.map((s) => s.id);
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: { in: ids }, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    await Promise.all(ids.map((id) => this.uncache(id)));
    return count;
  }

  /** Live sessions of a user, newest activity first. */
  listActive(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /** Moves a School Admin session to another school (after the membership was checked). */
  async switchSchool(sessionId: string, schoolId: string) {
    await this.prisma.authSession.update({ where: { id: sessionId }, data: { schoolId } });
    await this.uncache(sessionId);
  }

  /** The guard's view of a session, from Redis when fresh. */
  async snapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const cached = await this.redis.get(cacheKey(sessionId)).catch(() => null);
    if (cached) return JSON.parse(cached) as SessionSnapshot;
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    const snapshot: SessionSnapshot = {
      id: session.id,
      userId: session.userId,
      portal: session.portal,
      schoolId: session.schoolId,
      supportSessionId: session.supportSessionId,
      revoked: Boolean(session.revokedAt),
      expiresAt: session.expiresAt.getTime(),
    };
    await this.redis
      .set(cacheKey(sessionId), JSON.stringify(snapshot), 'EX', CACHE_SECONDS)
      .catch(() => undefined);
    return snapshot;
  }

  /** Records activity for the devices list, at most once a minute per session. */
  async touch(sessionId: string) {
    const first = await this.redis.set(seenKey(sessionId), '1', 'EX', 60, 'NX').catch(() => null);
    if (first !== 'OK') return;
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastSeenAt: this.clock.now() },
    });
  }

  /** Remaining lifetime of a session, for the cookie's Max-Age. */
  remainingMs(session: Pick<AuthSession, 'expiresAt'>) {
    return Math.max(0, session.expiresAt.getTime() - this.clock.nowMs());
  }

  private async uncache(sessionId: string) {
    await this.redis.del(cacheKey(sessionId)).catch(() => undefined);
  }
}

const ended = () =>
  AppException.unauthorized('Your session has ended. Sign in again.', 'SESSION_ENDED');

/** Lost a refresh race to another tab: the browser already holds the new cookie, so retry once. */
const raced = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'Your session was refreshed in another tab. Try again.',
    'REFRESH_CONFLICT',
  );
