# Backend conventions

How the EduTrack API (`services/edutrack/backend`) is put together, and the rules every module follows. Read with [`data-model.md`](data-model.md).

## Layout

| Path                 | What lives there                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/main.ts`        | Bootstrap: logger, Swagger at `/docs`, listen.                                                        |
| `src/app.setup.ts`   | HTTP setup shared with the e2e tests: trust proxy, helmet, cookies, CORS, `/api`, URI versioning.     |
| `src/common/`        | Request context, errors and the exception filter, validation pipe, pagination, decorators, clock.     |
| `src/tenancy/`       | Tenant resolution from the Host, the tenant-scoped Prisma client.                                     |
| `src/auth/`          | Sign-in, sessions, tokens, passwords, invitations, guards, permission decorators.                     |
| `src/notifications/` | Email and SMS through a BullMQ queue; templates.                                                      |
| `src/<feature>/`     | One folder per feature module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `*.spec.ts`. |
| `prisma/seed.ts`     | Demo data (`npm run db:seed`), see Seed below.                                                        |
| `test/*.e2e-spec.ts` | End-to-end tests against a real database.                                                             |

Every route is under `/api/v1/...` (global prefix `api`, URI versioning with default version 1). Health is version-neutral: `/api/health`, `/api/health/live`.

## Errors

Every error response has one shape, produced by `AllExceptionsFilter`:

```json
{
  "statusCode": 422,
  "message": "Enter a mobile number, like 0803 412 7781.",
  "code": "VALIDATION",
  "error": "VALIDATION",
  "fields": { "guardians.0.phone": "Enter a mobile number, like 0803 412 7781." },
  "requestId": "4c1f…"
}
```

- `message` is written for the person using the portal; `getApiErrorMessage()` in `@edutrack/web-core` shows it as is.
- `code` is stable and machine-readable. `error` repeats it because the portals' sign-in screens (and the mock API) read the code from `error`.
- `fields` only on 422s, keyed by property path.
- `requestId` matches the `X-Request-Id` response header and the log lines of that request.

Throw `AppException` with a status, message and code: `AppException.notFound('That student doesn’t exist.')`, `AppException.conflict('…', 'TERM_LOCKED')`, `AppException.validation({ name: 'Enter a name.' })`. Nest's own `HttpException`s get a default code from their status.

| Source                                       | Answer                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| DTO validation (global `ValidationPipe`)     | 422 `VALIDATION`, `fields` by path; unknown properties too     |
| Prisma P2002 (unique)                        | 409 `DUPLICATE`, "A record with the same code already exists." |
| Prisma P2003 / P2014 (foreign key, Restrict) | 409 `REFERENCE_CONFLICT`                                       |
| Prisma P2025 / P2001 (not found)             | 404 `NOT_FOUND`                                                |
| `TenantMismatchError`                        | 403 `TENANT_MISMATCH`                                          |
| `TenantContextError`, anything unknown       | 500 `INTERNAL_ERROR`, generic message, logged with the stack   |
| Rate limit                                   | 429 `RATE_LIMITED` with `Retry-After`                          |

## Validation and DTOs

- The global pipe uses `whitelist` + `forbidNonWhitelisted` + `transform`: payloads become DTO instances, unknown properties are a 422.
- `stopAtFirstError` is on and decorators apply bottom-up, so put the friendly check closest to the property: `@MaxLength(…)`, `@IsString()`, then `@IsNotEmpty({ message: 'Enter a name.' })` last.
- Write messages the way the portals do ("Enter your first and last name."), not class-validator's defaults.

## Pagination

List endpoints take `PaginationQueryDto` (`page` ≥ 1, `pageSize` 10/20/50, optional `search`) and answer `{ data, meta: { page, pageSize, total, totalPages } }`, the same envelope as the portals' mock `paginate()` and `Paginated<T>` in `@edutrack/shared`.

```ts
@Get()
@RequirePermission('students.view')
async list(@Query() query: StudentListQuery) {
  const where = { status: query.status };
  const [rows, total] = await Promise.all([
    this.tenant.db.student.findMany({ where, ...toSkipTake(query), orderBy: { lastName: 'asc' } }),
    this.tenant.db.student.count({ where }),
  ]);
  return paginated(rows.map(toView), total, query);
}
```

## Request context

`RequestContext` (`src/common/context/request-context.ts`) is an `AsyncLocalStorage` holding, for the current request or job:

| Field                                                                           | Set by                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `requestId`, `ip`, `userAgent`                                                  | `RequestContextMiddleware`                                         |
| `hostSchool`                                                                    | `TenantHostMiddleware` (Host subdomain, custom domain, dev header) |
| `userId`, `sessionId`, `portal`, `schoolId`, `membershipId`, `supportSessionId` | `AccessTokenGuard`                                                 |

Read it with `RequestContext.get()` / `RequestContext.schoolId()`, or in controllers with `@CurrentUser()` (`{ userId, sessionId, portal, schoolId?, membershipId?, supportSessionId? }`) and `@CurrentTenant()` (the school id, 403 without one). Jobs and scripts set it themselves:

```ts
await RequestContext.forSchool(schoolId, () =>
  this.tenant.db.invoice.findMany({ where: { status: 'ISSUED' } }),
);
```

Prisma queries are lazy (they run when awaited); `forSchool`/`run` start a returned query inside the context, so returning it is safe. Don't create a query inside the callback and await it later outside.

## Tenant isolation

Layer 2 of the plan in `data-model.md`: a Prisma client extension (`src/tenancy/tenant-scope.ts`).

- **Feature modules use `TenantPrismaService.db`.** For every model with a `schoolId` column (found from Prisma's generated field enums, so new models are covered automatically) it:
  - adds `AND: [{ schoolId }]` to reads, counts, aggregates, updates and deletes, including `findUnique`/`update`/`delete` by id;
  - sets `schoolId` on creates (`create`, `createMany`, `createManyAndReturn`, `upsert`) when it is missing and throws `TenantMismatchError` when a different one is given. Prisma's input types still require it, so pass the tenant explicitly (`data: { schoolId, ... }` with `schoolId` from `@CurrentTenant()`); the extension is the safety net, not a convenience;
  - throws `TenantMismatchError` when a where clause names another school (directly or in a compound key such as `schoolId_id`) or an update tries to change `schoolId`;
  - throws `TenantContextError` when there is no tenant in the context;
  - refuses writes while a read-only platform support session is acting.
- **`PrismaService` is the unscoped client.** Only platform-staff code, auth bootstrap (sign-in has to find users and memberships before a tenant exists), health checks and the seed use it.
- Not rewritten: nested writes and `include`s. They stay inside the tenant because every school-owned relation is a composite `(school_id, x_id)` foreign key: a nested `roles: { create: { roleId } }` takes `school_id` from its parent, and an include can only reach the same school's rows. Raw SQL (`$queryRaw`) is never scoped: always filter `school_id` yourself.
- Models with a nullable `schoolId` (`AuthSession`, `Invitation`, `StoredFile`, `AuditEvent`, `Notification`, `NotificationPreference`) are scoped too; platform rows (null school) are only reachable through `PrismaService`.
- Partial unique keys (e.g. one live TERM_FEES invoice per student × term) appear in `WhereUniqueInput` but are only unique among live rows: query them with `findFirst` and a status filter.

The e2e suite (`test/tenancy.e2e-spec.ts`) proves a query in school A's context can't read, update, delete or create school B's rows.

## Tenant resolution

| Portal                       | Where the school comes from                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher / Parent / Student   | The Host subdomain: `greenfield.edutrack.ng` → `School.slug = greenfield` (or a verified `customDomain`). Sign-in, refresh and every request must be on that school's host; a token for another school answers 403 `TENANT_MISMATCH`. |
| School Admin (shared portal) | The session's chosen school (`AuthSession.schoolId`), picked at sign-in or with `POST /auth/switch-school`.                                                                                                                           |
| Platform back office         | No school. Back-office routes use `@PlatformOnly()` and `PrismaService`.                                                                                                                                                              |

`APP_BASE_DOMAIN` sets the base domain (`edutrack.ng` deployed, `localhost` locally, so `http://greenfield.localhost:5172` works without DNS changes). Reserved subdomains (`www`, `api`, `admin`, `backoffice`…) are never schools; the same list must be blocked when provisioning slugs. Outside production only, the `x-tenant-id` header (`TENANT_HEADER` in `@edutrack/shared`) or `x-school-slug`, holding a slug or school id, is accepted when the Host names no school. In production those headers are ignored.

## Authentication

- **Access token**: HS256 JWT, 15 minutes (`JWT_ACCESS_TTL_SECONDS`), claims `sub` (user), `sessionId`, `portal`, `schoolId?`, `membershipId?`. Sent in the JSON body; the portal keeps it in memory and sends `Authorization: Bearer`. On every request the guard also checks the session behind it is live (cached in Redis for 30 s, dropped on revoke, so sign-out is immediate).
- **Refresh token**: 256 random bits in an HttpOnly, SameSite=Lax cookie named `et_rt_<portal>` (`et_rt_school_admin`, `et_rt_teacher`, `et_rt_platform`), `Path=/api/v1/auth`, `Secure` except local HTTP. Only its SHA-256 is stored. It rotates on every refresh; replaying a rotated token ends the session (`SESSION_REUSED`), except within `REFRESH_REUSE_GRACE_SECONDS` of the rotation, when the parallel tab gets a retryable 409 `REFRESH_CONFLICT` (the browser already holds the new cookie).
- **Remember me**: a persistent 30-day cookie and session (`REFRESH_TTL_REMEMBER_DAYS`); without it a browser-session cookie and a 12-hour server limit (`REFRESH_TTL_SESSION_HOURS`). Both are absolute from sign-in.
- **Passwords**: argon2id (19 MiB, t=2), policy identical to the portals (10+ characters, upper, lower, number, symbol). Lockout per user from the school's sign-in rules (`SchoolSettings.lockoutAttempts/lockoutMinutes`, default 5 → 15 min; the strictest of the user's schools when the school isn't known yet), `PLATFORM_LOCKOUT_*` for platform staff. Unknown emails get the same messages, countdown and timing. Expiry from `SchoolSettings.passwordExpiryDays` (0 = never) or `User.mustChangePassword`.
- **Portal**: the body field `portal` or the `X-EduTrack-Portal` header (`school_admin`, `teacher`, `platform`); without either, `teacher` on a school host and `school_admin` elsewhere. The back office must send `platform`.
- **Who may use which portal**: School Admin needs an ACTIVE staff membership with at least one role other than `teacher`/`hod`; the Teacher Workspace needs `teacher`, `hod` or `academic_head` at the host school; the back office needs ACTIVE `PlatformStaff`.

### Protecting routes

Every route requires a valid access token unless marked `@Public()`.

```ts
@Controller('students')
export class StudentsController {
  @Get()
  @RequirePermission('students.view')            // the membership's roles must grant it
  list() { … }

  @Post(':id/promote')
  @RequirePermission('students.view', 'students.promote')   // all of them
  promote() { … }
}

@Controller('platform/schools')
export class PlatformSchoolsController {
  @Get()
  @PlatformOnly('Schools.View')                 // active platform staff whose role grants it
  list() { … }
}

@Portals('SCHOOL_ADMIN')                        // restrict a route to some portals
```

School permissions are `module.action` strings from the role editor (`students.view`, `results.publish`, `settings.users`…, typed as `SchoolPermission`); platform permissions are `Area.Action` (`Schools.View`, `Support.Manage`). Both are read from the database on every request, so role changes apply at once. `@RequirePermission` also guarantees a school session, so the tenant is set inside the handler.

## Rate limits

`RateLimitService.consume([{ rule, subject }])` counts in Redis (fixed windows, subjects hashed) and throws 429 with `Retry-After`. Sign-in, forgot and reset password, invitation lookups and refresh are limited per IP and per IP + identifier; the account lockout is the per-account limit. `TRUST_PROXY` must name the load balancer so `req.ip` is the client.

## Notifications

`NotificationsService.email(to, template, data)` / `.sms(...)` enqueue a BullMQ job (`notifications` queue, 6 attempts, exponential backoff). Request handlers never send synchronously. Templates live in `src/notifications/templates/templates.ts` (text + escaped HTML; SMS text). Email goes through SMTP (Mailpit locally: inbox at http://localhost:8025); SMS through an `SmsDriver` (`log` now, Termii later). Jobs carry links with tokens, so completed jobs are removed at once and failed ones after a day.

## Logging

Nest's `ConsoleLogger`, JSON lines in production (`LOG_JSON`). Log objects, not sentences: `this.logger.warn({ msg: 'Refresh token reuse detected', sessionId })`. Every request logs one line with `requestId`, method, path (query string dropped, invitation tokens masked), status, duration, `userId`, `schoolId` and `portal`. Never log passwords, tokens, cookies or full phone numbers.

## Time

Inject `Clock` instead of calling `new Date()` wherever expiry or windows matter (tokens, lockouts, invitations, resets). Tests replace it with `FixedClock` and move time.

## Configuration

All environment variables are declared and validated in `src/config/env.validation.ts` (class-validator) with safe local defaults, and documented in `.env.example`. Production refuses to boot with the development JWT secret, `COOKIE_SECURE=false`, `APP_BASE_DOMAIN=localhost` or localhost portal URLs.

## Tests

| Command            | What                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`         | Unit tests (`src/**/*.spec.ts`), no services needed. This is what CI's verify job runs.                                                                                                                                                                                                        |
| `npm run test:e2e` | E2E tests (`test/**/*.e2e-spec.ts`) against Postgres and Redis. The setup creates the `edutrack_test` database, applies migrations, seeds it and uses Redis database 15, so your dev data is untouched. Needs `npm run infra:up`. CI runs it in the `backend e2e` job with service containers. |

E2E helpers live in `test/support/test-app.ts`: `createTestApp()` boots the real `AppModule` with a `FixedClock` and a fake `NotificationsService` that captures messages (follow reset and invitation links from it), `reseed()` restores the demo data, and `login()/signIn()/authed()` wrap the auth calls. Each request gets its own `X-Forwarded-For`, so rate limits don't collide. `TEST_LOGS=1` shows Nest logs.

## Seed

`npm run db:seed` (in the backend or at the repo root) is idempotent and refuses `NODE_ENV=production`. It loads platform roles and staff, the Starter and Growth plans, Greenfield Academy (`greenfield`, Main and Lekki campuses, four departments) and Crestview College (`crestview`, new), the predefined roles per school, and the portals' demo accounts. Every password is `Edutrack2026!`. Demo invitation links: `GFA-INV-7Q2K` (teacher, pending), `expired`, `used`, `GFA-INV-LAWAL` (School Admin), `PLT-INV-DAYO` (back office), `PLT-INV-CHIKA` (expired).

## Reaching the API from a portal (development)

Portals call the API same-site under `/api`, so the refresh cookie is first-party and CORS isn't involved. When a portal switches its mocks off, add a Vite dev proxy:

```ts
// vite.config.ts
server: {
  port: 5171,
  proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
},
```

- Keep `changeOrigin: false` so the API sees the portal's Host. For the Teacher Workspace open `http://greenfield.localhost:5172` and the Host names the school; on plain `localhost` the portal sends `x-tenant-id: greenfield` (already wired through `createHttpClient({ getTenantId })`).
- Send credentials (`withCredentials: true` on the axios client) so the browser stores and sends the refresh cookie; call `POST /api/v1/auth/refresh` on load and when a request answers 401 `TOKEN_EXPIRED`, retrying once on 409 `REFRESH_CONFLICT`.
- Set the portal once on the client (`X-EduTrack-Portal: platform` for the back office).
- Deployed, the same `/api` path is routed to the API by the load balancer on every portal host.
