# syntax=docker/dockerfile:1
# The school entry page on its own, served at the root of the school's address
# (<school>.edutrack.ng/). The single web image (infrastructure/docker/web.Dockerfile) serves it
# together with every portal and the routing built in.
#
# Build from the repo root:
#   docker build -f services/edutrack/school-home/Dockerfile -t edutrack/school-home .

FROM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
# Same-site by default: the router in front forwards /api to the API, keeping the Host.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only -w @edutrack/school-home

FROM nginx:1.31-alpine AS runtime
COPY infrastructure/docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/services/edutrack/school-home/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
