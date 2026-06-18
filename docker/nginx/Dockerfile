ARG WORDPRESS_IMAGE=wordpress:7.0-php8.5-fpm
ARG NGINX_IMAGE=nginx:1.29-alpine
FROM ${WORDPRESS_IMAGE} AS wordpress-files

FROM ${NGINX_IMAGE}

RUN set -eux; \
  if command -v apk >/dev/null 2>&1; then \
    apk add --no-cache gettext; \
  elif command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends gettext-base; \
    rm -rf /var/lib/apt/lists/*; \
  else \
    echo "Unsupported nginx base image package manager" >&2; \
    exit 1; \
  fi

COPY --from=wordpress-files /usr/src/wordpress /var/www/html
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY site.conf.template /etc/nginx/templates/site.conf.template
COPY entrypoint.sh /usr/local/bin/vibe-wp-nginx-entrypoint.sh

RUN chmod +x /usr/local/bin/vibe-wp-nginx-entrypoint.sh \
  && rm -f /etc/nginx/conf.d/default.conf

ENTRYPOINT ["/usr/local/bin/vibe-wp-nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
