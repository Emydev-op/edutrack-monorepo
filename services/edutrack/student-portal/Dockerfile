# syntax=docker/dockerfile:1
# The portal on its own. It is built for its path (Vite base '/student/'), so it is served at /student/
# (and / redirects there); put it behind a router that keeps the path, e.g.
# <school>.edutrack.ng/student/ → this container. The single web image
# (infrastructure/docker/web.Dockerfile) serves every portal with the routing built in.
#
# Build from the repo root:
#   docker build -f services/edutrack/student-portal/Dockerfile -t edutrack/student-portal .

FROM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
# Same-site by default: the router in front forwards /api to the API.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only -w @edutrack/student-portal

FROM nginx:1.31-alpine AS runtime
ENV PORTAL_PATH=student
# Rendered with PORTAL_PATH when the container starts; replaces the image's default site.
COPY infrastructure/docker/nginx/spa-subpath.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/services/edutrack/student-portal/dist /usr/share/nginx/html/student
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
