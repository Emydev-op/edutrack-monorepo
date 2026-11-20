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

## Academics planning (Phase 3a)

`src/school/curriculum/` (`CurriculumModule`) serves Subjects & Curriculum, Teacher Assignments,
Timetable, Assessment & Grading and the read-only Attendance view under `/v1/academics/...`,
beside Phase 1's `AcademicsModule`. `AcademicCatalogService` (in `academics/`) is the shared
reader: current session and term, arms in display order, and what each level offers.

Rules worth knowing:

- **Everything is per session or term.** The curriculum, elective groups and assessment schemes
  belong to the current session; teaching assignments and timetables to a term (`?term=` picks
  one, otherwise the current term).
- **Subjects** with any history (results, assignments, earlier sessions, timetables) can't be
  deleted, only made inactive. Taking a subject out of a class clears this term's assignments and
  draft lessons for it; it's refused once that class has result sheets for it this session.
- **Timetables** are a manual grid. Grid keys are `"<Day>-P<n>"`, where `n` is the period's
  position in its section's bell schedule (`TimetablePeriod`, created from the default the first
  time a section needs one). Saving checks breaks, lesson counts, runs of one subject and teacher
  clashes against other classes' drafts by time. Publishing copies the `DRAFT` layer to
  `PUBLISHED`, which is what the portals read; a revision edits the draft while the published
  version stays live.
- **Assessment schemes** are per section; `SchoolSettings.sameSchemeForAllSections` writes one
  scheme to every section. Whether report cards show position is per section
  (`AssessmentScheme.showPosition`). Components and weights freeze once a section has published
  results (`lockedAt`).
- **Attendance** counts weekdays in the term, minus public holidays, mid-term breaks and calendar
  closures. Class teachers take the register in the Teacher Workspace.

## Parent Portal

`src/school/parent/` (`ParentModule`) serves `/v1/parent/*` for `@Portals('PARENT')` sessions on
the school's address: the frame (`overview`, `children`), a child's page, Home, fees with transfer
claims, results, timetable, attendance, announcements, the parent's profile and notification
channels. Homework and materials stay in `HomeworkModule` (`/v1/parent/children/:id/homework|
materials|assignments/:id/submission`); notifications use the school inbox (`/v1/notifications`).

Rules worth knowing:

- **Every child route goes through `ParentScopeService.child()`.** A child the parent may not see
  (another family, another school, a leaver past the two-year window) answers 404. Leavers are
  `read-only`: writes are refused (`READ_ONLY`) except reporting a payment for an old balance.
- **Paying is bank transfer plus proof.** `POST …/fees/claims` records a `PARENT_CLAIM` payment,
  `PENDING_VERIFICATION`, with the proof from `POST /v1/uploads`; the amount comes from the chosen
  option (`all`, `overdue`, `current`, `previous`), never from the client. It shows in Finance ›
  Payments for the bursar to verify. Guardians with `paysFees = false` see fees read-only
  (`NOT_FEE_PAYER`).
- **Report cards come from the published snapshot**, without classmates or hold details. A card
  held for unpaid fees just says to contact the school; another hold shows the school's reason.
- **Notification channels** are stored per category (`results`, `finance`, `assignments`,
  `register`, `announcements`) in `NotificationPreference`; `CommsDispatchService` skips a
  parent's switched-off channels.
- **Profile edits** change the guardian's phone (and the account's) and address only, with an
  audit event the school sees; the sign-in email is changed by the school.

Demo parent (password `Edutrack2026!`): `funke.adeyemi@gmail.com` at
`greenfield.localhost:5174/parent` (Emmanuel, JSS 2B; Michael, Primary 5B).
