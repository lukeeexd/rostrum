# syntax=docker/dockerfile:1

# The build output (static SPA + bundled server) is architecture-independent,
# so build once on the runner's native platform; only the runtime is per-arch.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Node 24: history uses the built-in node:sqlite, so nothing native is needed.
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 HISTORY_DB=/data/rostrum.db
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# History lives on a volume; the rest of the filesystem can stay read-only.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:$PORT/healthz" >/dev/null || exit 1
CMD ["node", "dist-server/index.js"]
