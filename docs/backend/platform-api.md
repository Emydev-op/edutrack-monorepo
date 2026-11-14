# Platform back office API

Everything the back office (`services/edutrack/platform-backoffice`) calls lives under `/api/v1/platform/…`, apart from sign-in (`/api/v1/auth/…`). The prefix keeps back-office routes apart from School Admin routes with the same names (`/dashboard`, `/users`, `/settings`, `/support`…). Code lives in `services/edutrack/backend/src/platform/`. Read with [`conventions.md`](conventions.md).

Response shapes match the back office's types in `platform-backoffice/src/types/` exactly. The in-browser mock (`src/api/mock`) answers the same paths, so the portal runs with or without the backend (`VITE_USE_MOCKS`).

## Status

| Area                                                                             | Endpoints                                             | Status     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| Schools, provisioning, administrators, usage, billing, history                   | `platform/schools…`                                   | Live       |
| Subscriptions and subscription actions                                           | `platform/subscriptions`, `schools/:id/subscription…` | Live       |
| Plans                                                                            | `platform/plans…`                                     | Live       |
| Dashboard                                                                        | `platform/dashboard/…`, `platform/activity/recent`    | Live       |
| Users, roles, audit log, activity feed, settings, profile, notifications, search | —                                                     | Next PR    |
| Support desk and support sessions from tickets                                   | —                                                     | After that |

## Permissions

Each route uses `@PlatformOnly('Area.Action')` against the signed-in staff member's role (see `src/auth/permissions/platform-permissions.ts`). The back office shows every button; the API decides.

| Action                                                  | Needs                                                |
| ------------------------------------------------------- | ---------------------------------------------------- |
| View schools, administrators, usage, activity           | `Schools.View`                                       |
| Provision a school                                      | `Schools.Create`                                     |
| Edit a school, invite or re-invite administrators       | `Schools.Edit`                                       |
| Suspend or reactivate a school (one or many)            | `Schools.Suspend`                                    |
| School audit / billing / subscription tabs              | `Schools.View` + `Audit.View` / `Subscriptions.View` |
| Start a support session                                 | `Schools.View` + `Support.Create`                    |
| List subscriptions and plans                            | `Subscriptions.View`                                 |
| Change plan, extend, start grace, reactivate, reminders | `Subscriptions.Edit`                                 |
| Restrict or cancel a subscription                       | `Subscriptions.Edit` + `Subscriptions.Suspend`       |
| Create, edit, publish, archive or delete plans          | `Subscriptions.Manage`                               |
| Revenue and growth charts                               | `Reports.View`                                       |
| Dashboard summary, attention list, recent activity      | any active staff member                              |

## Rules worth knowing

- **School status** shown in the back office is the school's own status while it is Onboarding or Suspended, otherwise its subscription's (Active, Expiring, Grace period, Restricted, Expired, Cancelled).
- **Suspending** a school signs everyone at it out at once (their sessions are revoked) and blocks sign-in with `SCHOOL_SUSPENDED`. Reactivating returns it to the status it had before (read from the audit trail).
- **Provisioning** is one transaction: school, settings, sections, branches (first one is the original), predefined roles, subscription (on the plan's current version), the first invoice (plus a setup-fee invoice when the plan has one; custom plans are invoiced by sales), and the administrators' invitations, which are sent after it commits. The subdomain comes from the name, skipping reserved words and taken slugs (`-2`, `-3`…). The plan's branch limit is enforced; at least one administrator must manage all branches.
- **Subscription actions** never create invoices. Extending moves the renewal date from the later of today and the current date. Reactivating a lapsed subscription starts a new period today. Grace lasts 14 days. Changing plan keeps the billing period when the new plan offers it.
- **Plans** save a new version (with a "what changed" summary) on every real edit; schools keep the version they were sold on. A no-op save makes no version. Publishing, archiving and restoring show in the history from the audit trail. Only unused drafts can be deleted. Two people saving at once: the second gets `409 PLAN_CHANGED`.
- **Audit**: every write records an `AuditEvent` with area `Platform`, the staff member's name, before/after values, IP, device and request id. School-side events for a school also show in its back-office audit tab.
- **Dashboard** figures come from the live tables: revenue is paid platform invoices by payment date (₦ millions), growth is reconstructed per month from provisioning, suspension and renewal dates.

## Running the back office against the API

```bash
cp services/edutrack/platform-backoffice/.env.example services/edutrack/platform-backoffice/.env.local
# set VITE_USE_MOCKS=false, then:
npm run dev -w @edutrack/platform-backoffice
```

The dev server proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:3000`), so the refresh cookie is first-party. Sign in as `tolu@edutrack.ng` / `Edutrack2026!` after `npm run db:seed`. The seed includes schools in every state (Kingsway on Enterprise, Hillcrest expiring, Unity in grace, Royal Crest restricted, Brookfield stalled in onboarding, Lagoon View with a pending administrator, Pinnacle Heights suspended) and a year of platform invoices.
