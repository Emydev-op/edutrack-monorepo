# syntax=docker/dockerfile:1
# Every web portal in one image: the back office, School Admin, the school entry page and the
# Teacher, Parent and Student portals, served by one nginx with the production routing
# (nginx/gateway.conf). The API runs separately (services/edutrack/backend/Dockerfile).
#
# Build from the repo root:
#   docker build -f infrastructure/docker/web.Dockerfile -t edutrack/web .
# Run, pointing /api at the API (scheme, host and port; no path):
#   docker run -p 8080:80 -e API_UPSTREAM=http://api:8000 edutrack/web

FROM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
# Every portal calls the API on its own address (/api), which this image forwards.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only \
  -w @edutrack/platform-backoffice \
  -w @edutrack/school-admin \
  -w @edutrack/school-home \
  -w @edutrack/teacher-portal \
  -w @edutrack/parent-portal \
  -w @edutrack/student-portal

FROM nginx:1.31-alpine AS runtime
# Where /api/ goes. Rendered into the config when the container starts.
ENV API_UPSTREAM=http://api:8000
# Replaces the image's default site.
COPY infrastructure/docker/nginx/gateway.conf /etc/nginx/templates/default.conf.template
COPY infrastructure/docker/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /repo/services/edutrack/platform-backoffice/dist /usr/share/edutrack/backoffice
COPY --from=build /repo/services/edutrack/school-admin/dist /usr/share/edutrack/school-admin
COPY --from=build /repo/services/edutrack/school-home/dist /usr/share/edutrack/school-home
# Built for their paths (base '/teacher/' …), so they sit under one root at those paths.
COPY --from=build /repo/services/edutrack/teacher-portal/dist /usr/share/edutrack/portals/teacher
COPY --from=build /repo/services/edutrack/parent-portal/dist /usr/share/edutrack/portals/parent
COPY --from=build /repo/services/edutrack/student-portal/dist /usr/share/edutrack/portals/student
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
