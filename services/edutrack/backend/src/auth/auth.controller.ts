import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Client, CurrentUser } from '../common/decorators/request.decorators.js';
import { AppException } from '../common/errors/app.exception.js';
import { RateLimitService, type RateLimitRule } from '../common/rate-limit/rate-limit.service.js';
import type { AuthSession } from '../generated/prisma/client.js';
import { AccessTokenService } from './access-token.service.js';
import type { AuthUserContext, ClientInfo } from './auth-context.js';
import { AuthService, portalName, type SignedIn } from './auth.service.js';
import { Authenticated, Public } from './decorators/auth.decorators.js';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  ExpiredPasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  PortalDto,
  ResetPasswordDto,
  SwitchSchoolDto,
} from './dto/auth.dto.js';
import { bearerToken } from './guards/access-token.guard.js';
import { InvitationService } from './invitation.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { RefreshCookieService } from './refresh-cookie.service.js';
import { SessionService } from './session.service.js';

export const PORTAL_HEADER = 'x-edutrack-portal';

const rule = (name: string, limit: number, windowSeconds: number): RateLimitRule => ({
  name,
  limit,
  windowSeconds,
});
/** Per IP, and per IP + identifier. The account lockout is the per-account limit. */
export const RATE_LIMITS = {
  loginIp: rule('login:ip', 60, 300),
  loginId: rule('login:id', 20, 900),
  forgotIp: rule('forgot:ip', 20, 3600),
  forgotId: rule('forgot:id', 5, 3600),
  resetIp: rule('reset:ip', 20, 900),
  invitationIp: rule('invitation:ip', 30, 900),
  refreshIp: rule('refresh:ip', 120, 60),
  changeUser: rule('change-password:user', 10, 900),
} as const;

