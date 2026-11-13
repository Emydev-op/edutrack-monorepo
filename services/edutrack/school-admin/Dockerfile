# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f services/edutrack/school-admin/Dockerfile --build-arg VITE_API_URL=https://api.example.com/api -t edutrack/school-admin .

FROM node:25-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only -w @edutrack/school-admin

FROM nginx:1.30-alpine AS runtime
COPY infrastructure/docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/services/edutrack/school-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
