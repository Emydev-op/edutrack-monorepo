# EduTrack

Multi-tenant school management platform. One repo holds the API, the five web portals and the shared packages they build on.

## Repository layout

```
.
├── .github/                    # CI, release-please, PR/issue templates, Dependabot
├── infrastructure/
│   └── docker/                 # Local stack (Postgres, Redis, S3) + nginx config for portals
├── packages/                   # Shared code, consumed via npm workspaces
│   ├── shared/                 # @edutrack/shared    — isomorphic types & constants (backend + web)
│   ├── ui/                     # @edutrack/ui        — shadcn-vue design system & theme
│   └── web-core/               # @edutrack/web-core  — HTTP client, TanStack Query defaults
└── services/edutrack/
    ├── backend/                # @edutrack/backend             — NestJS API            :3000
    ├── platform-backoffice/    # @edutrack/platform-backoffice — EduTrack staff        :5170
    ├── school-admin/           # @edutrack/school-admin        — school administrators :5171
    ├── teacher-portal/         # @edutrack/teacher-portal      — teachers              :5172
    ├── student-portal/         # @edutrack/student-portal      — students              :5173
    └── parent-portal/          # @edutrack/parent-portal       — parents               :5174
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
npm run dev:backend               # http://localhost:3000/api, docs at /docs
```

In another terminal, start any portal (copy its `.env.example` to `.env` first):

```bash
npm run dev:school-admin
```

## Common scripts (run from the root)

| Script                                                                                               | What it does                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `dev:backend` · `dev:backoffice` · `dev:school-admin` · `dev:teacher` · `dev:student` · `dev:parent` | Start one app in watch mode       |
| `build` · `lint` · `typecheck` · `test`                                                              | Run across every workspace        |
| `format` / `format:check`                                                                            | Prettier                          |
| `infra:up` / `infra:down` / `infra:logs`                                                             | Local Docker services             |
| `db:migrate` / `db:studio`                                                                           | Prisma migrations / Prisma Studio |

Target one workspace with `-w`, e.g. `npm run test -w @edutrack/teacher-portal`.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md) — branching, commits, adding components and workspaces
- [DEPLOYMENT.md](DEPLOYMENT.md) — images, environment variables, releases
- [infrastructure/README.md](infrastructure/README.md) — local services
- [packages/ui/README.md](packages/ui/README.md) — design system usage
