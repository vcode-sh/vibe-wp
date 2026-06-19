ARG REDIS_IMAGE=redis:8-alpine
FROM ${REDIS_IMAGE}

RUN set -eux; \
  if command -v apk >/dev/null 2>&1; then \
    apk add --no-cache gettext; \
  elif command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends gettext-base; \
    rm -rf /var/lib/apt/lists/*; \
  else \
    echo "Unsupported Redis base image package manager" >&2; \
    exit 1; \
  fi

COPY redis.conf.template /usr/local/share/vibe-wp/redis.conf.template
COPY entrypoint.sh /usr/local/bin/vibe-wp-redis-entrypoint.sh

RUN chmod +x /usr/local/bin/vibe-wp-redis-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/vibe-wp-redis-entrypoint.sh"]
CMD ["redis-server"]
