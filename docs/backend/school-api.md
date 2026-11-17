# School API

What School Admin (`admin.edutrack.ng`) and the school portals (`<slug>.edutrack.ng/teacher`,
`/parent`, `/student`) call. It follows [conventions.md](conventions.md); this page adds what is
specific to the school side.

## Addresses and tenancy

| Portal                   | Address                       | The school comes from                        |
| ------------------------ | ----------------------------- | -------------------------------------------- |
| Back office              | `console.edutrack.ng`         | — (platform-wide)                            |
| School Admin             | `admin.edutrack.ng`           | the access token (chosen at sign-in)         |
| Teacher, Parent, Student | `<slug>.edutrack.ng/<portal>` | the `Host` header, checked against the token |

Locally the base domain is `localhost`: run `npm run infra:up` and open `http://console.localhost`,
`http://admin.localhost` or `http://greenfield.localhost/teacher` (see
`infrastructure/docker/nginx/gateway.dev.conf`). From curl or Postman send `Host: greenfield.localhost`
(or, outside production, `x-tenant-id: greenfield`).

`GET /api/v1/public/school` answers the school at the address (name, initials, motto, colour,
logo, `available`) for the entry page and the sign-in pages. Public details only.

## Building a school module

Code lives in `src/school/<area>/` (`<area>.module.ts`, controller, service, `dto/`), imported by
`src/school/school.module.ts`.

- **The contract is the School Admin mock.** Paths, methods, bodies, answers and error messages
  match `services/edutrack/school-admin/src/api/mock/handlers/<area>.ts` and the types in
  `school-admin/src/types`, so the screens work unchanged when the route moves to the real API.
  Every route still answers in the envelope (`{ success, message, data }`).
- **Access.** `@Portals('SCHOOL_ADMIN')` on the controller (plus `'TEACHER'` where the Teacher
  Workspace calls it) and `@RequirePermission(...)` on each route, using the permissions in
  `src/auth/permissions/school-permissions.ts` (`settings.profile`, `settings.branches`,
  `settings.users`, `settings.roles`, `academics.view`, `academics.configure`, …). Reads need the
  matching view/manage permission too: a Bursar can't read Users & Roles.
- **Data.** Only `TenantPrismaService` (`this.tenant.db`): every query is limited to the signed-in
  school, writes to another school's rows throw, and platform support sessions are read-only.
  Multi-step writes run in `this.tenant.db.$transaction(...)`.
- **History.** Every write records `SchoolAuditService.record(...)` (pass the transaction client
  inside a transaction). Record timelines read `SchoolAuditService.history(entity, id)`.
- **Validation.** class-validator DTOs with messages written for people ("Enter the branch
  address."), `whitelist` strips unknown fields. Business rules throw `AppException` with a stable
  code (`BRANCH_NAME_TAKEN`). Images arrive as data URLs and are checked by their bytes (JPG/PNG,
  size limit), as `platform/account` does for avatars, then stored with `StorageService` under
  `schools/<schoolId>/…` with a `StoredFile` row.
- **Swagger.** `@ApiTags('school · <area>')`, `@ApiOperation`, `@ApiOkResponse({ type })` with a
  response class (`dto/<area>.responses.ts`, `@ApiProperty` with examples), and the error codes on
  `@ApiConflictResponse` / `@ApiNotFoundResponse` / … The envelope and the common errors are added
  automatically (`src/common/http/openapi.ts`).
- **Seed.** Demo data mirrors the mock: Greenfield Academy is fully set up, Crestview College is
  new (onboarding). Add a `prisma/seed/school-<area>-data.ts` called from `seedDemoData`, idempotent.
- **Tests.** `test/school-<area>.e2e-spec.ts`: the happy paths, validation, permissions, and that
  one school can never read or change another's records (sign in as Crestview's admin and try).

## Moving a School Admin screen to the real API

Add its routes to `school-admin/src/api/real-routes.ts`. With `VITE_USE_MOCKS=false` those go to
the backend and every other route is still answered by the mock until its phase is built. Switch
the screen's success toasts to the API's message: `toast.success(messageOf(result, 'Saved.'))`.

Demo sign-ins (password `Edutrack2026!`): Greenfield `adaeze.okonkwo@greenfield.edu.ng` (School Admin, Principal),
Crestview `e.udo@crestviewcollege.ng` (School Admin, Principal). The seed has more Greenfield staff
with narrower roles (bursar, teachers) for permission tests.
