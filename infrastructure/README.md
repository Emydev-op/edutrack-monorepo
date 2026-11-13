# Infrastructure

| Path                        | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `docker/docker-compose.yml` | Local Postgres 18, Redis 8, RustFS (S3-compatible) and Mailpit |
| `docker/nginx/spa.conf`     | nginx config baked into every portal image                     |

Per-app Dockerfiles live next to each app (`services/edutrack/<app>/Dockerfile`) and are built from the repo root.

Cloud provisioning (Terraform / Kubernetes manifests) goes in this folder once the hosting target is chosen.

## Local services

```bash
npm run infra:up     # start
npm run infra:logs   # follow logs
npm run infra:down   # stop (data volumes are kept)
```

| Service  | Address                 | Credentials                    |
| -------- | ----------------------- | ------------------------------ |
| Postgres | `localhost:5432`        | `edutrack` / `edutrack`        |
| Redis    | `localhost:6379`        | none                           |
| RustFS   | `http://localhost:9000` | `edutrack` / `edutrack-secret` |
| Console  | `http://localhost:9001` | same as RustFS                 |
| Mailpit  | SMTP `localhost:1025`   | none (any login accepted)      |
| Inbox    | `http://localhost:8025` | none                           |

Every email the API sends locally (invitations, password resets, sign-in alerts) lands in the Mailpit inbox; nothing leaves your machine.
