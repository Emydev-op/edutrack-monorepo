# @edutrack/platform-backoffice

The internal back office EduTrack staff use to run the platform: provision schools, manage
subscriptions and plans, support schools, manage platform users and roles, and review activity
and the audit log. Built from the **Platform Back Office** design in Claude Design.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
npm run dev -w @edutrack/platform-backoffice   # http://localhost:5170
```

Sign in with the prefilled demo account. In development every API call is answered by an
in-browser **mock API**, so the app works before the backend exists.

| Variable         | Default           | Purpose                                                        |
| ---------------- | ----------------- | -------------------------------------------------------------- |
| `VITE_API_URL`   | `/api`            | Base URL of the EduTrack API                                   |
| `VITE_USE_MOCKS` | on in development | `false` calls the real backend; `true` forces mocks in a build |

### Mock API

`src/api/mock` implements the REST contract the backend will expose (`/v1/schools`,
`/v1/support/issues/:id/transitions`, …) as an Axios adapter with realistic latency, validation,
error codes and an audit trail. It is code-split and never loaded in production builds.
Services call real endpoints, so switching to the backend means turning mocks off; no screen changes.

Built-in test hooks, kept from the design:

| Try                                                    | You see                          |
| ------------------------------------------------------ | -------------------------------- |
| Sign in as `kemi@edutrack.ng` / `bayo@edutrack.ng`     | Suspended / deactivated notices  |
| An admin or invitee email containing `fail`            | Provisioning / invitation errors |
| `/reset-password?token=expired` then submit            | Expired reset link               |
| `/accept-invitation/u6` · `/accept-invitation/expired` | Invitation flow / expired link   |

## Structure

```
src/
├── api/
│   ├── client.ts            # Axios instance: auth header, 401 handling, server-error toasts
│   ├── helpers.ts           # get/post/patch/put/delete wrappers
│   ├── query-keys.ts        # Every TanStack Query key, hierarchical for invalidation
│   ├── services/<area>.ts   # useXxxQuery / useXxxMutation hooks per area
│   └── mock/                # Dev-only mock API (seed data, handlers, adapter)
├── components/
│   ├── common/              # DataTable, PageHeader, TabNav, KeyValueCard, MetricCard, …
│   ├── form/                # VeeValidate-bound FormInput, FormSelect, FormTextarea, ChoiceCards
│   ├── layout/              # DashboardLayout, AuthLayout, AppSidebar, AppHeader, CommandMenu
│   └── overlays/            # SideDrawer, ConfirmDialogHost, SuccessDialogHost
├── composables/             # useConfirm, useUnsavedChanges, useRouteQuery, useSelection, …
├── config/                  # env, navigation, shared option lists
├── router/                  # routes-path.ts (names + paths), modules/, guards
├── schema/                  # Yup schemas per area
├── stores/                  # auth (session), layout (breadcrumb label)
├── types/                   # Domain types = the API contract
└── views/<area>/            # Screens; detail pages use (tabs)/ child routes, components/ for parts
```

### Conventions

- **Navigate by route name** from `routesPath`, never by hard-coded path.
- **Filters live in the URL** (`useRouteQuery`) so filtered views can be shared and refreshed.
- **Risky actions go through `useConfirm`**: what happens, who is affected, reversibility, and an
  optional reason, option or acknowledgement. Pass `action` and the dialog shows progress and
  server errors itself.
- **Forms** use `useForm` with a schema from `schema/` and the `form/` field components.
  Multi-step flows use one form and validate the current step's fields only.
- **Mutations invalidate** the query keys they affect (lists, dashboard, activity, audit).
