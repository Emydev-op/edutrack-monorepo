# Deployment

## Addresses

| Address                         | App                             | Notes                                          |
| ------------------------------- | ------------------------------- | ---------------------------------------------- |
| `console.edutrack.ng`           | Platform back office            | EduTrack staff                                 |
| `admin.edutrack.ng`             | School Admin                    | Shared by every school; chosen at sign-in      |
| `<school>.edutrack.ng`          | The school's entry page         | Logo, name, motto, links to the portals        |
| `<school>.edutrack.ng/teacher/` | Teacher Workspace               |                                                |
| `<school>.edutrack.ng/parent/`  | Parent portal                   |                                                |
| `<school>.edutrack.ng/student/` | Student portal                  |                                                |
| `*/api/`                        | The API, on every address above | Same-site, so refresh cookies stay first-party |

`<school>` is the school's `slug` (e.g. `greenfield`). The API reads the school from the `Host`
header, so every router in front must pass it through unchanged. An address that names no school
gets the entry page's **School not found** (the API answers 404 `SCHOOL_NOT_FOUND`).

### Locally

`npm run infra:up` starts the local router (`infrastructure/docker/nginx/gateway.dev.conf`) with
the same addresses under `.localhost` in front of the dev servers: http://console.localhost,
http://admin.localhost, http://greenfield.localhost, http://greenfield.localhost/teacher (start the
apps with `npm run dev:all`). Browsers resolve `*.localhost` to your machine, so no DNS changes are
needed. If port 80 is taken, use `GATEWAY_PORT=8080 npm run infra:up` and add `:8080` to each
address.

### DNS

| Record                | Points to                            |
| --------------------- | ------------------------------------ |
| `*.edutrack.ng`       | the web load balancer (every school) |
| `console.edutrack.ng` | the same load balancer               |
| `admin.edutrack.ng`   | the same load balancer               |

The wildcard already covers `console` and `admin`; explicit records keep them working if the
wildcard is ever narrowed. A new school needs no DNS change: its slug works as soon as it exists.

### TLS

One wildcard certificate for `*.edutrack.ng` covers every school, `console` and `admin` (add
`edutrack.ng` itself as a second name if the bare domain is served). It ends at the load balancer;
the web image listens on plain HTTP and reads `X-Forwarded-Proto`. A wildcard covers one level only,
so school addresses stay `<school>.edutrack.ng`, never deeper.

### Reserved names

These subdomains are never schools (`RESERVED_SUBDOMAINS` in
`services/edutrack/backend/src/tenancy/tenant-resolver.service.ts`); provisioning must refuse them
as slugs: `www`, `api`, `app`, `apps`, `admin`, `backoffice`, `console`, `ops`, `platform`,
`portal`, `auth`, `login`, `account`, `accounts`, `mail`, `smtp`, `static`, `assets`, `cdn`,
`docs`, `status`, `help`, `support`, `edutrack`, `school`, `schools`, `teacher`, `parent`,
`student`, `dev`, `staging`, `test`, `demo`. Any of them without its own DNS record and router entry
lands on the entry page, which shows **School not found**.

## Artifacts

### Single web image (recommended)

`infrastructure/docker/web.Dockerfile` builds every web app (back office, School Admin, the entry
page, Teacher, Parent and Student) into one nginx image with the production routing
(`infrastructure/docker/nginx/gateway.conf`) built in: the hosts and paths above, history-mode
fallbacks per base path (`/teacher/anything` → `/teacher/index.html`), a year's cache for hashed
assets, `no-cache` for `index.html`, and the security headers. `/api/` on every address is
forwarded to `API_UPSTREAM`.

```bash
docker build -f infrastructure/docker/web.Dockerfile -t edutrack/web .
docker run -p 8080:80 -e API_UPSTREAM=http://api:8000 edutrack/web
```

| Variable       | Default           | Notes                                                                              |
| -------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `API_UPSTREAM` | `http://api:8000` | Runtime. Scheme, host and port of the API, no path. Must resolve when nginx starts |

The image also answers the same names under `.localhost`, so `docker run -p 8080:80 -e
API_UPSTREAM=http://host.docker.internal:8000 edutrack/web` can be tried at
http://greenfield.localhost:8080. Deploy it with the backend image behind one load balancer.

### Per-app images

Every app also ships as its own image, built **from the repo root** so it can include shared
workspace packages. Use these when the apps are deployed separately behind your own router (which
must then do what `gateway.conf` does, keeping the `Host` and the path):

