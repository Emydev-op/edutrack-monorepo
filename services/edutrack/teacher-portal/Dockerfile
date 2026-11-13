# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f services/edutrack/teacher-portal/Dockerfile --build-arg VITE_API_URL=https://api.example.com/api -t edutrack/teacher-portal .

FROM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only -w @edutrack/teacher-portal

FROM nginx:1.31-alpine AS runtime
COPY infrastructure/docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/services/edutrack/teacher-portal/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
