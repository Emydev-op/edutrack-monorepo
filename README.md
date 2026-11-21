# EduTrack

Multi-tenant school management platform. One repo holds the API, the five web portals, each school's entry page and the shared packages they build on.

## Repository layout

```
.
├── .github/                    # CI, release-please, PR/issue templates, Dependabot
├── infrastructure/
│   └── docker/                 # Local stack + local router, production router, web image
├── packages/                   # Shared code, consumed via npm workspaces
│   ├── shared/                 # @edutrack/shared    — isomorphic types & constants (backend + web)
│   ├── ui/                     # @edutrack/ui        — shadcn-vue design system & theme
│   ├── app-kit/                # @edutrack/app-kit   — shared portal building blocks, brand theme
│   └── web-core/               # @edutrack/web-core  — HTTP client, TanStack Query defaults
└── services/edutrack/
    ├── backend/                # @edutrack/backend             — NestJS API            :8000
    ├── platform-backoffice/    # @edutrack/platform-backoffice — EduTrack staff        :5170
    ├── school-admin/           # @edutrack/school-admin        — school administrators :5171
    ├── teacher-portal/         # @edutrack/teacher-portal      — teachers              :5172
    ├── student-portal/         # @edutrack/student-portal      — students              :5176
    ├── parent-portal/          # @edutrack/parent-portal       — parents               :5174
    └── school-home/            # @edutrack/school-home         — school entry page     :5175
```

## Stack

| Layer    | Technology                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------- |
| Backend  | Node.js 24, TypeScript, NestJS 12, Prisma 7 + PostgreSQL, Redis, BullMQ, S3 storage, Swagger    |
| Frontend | Vue 3, Vite, Pinia, Vue Router, TanStack Query, VeeValidate + Yup, shadcn-vue + Tailwind CSS v4 |
| Tooling  | npm workspaces, oxlint + ESLint, Prettier, Vitest, Husky + commitlint, release-please           |

## Getting started

Prerequisites: **Node.js 24** (`nvm use` reads `.nvmrc`), npm 11, and Docker.

```bash
npm install                       # installs every workspace and builds @edutrack/shared
npm run infra:up                  # Postgres, Redis, RustFS (S3) in Docker
cp services/edutrack/backend/.env.example services/edutrack/backend/.env
npm run dev:backend               # http://localhost:8000/api, docs at /docs
```

In another terminal, start any portal (copy its `.env.example` to `.env` first), or everything at once:

```bash
npm run dev:school-admin
npm run dev:all                   # API + every portal + the school entry page, in one terminal
```

### Addresses

`npm run infra:up` also starts the **local router** (nginx on port 80), which gives every app its
deployed address with `.localhost` in place of `.edutrack.ng`. Browsers send `*.localhost` to your
machine, so no DNS or hosts-file changes are needed:

| Deployed                        | Local                               | App               | Dev server |
| ------------------------------- | ----------------------------------- | ----------------- | ---------- |
| `console.edutrack.ng`           | http://console.localhost            | Back office       | :5170      |
| `admin.edutrack.ng`             | http://admin.localhost              | School Admin      | :5171      |
| `<school>.edutrack.ng`          | http://greenfield.localhost         | School entry page | :5175      |
| `<school>.edutrack.ng/teacher/` | http://greenfield.localhost/teacher | Teacher Workspace | :5172      |
| `<school>.edutrack.ng/student/` | http://greenfield.localhost/student | Student portal    | :5176      |
| `<school>.edutrack.ng/parent/`  | http://greenfield.localhost/parent  | Parent portal     | :5174      |
| `*/api`                         | any of the above + `/api`           | API               | :8000      |

The school comes from the address, so school pages need the router. If port 80 is taken, start it
with `GATEWAY_PORT=8080 npm run infra:up` and add `:8080` (http://greenfield.localhost:8080/teacher).

## Common scripts (run from the root)

| Script                                                                                                                   | What it does                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `dev:backend` · `dev:backoffice` · `dev:school-admin` · `dev:teacher` · `dev:student` · `dev:parent` · `dev:school-home` | Start one app in watch mode                                |
| `dev:all`                                                                                                                | Start the API, every portal and the entry page in parallel |
| `build` · `lint` · `typecheck` · `test`                                                                                  | Run across every workspace                                 |
| `format` / `format:check`                                                                                                | Prettier                                                   |
| `infra:up` / `infra:down` / `infra:logs`                                                                                 | Local Docker services and the local router                 |
| `db:migrate` / `db:studio`                                                                                               | Prisma migrations / Prisma Studio                          |

Target one workspace with `-w`, e.g. `npm run test -w @edutrack/teacher-portal`.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md) — branching, commits, adding components and workspaces
- [DEPLOYMENT.md](DEPLOYMENT.md) — addresses, DNS and TLS, images, environment variables, releases
- [infrastructure/README.md](infrastructure/README.md) — local services
- [packages/ui/README.md](packages/ui/README.md) — design system usage
