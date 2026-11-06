# Contributing

## Branches

| Branch                       | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `main`                       | Production. Release PRs from release-please land here.  |
| `dev`                        | Integration branch. All feature work merges here first. |
| `feat/*`, `fix/*`, `chore/*` | Short-lived branches off `dev`.                         |

1. Branch from `dev`: `git switch -c feat/school-admin-class-list dev`
2. Open a PR into `dev`. CI runs lint, typecheck, tests, build and a Docker build **only for the apps your change touches** (a change under `packages/` re-checks every app).
3. Squash-merge. To release, open a PR from `dev` into `main`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are enforced by commitlint on every commit. release-please reads them to version each app and write its changelog, so the scope matters:

```
feat(school-admin): add class list page
fix(backend): reject expired invitation tokens
chore(deps): bump vite to 8.4
```

Scopes: `backend`, `platform-backoffice`, `school-admin`, `teacher-portal`, `student-portal`, `parent-portal`, `ui`, `shared`, `web-core`, `infra`, `ci`, `deps`, `repo`.

Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

## Code style

- Prettier formats everything. A pre-commit hook runs it on staged files.
- Backend lint: oxlint (type-aware). Portal lint: oxlint + ESLint (Vue rules).
- TypeScript is strict everywhere. The backend is native ESM, so relative imports end in `.js`.

## Working with the design system

Shared UI lives in `packages/ui` ([shadcn-vue](https://www.shadcn-vue.com/)). Add components there, never inside a single portal, so all five portals stay consistent:

```bash
npm run ui:add -w @edutrack/ui -- dialog table
```

Then import from any portal: `import { Dialog } from '@edutrack/ui/components/dialog'`.

Components specific to one portal go in that portal's `src/components/`.

## Database changes

```bash
# edit services/edutrack/backend/prisma/schema.prisma, then:
npm run db:migrate -- --name add_attendance
```

Commit the generated folder under `prisma/migrations/`. Never edit a migration that has already been merged.

## Adding a workspace

1. Create it under `services/edutrack/<name>` (app) or `packages/<name>` (library) with a `package.json` named `@edutrack/<name>`.
2. Run `npm install` from the root.
3. Register it in `release-please-config.json`, `.release-please-manifest.json`, the `changes` filters in `.github/workflows/ci.yml`, and the commitlint scopes.
