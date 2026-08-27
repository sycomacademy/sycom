FROM oven/bun:1 AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
RUN cd apps/server && bun run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
# The migrate Container App Job runs `bun run db:migrate` (drizzle-kit) in
# this same image; the server process itself still runs under node below.
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "dist/index.mjs"]
