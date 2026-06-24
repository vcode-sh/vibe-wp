ARG WORDPRESS_IMAGE=wordpress:7.0-php8.5-fpm
FROM ${WORDPRESS_IMAGE}

RUN set -eux; \
  if command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      $PHPIZE_DEPS \
      ca-certificates \
      curl \
      default-mysql-client \
      gettext-base \
      less \
      msmtp \
      rsync \
      unzip; \
    yes '' | pecl install redis; \
    docker-php-ext-enable redis; \
    apt-get purge -y --auto-remove $PHPIZE_DEPS; \
    rm -rf /var/lib/apt/lists/* /tmp/pear ~/.pearrc; \
  elif command -v apk >/dev/null 2>&1; then \
    apk add --no-cache \
      ca-certificates \
      curl \
      gettext \
      less \
      mariadb-client \
      msmtp \
      rsync \
      unzip; \
    apk add --no-cache --virtual .build-deps $PHPIZE_DEPS linux-headers; \
    yes '' | pecl install redis; \
    docker-php-ext-enable redis; \
    apk del .build-deps; \
    rm -rf /tmp/pear ~/.pearrc; \
  else \
    echo "Unsupported base image package manager" >&2; \
    exit 1; \
  fi; \
  curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp; \
  chmod +x /usr/local/bin/wp

COPY entrypoint.sh /usr/local/bin/vibe-wp-entrypoint.sh
COPY cron.sh /usr/local/bin/vibe-wp-cron.sh
COPY php.ini.template /usr/local/share/vibe-wp/php.ini.template
COPY php-fpm-www.conf.template /usr/local/share/vibe-wp/php-fpm-www.conf.template
COPY mu-plugins/ /usr/local/share/vibe-wp/mu-plugins/
COPY msmtprc.template /usr/local/share/vibe-wp/msmtprc.template
COPY sendmail-shim.sh /usr/local/bin/vibe-wp-sendmail
COPY mailq-flush.sh /usr/local/bin/vibe-wp-mailq-flush
COPY mail-log.sh /usr/local/bin/vibe-wp-mail-log

RUN chmod +x /usr/local/bin/vibe-wp-entrypoint.sh /usr/local/bin/vibe-wp-cron.sh /usr/local/bin/vibe-wp-sendmail /usr/local/bin/vibe-wp-mailq-flush /usr/local/bin/vibe-wp-mail-log

ENTRYPOINT ["/usr/local/bin/vibe-wp-entrypoint.sh"]
CMD ["php-fpm"]
