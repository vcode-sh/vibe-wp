# Research Notes

Date: 2026-06-18

This template is intentionally aligned with current upstream defaults instead of older WordPress 6.x hosting assumptions.

## WordPress Baseline

The WordPress release archive lists WordPress 7.0, released on May 20, 2026, as the latest active series. The template therefore defaults to a WordPress 7.0 Docker image instead of a 6.x image.

Source:

- https://wordpress.org/download/releases/

## Runtime Requirements

WordPress recommends:

- PHP 8.3 or greater.
- MariaDB 10.6+ or MySQL 8.0+.
- Nginx or Apache with rewrite support.
- HTTPS support.

The template uses Nginx, MariaDB, and a PHP-FPM WordPress image.

Source:

- https://wordpress.org/about/requirements/

## PHP Version

The WordPress PHP compatibility matrix marks WordPress 7.0 compatible with PHP 8.5, 8.4, and 8.3. PHP 8.5 is in active support until December 31, 2027, with security support until December 31, 2029.

Default:

- `WORDPRESS_IMAGE=wordpress:7.0-php8.5-fpm`

Conservative plugin-compatibility fallback:

- `WORDPRESS_IMAGE=wordpress:7.0-php8.4-fpm`

Sources:

- https://make.wordpress.org/core/handbook/references/php-compatibility-and-wordpress-versions/
- https://www.php.net/supported-versions.php

## WordPress Docker Image

The official WordPress image reads database and salt values from environment variables. It also supports `WORDPRESS_CONFIG_EXTRA`, which this template uses to add structured WordPress constants without editing `wp-config.php` by hand.

Sources:

- https://hub.docker.com/_/wordpress
- https://github.com/docker-library/wordpress/blob/master/wp-config-docker.php

## MariaDB

The official MariaDB image provides `latest` and `lts` tags. Docker Hub currently maps the LTS family to MariaDB 12.3.x, and this template uses the `12.3` series by default while keeping the image configurable through `.env`.

The image also includes `healthcheck.sh`; the template uses `--connect` and `--innodb_initialized` before WordPress starts.

Sources:

- https://hub.docker.com/_/mariadb
- https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/using-healthcheck-sh

## Redis Object Cache

The Redis Object Cache plugin supports PhpRedis, Predis, Relay, replication, Sentinel, clustering, and WP-CLI. Its documented constants include `WP_REDIS_HOST`, `WP_REDIS_PORT`, `WP_REDIS_DATABASE`, `WP_REDIS_PASSWORD`, `WP_REDIS_PREFIX`, and `WP_CACHE_KEY_SALT`.

The template installs the PhpRedis extension in the WordPress image and wires Redis through environment variables.

Sources:

- https://wordpress.org/plugins/redis-cache/
- https://github.com/rhubarbgroup/redis-cache

## Final Shape

The default stack is:

- Nginx for static files, rewrites, and anonymous FastCGI page cache.
- WordPress 7.0 PHP-FPM for application execution.
- MariaDB LTS as the source of truth.
- Redis 8 as the object cache layer.
- Dedicated cron worker for scheduled events.
- WP-CLI sidecar profile for operations.

This keeps the template easy to run locally while remaining close to a production deployment model.

## Web Tier Review

Nginx remains the default because it gives the template direct FastCGI cache controls, cache-bypass maps, static file handling, and WordPress rewrites without requiring a WordPress cache plugin. Caddy is a strong choice for host-level automatic HTTPS, but this stack usually sits behind an external TLS proxy. OpenLiteSpeed with LSCache is a good candidate for a future optional preset, but it changes the runtime and plugin contract enough that it should not be the default.

Sources:

- https://nginx.org/en/docs/http/ngx_http_core_module.html
- https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html
- https://docs.nginx.com/nginx/admin-guide/content-cache/content-caching/
- https://caddyserver.com/docs/caddyfile/directives/php_fastcgi
- https://docs.litespeedtech.com/cloud/docker/ols-wordpress/
