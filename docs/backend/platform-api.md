# Platform back office API

Everything the back office (`services/edutrack/platform-backoffice`) calls lives under `/api/v1/platform/…`, apart from sign-in (`/api/v1/auth/…`). The prefix keeps back-office routes apart from School Admin routes with the same names (`/dashboard`, `/users`, `/settings`, `/support`…). Code lives in `services/edutrack/backend/src/platform/`. Read with [`conventions.md`](conventions.md).

Response shapes match the back office's types in `platform-backoffice/src/types/` exactly. The in-browser mock (`src/api/mock`) answers the same paths, so the portal runs with or without the backend (`VITE_USE_MOCKS`).

## Status

| Area                                                           | Endpoints                                             | Status  |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------- |
| Schools, provisioning, administrators, usage, billing, history | `platform/schools…`                                   | Live    |
| Subscriptions and subscription actions                         | `platform/subscriptions`, `schools/:id/subscription…` | Live    |
| Plans                                                          | `platform/plans…`                                     | Live    |
| Dashboard                                                      | `platform/dashboard/…`, `platform/activity/recent`    | Live    |
| Users and roles                                                | `platform/users…`, `platform/roles…`                  | Live    |
| Activity feed and audit log                                    | `platform/activity`, `platform/audit…`                | Live    |
| Profile and photo, notification preferences, security settings | `platform/me/…`, `platform/settings/…`                | Live    |
| Notifications and search                                       | `platform/notifications…`, `platform/search`          | Live    |
| Support desk and support sessions from tickets                 | —                                                     | Next PR |

## Permissions

Each route uses `@PlatformOnly('Area.Action')` against the signed-in staff member's role (see `src/auth/permissions/platform-permissions.ts`). The back office shows every button; the API decides.

| Action                                                  | Needs                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| View schools, administrators, usage, activity           | `Schools.View`                                                    |
| Provision a school                                      | `Schools.Create`                                                  |
| Edit a school, invite or re-invite administrators       | `Schools.Edit`                                                    |
| Suspend or reactivate a school (one or many)            | `Schools.Suspend`                                                 |
| School audit / billing / subscription tabs              | `Schools.View` + `Audit.View` / `Subscriptions.View`              |
| Start a support session                                 | `Schools.View` + `Support.Create`                                 |
| List subscriptions and plans                            | `Subscriptions.View`                                              |
| Change plan, extend, start grace, reactivate, reminders | `Subscriptions.Edit`                                              |
| Restrict or cancel a subscription                       | `Subscriptions.Edit` + `Subscriptions.Suspend`                    |
| Create, edit, publish, archive or delete plans          | `Subscriptions.Manage`                                            |
| Revenue and growth charts                               | `Reports.View`                                                    |
| List staff, their activity, security and open issues    | `Users.View`                                                      |
| Invite, resend or revoke an invitation                  | `Users.Create`                                                    |
| Edit details and role, send a password reset, sign out  | `Users.Edit`                                                      |
| Suspend or reactivate a staff member                    | `Users.Suspend`                                                   |
| Deactivate a staff member                               | `Users.Delete`                                                    |
| Create or delete custom roles                           | `Users.Manage`                                                    |
| Activity feed, audit log and its actor list             | `Audit.View`                                                      |
| View / change sign-in security settings                 | `Settings.View` / `Settings.Edit`                                 |
| Dashboard summary, attention list, recent activity      | any active staff member                                           |
| Roles list, own profile, photo, notifications, search   | any active staff member (search shows only what the role can see) |

## Rules worth knowing

- **School status** shown in the back office is the school's own status while it is Onboarding or Suspended, otherwise its subscription's (Active, Expiring, Grace period, Restricted, Expired, Cancelled).
- **Suspending** a school signs everyone at it out at once (their sessions are revoked) and blocks sign-in with `SCHOOL_SUSPENDED`. Reactivating returns it to the status it had before (read from the audit trail).
- **Provisioning** is one transaction: school, settings, sections, branches (first one is the original), predefined roles, subscription (on the plan's current version), the first invoice (plus a setup-fee invoice when the plan has one; custom plans are invoiced by sales), and the administrators' invitations, which are sent after it commits. The subdomain comes from the name, skipping reserved words and taken slugs (`-2`, `-3`…). The plan's branch limit is enforced; at least one administrator must manage all branches.
- **Subscription actions** never create invoices. Extending moves the renewal date from the later of today and the current date. Reactivating a lapsed subscription starts a new period today. Grace lasts 14 days. Changing plan keeps the billing period when the new plan offers it.
- **Plans** save a new version (with a "what changed" summary) on every real edit; schools keep the version they were sold on. A no-op save makes no version. Publishing, archiving and restoring show in the history from the audit trail. Only unused drafts can be deleted. Two people saving at once: the second gets `409 PLAN_CHANGED`.
- **Audit**: every write records an `AuditEvent` with area `Platform`, the staff member's name, before/after values, IP, device and request id. School-side events for a school also show in its back-office audit tab.
- **Staff accounts**: nobody can suspend, deactivate or change the role of themselves; nobody can give (or take away) a role with more access than their own (`ROLE_ABOVE_YOURS`); at least one active Platform Administrator always remains (`LAST_ADMIN`). Suspending and deactivating sign the person out everywhere. Only suspended staff can be reactivated; deactivated staff (and revoked invitations) are invited again on the same account. A role change sends the person a security alert. Predefined roles are named by key (`admin`, `ops`, `support`, `agent`, `finance`), custom roles by id; custom roles can be deleted only when nobody holds them.
- **Notifications**: each event (user invitation, subscription expiring, subscription overdue, school provisioned, support issue created/urgent, security alert) goes to the staff whose role can see it, on the channels each person chose (in-app, email, SMS; security alerts are always emailed). Provisioning alerts other staff; an accepted staff invitation alerts user managers. A daily job at 07:00 Lagos time expires lapsed staff invitations and alerts about subscriptions renewing within 30 days and overdue platform invoices, once per record. Support alerts arrive with the support desk.
- **Profile photo**: a JPG or PNG data URL of up to 2 MB (type checked from the bytes), stored in object storage as a `StoredFile` and returned as a one-hour signed link. Replacing or removing it deletes the old object. JSON bodies may be up to 3 MB for this.
- **Security settings**: new-device alerts apply to back-office sign-ins. IP restriction can't be turned on yet (`IP_RANGES_REQUIRED`) because there is nowhere to enter approved ranges.
- **Dashboard** figures come from the live tables: revenue is paid platform invoices by payment date (₦ millions), growth is reconstructed per month from provisioning, suspension and renewal dates.

## Running the back office against the API

```bash
cp services/edutrack/platform-backoffice/.env.example services/edutrack/platform-backoffice/.env.local
# set VITE_USE_MOCKS=false, then:
npm run dev -w @edutrack/platform-backoffice
```

The dev server proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:3000`), so the refresh cookie is first-party. Sign in as `tolu@edutrack.ng` / `Edutrack2026!` after `npm run db:seed`. The seed includes schools in every state (Kingsway on Enterprise, Hillcrest expiring, Unity in grace, Royal Crest restricted, Brookfield stalled in onboarding, Lagoon View with a pending administrator, Pinnacle Heights suspended), a year of platform invoices, and three notifications for Tolu. Re-seeding resets back-office notifications, preferences and security settings, and removes custom roles nobody holds.
