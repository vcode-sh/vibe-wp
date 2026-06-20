FROM oven/bun:1 AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV NODE_ENV=production
RUN cd web && bun run build

FROM nginx:alpine AS runner
COPY --from=builder /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
