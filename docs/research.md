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

## WordPress 7.0 AI Baseline

WordPress 7.0 includes the AI Client foundation in core, but user-facing AI features still require plugins. The canonical WordPress.org `ai` plugin provides the AI admin/editor experience, while provider connectors register specific AI services with the WordPress AI Client.

The WordPress AI team identifies Anthropic, Google, and OpenAI connector plugins as the default connector options surfaced in WordPress 7.0. The template therefore installs and activates:

- `ai`
- `ai-provider-for-anthropic`
- `ai-provider-for-google`
- `ai-provider-for-openai`

The provider plugins support environment-provided API keys:

- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`

These keys are optional. Without credentials, the plugins are present and ready, but AI requests cannot be completed.

Sources:

- https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/
- https://make.wordpress.org/ai/2026/03/25/call-for-testing-community-ai-connector-plugins/
- https://wordpress.org/plugins/ai/
- https://wordpress.org/plugins/ai-provider-for-anthropic/
- https://wordpress.org/plugins/ai-provider-for-google/
- https://wordpress.org/plugins/ai-provider-for-openai/

## MariaDB

The official MariaDB image provides `latest` and `lts` tags. Docker Hub currently maps the LTS family to MariaDB 12.3.x, and this template uses the `12.3` series by default while keeping the image configurable through `.env`.

The image also includes `healthcheck.sh`; the template uses `--connect` and `--innodb_initialized` before WordPress starts.

MariaDB's official Docker image supports custom `.cnf` files under `/etc/mysql/conf.d`, so the template now renders a `z-vibe-wp.cnf` file from env instead of keeping database tuning as a long Compose `command:` list. MariaDB's current tuning docs emphasize sizing the InnoDB buffer pool from available memory and configuring redo log size in a configuration file for restart-safe persistence.

Sources:

- https://hub.docker.com/_/mariadb
- https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/using-healthcheck-sh
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/mariadb-enterprise-server-innodb-operations/configure-the-innodb-buffer-pool
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/mariadb-enterprise-server-innodb-operations/configure-the-innodb-redo-log

## Redis Object Cache

The Redis Object Cache plugin supports PhpRedis, Predis, Relay, replication, Sentinel, clustering, and WP-CLI. Its documented constants include `WP_REDIS_HOST`, `WP_REDIS_PORT`, `WP_REDIS_DATABASE`, `WP_REDIS_PASSWORD`, `WP_REDIS_PREFIX`, and `WP_CACHE_KEY_SALT`.

Redis 8 exposes memory eviction policies, active defragmentation, lazy freeing, and threaded I/O settings through `redis.conf`. The template therefore uses a custom Redis runtime image that renders a real config file from env, defaults cache eviction to `allkeys-lfu`, keeps persistence disabled for object-cache use, and wires Redis Object Cache through `WP_REDIS_*` constants.

Sources:

- https://redis.io/docs/latest/operate/oss_and_stack/management/config/
- https://redis.io/docs/latest/develop/reference/eviction/
- https://redis.io/blog/redis-8-ga/
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