const portalHeader = ApiHeader({
  name: PORTAL_HEADER,
  required: false,
  description: 'Alternative to the `portal` body field: school_admin, teacher or platform.',
});
const refreshCookieDoc = ApiCookieAuth('refresh-cookie');

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordResetService,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly tokens: AccessTokenService,
    private readonly cookies: RefreshCookieService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private respond(res: Response, signedIn: SignedIn) {
    const { session } = signedIn;
    this.cookies.set(
      res,
      session.portal,
      signedIn.refreshToken,
      session.rememberMe ? this.sessions.remainingMs(session) : null,
    );
    return signedIn.body;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @portalHeader
  @ApiOperation({
    summary: 'Sign in with email or phone and password',
    description:
      'Returns a 15-minute access token in the body (keep it in memory) and sets the HttpOnly ' +
      'refresh cookie `et_rt_<portal>` (Path=/api/v1/auth, SameSite=Lax; persistent for 30 days ' +
      'with `remember`, a browser-session cookie otherwise). The Teacher Workspace signs in on ' +
      'its school subdomain. Response shape per portal: School Admin `{ accessToken, expiresIn, ' +
      'user, school, schools }`, Teacher `{ accessToken, expiresIn, user, school }`, back office ' +
      '`{ accessToken, expiresIn, user }`.',
  })
  @ApiOkResponse({ description: 'Signed in; refresh cookie set' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS (with attempts left)' })
  @ApiForbiddenResponse({
    description:
      'ACCOUNT_SUSPENDED · ACCOUNT_DEACTIVATED · ACCOUNT_PENDING · PASSWORD_EXPIRED · ' +
      'SCHOOL_SUSPENDED · NO_ACCESS',
  })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
  async login(
    @Body() dto: LoginDto,
    @Headers(PORTAL_HEADER) portalHeaderValue: string | undefined,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const identifier = dto.email ?? dto.identifier ?? '';
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.loginIp, subject: client.ip ?? 'unknown' },
      { rule: RATE_LIMITS.loginId, subject: `${client.ip}|${identifier}` },
    ]);
    const signedIn = await this.auth.login(dto, client, portalHeaderValue);
    return this.respond(res, signedIn);
  }

  @Public()
  @Post('password/expired')
  @HttpCode(200)
  @portalHeader
  @ApiOperation({
    summary: 'Replace an expired password and sign in',
    description:
      'After a PASSWORD_EXPIRED answer: checks `current`, sets `next`, ends other sessions.',
  })
  @ApiConflictResponse({ description: 'PASSWORD_NOT_EXPIRED' })
  @ApiUnprocessableEntityResponse({ description: 'Password policy (fields.next)' })
  async expiredPassword(
    @Body() dto: ExpiredPasswordDto,
    @Headers(PORTAL_HEADER) portalHeaderValue: string | undefined,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.loginIp, subject: client.ip ?? 'unknown' },
      { rule: RATE_LIMITS.loginId, subject: `${client.ip}|${dto.email}` },
    ]);
    const signedIn = await this.auth.signInWithExpiredPassword(dto, client, portalHeaderValue);
    return this.respond(res, signedIn);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @portalHeader
  @refreshCookieDoc
  @ApiOperation({
    summary: 'Swap the refresh cookie for a new access token',
    description:
      'Rotates the refresh token (new cookie every time) and answers like sign-in. Replaying an ' +
      'already-rotated token ends the session (SESSION_REUSED); two tabs refreshing at once get ' +
      'a retryable 409 REFRESH_CONFLICT.',
  })
  @ApiUnauthorizedResponse({ description: 'SESSION_ENDED · SESSION_REUSED · account blocks' })
  @ApiConflictResponse({ description: 'REFRESH_CONFLICT: retry once' })
  async refresh(
    @Body() dto: PortalDto,
    @Headers(PORTAL_HEADER) portalHeaderValue: string | undefined,
    @Req() req: Request,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.refreshIp, subject: client.ip ?? 'unknown' },
    ]);
    const portal = this.auth.resolvePortal(dto.portal ?? portalHeaderValue, client);
    const token = this.cookies.read(req, portal);
    if (!token)
      throw AppException.unauthorized('Your session has ended. Sign in again.', 'SESSION_ENDED');
    try {
      return this.respond(res, await this.auth.refresh(portal, token, client));
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 401)
        this.cookies.clear(res, portal);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @portalHeader
  @refreshCookieDoc
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Ends the session named by the access token (even an expired one) or the refresh cookie, ' +
      'clears the cookie, and with `allDevices` ends every session of the user. Always 200.',
  })
  @ApiOkResponse({ description: '{ ok: true, signedOut }' })
  async logout(
    @Body() dto: LogoutDto,
    @Headers(PORTAL_HEADER) portalHeaderValue: string | undefined,
    @Req() req: Request,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const portal = this.auth.resolvePortal(dto.portal ?? portalHeaderValue, client);
    let session: AuthSession | null = null;
    const bearer = bearerToken(req);
    if (bearer) {
      try {
        const claims = this.tokens.verify(bearer, { ignoreExpiration: true });
        session = await this.sessionById(claims.sessionId, claims.sub);
      } catch {
        session = null;
      }
    }
    const cookie = this.cookies.read(req, portal);
    if (!session && cookie) session = await this.sessions.findByRefreshToken(cookie);
    this.cookies.clear(res, portal);
    return this.auth.logout(session, dto.allDevices ?? false);
  }

  private async sessionById(id: string, userId: string) {
    const list = await this.sessions.listActive(userId);
    return list.find((s) => s.id === id) ?? null;
  }

  @Get('me')
  @Authenticated()
  @ApiOperation({
    summary: 'The signed-in user, their school, membership, roles and permissions',
    description:
      'Back office: the AuthUser fields plus `permissions` (e.g. "Schools.View"). School ' +
      'portals: `{ portal, user, school, schools?, membership: { id, kind, scope, branchIds, ' +
      'roles, permissions } }` with permissions like "students.view".',
  })
  me(@CurrentUser() user: AuthUserContext) {
    return this.auth.me(user);
  }

  @Post('switch-school')
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({
    summary: 'School Admin: open another of your schools',
    description: 'Moves this session to the school and returns a new access token (sign-in shape).',
  })
  @ApiForbiddenResponse({
    description: 'NO_ACCESS · account blocks for that school · WRONG_PORTAL',
  })
  switchSchool(@CurrentUser() user: AuthUserContext, @Body() dto: SwitchSchoolDto) {
    return this.auth.switchSchool(user, dto.schoolId);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  @portalHeader
  @ApiOperation({
    summary: 'Email a password reset link',
    description:
      'Always answers `{ ok: true }`, whether or not the email is registered. The link opens the ' +
      'portal the request came from and expires after PASSWORD_RESET_TTL_MINUTES.',
  })
  @ApiOkResponse({ description: '{ ok: true }' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers(PORTAL_HEADER) portalHeaderValue: string | undefined,
    @Client() client: ClientInfo,
  ) {
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.forgotIp, subject: client.ip ?? 'unknown' },
      { rule: RATE_LIMITS.forgotId, subject: `${client.ip}|${dto.email}` },
    ]);
    const portal = this.auth.resolvePortal(dto.portal ?? portalHeaderValue, client);
    this.auth.hostSchoolFor(portal, client);
    this.passwords.parseOrThrow(dto.email);
    // Answer at once and do the work after: the response time is the same for any email.
    this.passwords
      .requestReset(dto.email, portal, client)
      .catch((error: unknown) =>
        this.logger.error({ msg: 'Password reset request failed', error: String(error) }),
      );
    return { ok: true };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set a new password with a reset link',
    description: 'Single use. Ends every session of the user and clears any sign-in pause.',
  })
  @ApiBadRequestResponse({ description: 'RESET_INVALID (unknown or already used)' })
  @ApiGoneResponse({ description: 'RESET_EXPIRED' })
  @ApiUnprocessableEntityResponse({ description: 'Password policy (fields.password)' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Client() client: ClientInfo) {
    await this.rateLimit.consume([{ rule: RATE_LIMITS.resetIp, subject: client.ip ?? 'unknown' }]);
    await this.passwords.reset(dto);
    return { ok: true };
  }

  @Post('password/change')
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({
    summary: 'Change your password',
    description: 'Keeps this session and ends the others. Answers `{ signedOut }`.',
  })
  @ApiUnprocessableEntityResponse({ description: 'fields.current or fields.next' })
  async changePassword(@CurrentUser() user: AuthUserContext, @Body() dto: ChangePasswordDto) {
    await this.rateLimit.consume([{ rule: RATE_LIMITS.changeUser, subject: user.userId }]);
    return this.passwords.change(user, dto);
  }

  @Get('sessions')
  @Authenticated()
  @ApiOperation({
    summary: 'Your signed-in devices',
    description:
      'Every live session of the account (all portals), current first: `{ id, device, location, ' +
      'signedInAt, lastActive, current, portal }` with ISO date-times.',
  })
  async listSessions(@CurrentUser() user: AuthUserContext) {
    const sessions = await this.sessions.listActive(user.userId);
    return sessions
      .map((s) => ({
        id: s.id,
        device: s.deviceLabel ?? 'Unknown device',
        location: s.location ?? 'Unknown location',
        signedInAt: s.createdAt.toISOString(),
        lastActive: s.lastSeenAt.toISOString(),
        current: s.id === user.sessionId,
        portal: portalName(s.portal),
      }))
      .sort(
        (a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive),
      );
  }

  @Delete('sessions/:id')
  @Authenticated()
  @ApiOperation({ summary: 'Sign out one of your other devices' })
  @ApiNotFoundResponse({ description: 'Not your session, or already ended' })
  @ApiConflictResponse({ description: 'CURRENT_SESSION: use sign out instead' })
  async revokeSession(
    @CurrentUser() user: AuthUserContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => AppException.notFound('That device is already signed out.'),
      }),
    )
    id: string,
  ) {
    if (id === user.sessionId)
      throw AppException.conflict(
        'This is the device you’re using. Sign out from the account menu instead.',
        'CURRENT_SESSION',
      );
    const session = await this.sessionById(id, user.userId);
    if (!session) throw AppException.notFound('That device is already signed out.');
    await this.sessions.revoke(session.id, 'signed_out_elsewhere');
    return { ok: true };
  }

  @Post('sessions/sign-out-others')
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: 'Sign out every other device', description: 'Answers `{ signedOut }`.' })
  async signOutOthers(@CurrentUser() user: AuthUserContext) {
    const signedOut = await this.sessions.revokeAllForUser(
      user.userId,
      'signed_out_elsewhere',
      user.sessionId,
    );
    return { signedOut };
  }

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'Look up an invitation for the accept page' })
  @ApiNotFoundResponse({ description: 'INVITATION_INVALID' })
  @ApiGoneResponse({ description: 'INVITATION_EXPIRED · INVITATION_REVOKED' })
  async invitation(@Param('token') token: string, @Client() client: ClientInfo) {
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.invitationIp, subject: client.ip ?? 'unknown' },
    ]);
    return this.invitations.lookup(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Accept an invitation',
    description:
      'Sets the password (or, for someone who already has an account, confirms it), activates ' +
      'the membership or platform-staff access. Answers `{ email, name }`; then sign in.',
  })
  @ApiConflictResponse({ description: 'INVITATION_USED' })
  @ApiGoneResponse({ description: 'INVITATION_EXPIRED · INVITATION_REVOKED' })
  @ApiUnprocessableEntityResponse({ description: 'fields.password · fields.phone · names' })
  async acceptInvitation(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Client() client: ClientInfo,
  ) {
    await this.rateLimit.consume([
      { rule: RATE_LIMITS.invitationIp, subject: client.ip ?? 'unknown' },
    ]);
    return this.invitations.accept(token, dto);
  }
}
