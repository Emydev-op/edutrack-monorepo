# Infrastructure

| Path                                     | Purpose                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docker/docker-compose.yml`              | Local Postgres 18, Redis 8, RustFS (S3-compatible), Mailpit and the local router            |
| `docker/nginx/gateway.dev.conf`          | The local router: `*.localhost` addresses in front of the dev servers                       |
| `docker/nginx/gateway.conf`              | The production router, baked into the web image                                             |
| `docker/web.Dockerfile`                  | The single web image: every portal + the entry page + the production router                 |
| `docker/nginx/spa.conf`                  | nginx config for a standalone image served at `/` (back office, School Admin, entry page)   |
| `docker/nginx/spa-subpath.conf.template` | nginx config for a standalone image built for a path (`/teacher/`, `/parent/`, `/student/`) |
| `docker/nginx/snippets/`                 | Security headers included by `gateway.conf`                                                 |

Per-app Dockerfiles live next to each app (`services/edutrack/<app>/Dockerfile`) and are built from the repo root. See [DEPLOYMENT.md](../DEPLOYMENT.md).

Cloud provisioning (Terraform / Kubernetes manifests) goes in this folder once the hosting target is chosen.

## Local services

```bash
npm run infra:up     # start (rebuilds the local router when its config changes)
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
| Router   | `http://*.localhost`    | none (port 80, `GATEWAY_PORT`) |

Every email the API sends locally (invitations, password resets, sign-in alerts) lands in the Mailpit inbox; nothing leaves your machine.
