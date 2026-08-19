FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Fixed throwaway build-time placeholders only (.env is dockerignored). Never
# forward the real BETTER_AUTH_SECRET as a build ARG: ARG values persist in
# image history (`docker history`) even though the builder stage is discarded.
# The runner stage starts fresh from the base image, so these ENVs do not
# ship — the real secret is injected at runtime via compose/Coolify env vars.
ENV BETTER_AUTH_SECRET=build-time-secret-replace-at-runtime
ENV BETTER_AUTH_URL=http://localhost:3000
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Runtime app + ops tooling for `npm run db:migrate` / `db:seed` in-container
# (--chown on each COPY avoids a follow-up `chown -R` layer that would duplicate every file)
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
# Run as the base image's non-root `node` user; keep the documents volume writable
RUN mkdir -p /data/documents && chown -R node:node /data
USER node
EXPOSE 3000
# Entrypoint validates env + applies migrations, then execs node as PID 1 (clean SIGTERM)
CMD ["sh", "scripts/start-production.sh"]
