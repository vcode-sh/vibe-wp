FROM oven/bun:1 AS base
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

ENV NODE_ENV=production
RUN cd server && bun run build
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/server
CMD ["bun", "dist/index.mjs"]