| App                 | Dockerfile                                         | Runtime            | Port | Serves at                   |
| ------------------- | -------------------------------------------------- | ------------------ | ---- | --------------------------- |
| backend             | `services/edutrack/backend/Dockerfile`             | Node 24 (alpine)   | 8000 | `/api`                      |
| web (all portals)   | `infrastructure/docker/web.Dockerfile`             | nginx + routing    | 80   | every address               |
| platform-backoffice | `services/edutrack/platform-backoffice/Dockerfile` | nginx (static SPA) | 80   | `/`                         |
| school-admin        | `services/edutrack/school-admin/Dockerfile`        | nginx (static SPA) | 80   | `/`                         |
| school-home         | `services/edutrack/school-home/Dockerfile`         | nginx (static SPA) | 80   | `/`                         |
| teacher-portal      | `services/edutrack/teacher-portal/Dockerfile`      | nginx (static SPA) | 80   | `/teacher/` (`/` redirects) |
| student-portal      | `services/edutrack/student-portal/Dockerfile`      | nginx (static SPA) | 80   | `/student/` (`/` redirects) |
| parent-portal       | `services/edutrack/parent-portal/Dockerfile`       | nginx (static SPA) | 80   | `/parent/` (`/` redirects)  |

The Teacher, Parent and Student portals are built for their path (Vite `base`), so their images
serve them there (`infrastructure/docker/nginx/spa-subpath.conf.template`); route
`<school>.edutrack.ng/teacher/` to the teacher image without stripping the path.

```bash
docker build -f services/edutrack/backend/Dockerfile -t edutrack/backend .
docker build -f services/edutrack/school-admin/Dockerfile \
  --build-arg VITE_API_URL=https://api.staging.example.com/api -t edutrack/school-admin .
```

Health checks: backend `GET /api/health/live` (liveness) and `GET /api/health` (readiness: database, Redis, storage). Web and portal images: `GET /healthz`.

## Release flow

1. Merge `dev` → `main`.
2. The **Release Please** workflow opens (or updates) a release PR that bumps the version and changelog of each app that changed.
3. Merging the release PR tags each released app (`school-admin-v0.2.0`, `backend-v0.3.1`, …) and creates GitHub releases.
4. Image publishing and deployment hook onto those tags. They are wired up once the registry and hosting target are chosen.

## Database migrations

Run migrations as a release step **before** the new backend version takes traffic, using the backend image:

```bash
docker run --rm -e DATABASE_URL=postgresql://... edutrack/backend npx prisma migrate deploy
```

## Environment variables

### Backend

| Variable               | Required | Example                                      | Notes                          |
| ---------------------- | -------- | -------------------------------------------- | ------------------------------ |
| `NODE_ENV`             | no       | `production`                                 |                                |
| `PORT`                 | no       | `8000`                                       |                                |
| `CORS_ORIGINS`         | yes      | `https://admin.example.com,https://...`      | Comma-separated portal origins |
| `DATABASE_URL`         | yes      | `postgresql://user:pass@host:5432/edutrack`  |                                |
| `REDIS_URL`            | yes      | `rediss://:pass@host:6379`                   | `rediss://` enables TLS        |
| `S3_ENDPOINT`          | no       | `https://<account>.r2.cloudflarestorage.com` | Leave unset for AWS S3         |
| `S3_REGION`            | yes      | `eu-west-1`                                  |                                |
| `S3_BUCKET`            | yes      | `edutrack-prod`                              |                                |
| `S3_ACCESS_KEY_ID`     | yes      |                                              | Store in a secret manager      |
| `S3_SECRET_ACCESS_KEY` | yes      |                                              | Store in a secret manager      |
| `S3_FORCE_PATH_STYLE`  | no       | `false`                                      | `true` for MinIO/RustFS        |
| `S3_CREATE_BUCKET`     | no       | `false`                                      | Local development only         |

The backend validates these on boot and refuses to start if one is missing or malformed.

### Portals (build-time)

| Variable         | Example | Notes                                                                                         |
| ---------------- | ------- | --------------------------------------------------------------------------------------------- |
| `VITE_API_URL`   | `/api`  | Passed as `--build-arg`; baked into the bundle. Keep `/api` (same address) with the web image |
| `VITE_TENANT_ID` | —       | Local development only (school portals)                                                       |

Vite inlines variables at build time, so each environment needs its own portal image (or add runtime config injection later).
