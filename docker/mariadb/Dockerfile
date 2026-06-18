ARG MARIADB_IMAGE=mariadb:12.3
FROM ${MARIADB_IMAGE}

RUN set -eux; \
  if command -v apk >/dev/null 2>&1; then \
    apk add --no-cache gettext; \
  elif command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends gettext-base; \
    rm -rf /var/lib/apt/lists/*; \
  else \
    echo "Unsupported MariaDB base image package manager" >&2; \
    exit 1; \
  fi

COPY mariadb.cnf.template /etc/mysql/templates/vibe-wp.cnf.template
COPY entrypoint.sh /usr/local/bin/vibe-wp-mariadb-entrypoint.sh

RUN chmod +x /usr/local/bin/vibe-wp-mariadb-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/vibe-wp-mariadb-entrypoint.sh"]
CMD ["mariadbd"]
