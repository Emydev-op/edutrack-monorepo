# Deployment

## Artifacts

Every app ships as its own Docker image, built **from the repo root** so it can include shared workspace packages:

| App                 | Dockerfile                                         | Runtime            | Port |
| ------------------- | -------------------------------------------------- | ------------------ | ---- |
| backend             | `services/edutrack/backend/Dockerfile`             | Node 24 (alpine)   | 3000 |
| platform-backoffice | `services/edutrack/platform-backoffice/Dockerfile` | nginx (static SPA) | 80   |
| school-admin        | `services/edutrack/school-admin/Dockerfile`        | nginx (static SPA) | 80   |
| teacher-portal      | `services/edutrack/teacher-portal/Dockerfile`      | nginx (static SPA) | 80   |
| student-portal      | `services/edutrack/student-portal/Dockerfile`      | nginx (static SPA) | 80   |
| parent-portal       | `services/edutrack/parent-portal/Dockerfile`       | nginx (static SPA) | 80   |

```bash
docker build -f services/edutrack/backend/Dockerfile -t edutrack/backend .
docker build -f services/edutrack/school-admin/Dockerfile \
  --build-arg VITE_API_URL=https://api.staging.example.com/api -t edutrack/school-admin .
```

Health checks: backend `GET /api/health/live` (liveness) and `GET /api/health` (readiness: database, Redis, storage). Portals: `GET /healthz`.

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
| `PORT`                 | no       | `3000`                                       |                                |
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

| Variable         | Example                       | Notes                                          |
| ---------------- | ----------------------------- | ---------------------------------------------- |
| `VITE_API_URL`   | `https://api.example.com/api` | Passed as `--build-arg`; baked into the bundle |
| `VITE_TENANT_ID` | —                             | Local development only (school portals)        |

Vite inlines variables at build time, so each environment needs its own portal image (or add runtime config injection later).
