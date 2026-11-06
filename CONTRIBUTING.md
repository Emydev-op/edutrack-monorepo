# Contributing

## Branches

| Branch                                               | Purpose                                                                | Merged by    |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | ------------ |
| `main`                                               | Production. Every commit here is releasable; versions are tagged here. | Merge commit |
| `dev` (default)                                      | Integration. All work merges here first.                               | Squash       |
| `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*` | Short-lived branches off `dev`, one change each.                       | —            |
| `hotfix/*`                                           | Urgent production fix, branched off `main`.                            | —            |

Both `main` and `dev` are protected: no direct pushes, no force-pushes, no deletion. Changes go in through a pull request once the **CI passed** and **Conventional PR title** checks are green. Merged branches are deleted automatically.

### Day-to-day

1. Branch from `dev`: `git switch -c feat/school-admin-class-list origin/dev`
2. Open a PR into `dev`. CI runs lint, typecheck, tests, build and a Docker build **only for the apps your change touches** (a change under `packages/` re-checks every app).
3. **Squash-merge.** The PR title becomes the commit on `dev`, so it must be a Conventional Commit.

### Releasing

1. Open a PR from `dev` into `main` titled `chore(repo): release` and **merge it with a merge commit** (never squash: squashing loses the individual commits release-please reads, and makes `dev` and `main` diverge).
2. release-please opens a release PR on `main` that bumps each changed app's version and changelog. Merging it tags each app (`school-admin-v0.2.0`, …) and creates the GitHub releases.
3. A `chore(repo): sync main into dev` PR opens automatically. Merge it (merge commit) so `dev` carries the new versions.

Release and sync PRs are opened by GitHub Actions, which doesn't trigger CI on them; the repository admin merges them by bypassing the checks. To have CI run on them, add a fine-grained token with `contents` and `pull-requests` write access as the `RELEASE_PLEASE_TOKEN` secret.

### Hotfixes

Branch `hotfix/<what>` off `main`, PR it into `main` (merge commit), then let the sync PR carry it back to `dev`.

## Versioning

Each app and package is versioned on its own with [SemVer](https://semver.org/), driven by commit types:

| Commit                                | Before 1.0 | From 1.0 |
| ------------------------------------- | ---------- | -------- |
| `fix:` / `perf:`                      | patch      | patch    |
| `feat:`                               | patch      | minor    |
| `feat!:` or `BREAKING CHANGE:` footer | minor      | major    |

`docs`, `chore`, `ci`, `test` and `build` commits don't release anything. Tags are `<component>-v<version>`, e.g. `school-admin-v0.2.0`.

## Git identity

Commit with an email GitHub links to your account, or your commits won't show as yours. The private noreply address works everywhere:

```bash
git config user.email "<id>+<username>@users.noreply.github.com"
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are enforced by commitlint on every commit. release-please reads them to version each app and write its changelog, so the scope matters:

```
feat(school-admin): add class list page
fix(backend): reject expired invitation tokens
chore(deps): bump vite to 8.4
```

Scopes: `backend`, `platform-backoffice`, `school-admin`, `teacher-portal`, `student-portal`, `parent-portal`, `ui`, `shared`, `web-core`, `app-kit`, `infra`, `ci`, `deps`, `repo`.

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
