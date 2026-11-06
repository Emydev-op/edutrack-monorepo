# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f services/edutrack/backend/Dockerfile -t edutrack/backend .
# Run migrations as a release step with the same image:
#   docker run --rm -e DATABASE_URL=... edutrack/backend npx prisma migrate deploy

FROM node:24-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build -w @edutrack/backend
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
# Workspace packages are symlinked from node_modules, so keep the repo layout.
COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json ./packages/shared/
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/services/edutrack/backend/package.json /repo/services/edutrack/backend/prisma.config.ts ./services/edutrack/backend/
COPY --from=build /repo/services/edutrack/backend/prisma ./services/edutrack/backend/prisma
COPY --from=build /repo/services/edutrack/backend/dist ./services/edutrack/backend/dist
WORKDIR /repo/services/edutrack/backend
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1
CMD ["node", "dist/main.js"]
