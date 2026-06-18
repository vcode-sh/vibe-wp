# Architecture

## Service Graph

```text
Browser
  -> nginx:8080
    -> wordpress:9000 PHP-FPM
      -> db:3306 MariaDB
      -> redis:6379 Redis

Workers and tools:
  - cron runs due WordPress events through WP-CLI.
  - wp is an on-demand WP-CLI service.
  - adminer is an optional tools profile.
```

## Services

### `nginx`

Nginx serves static files, applies WordPress rewrites, compresses text responses, forwards PHP requests to PHP-FPM, and keeps a short-lived FastCGI page cache for anonymous GET and HEAD requests.

The cache intentionally skips:

- authenticated users
- WordPress admin
- login requests
- REST API requests
- query-string requests
- browser no-cache requests
- WooCommerce cart, checkout, and account URLs
- requests with authorization headers

The default web tier remains Nginx rather than Caddy or OpenLiteSpeed because this template prioritizes an env-driven FastCGI cache layer without making TLS automation or an LSCache plugin contract mandatory. See [web-tier.md](web-tier.md).

### `wordpress`

The WordPress service is a custom image based on the official WordPress PHP-FPM image. It adds:

- PhpRedis extension
- WP-CLI
- env-rendered PHP config
- env-rendered PHP-FPM pool config
- generated `WORDPRESS_CONFIG_EXTRA`

### `db`

MariaDB stores all authoritative WordPress data. It uses a named Docker volume and health checks before WordPress starts.

### `redis`

Redis is a cache layer only. It is configured with an eviction policy and no append-only persistence by default.

### `cron`

The cron worker waits until WordPress is installed, then runs:

```sh
wp cron event run --due-now
```

on the configured interval.

### `wp`

The `wp` service is an on-demand WP-CLI container that shares the same image, environment, network, and content mounts as WordPress.

## Content Model

The host `content/` directory is mounted as `/var/www/html/wp-content`.

Important subdirectories:

- `content/uploads`
- `content/plugins`
- `content/themes`
- `content/mu-plugins`

The WordPress image seeds default `wp-content` files into the mounted directory with `rsync --ignore-existing`, so the first boot has a valid baseline without overwriting user files.

## Core Code Model

WordPress core comes from the selected official image. Nginx copies the same core files at build time so it can serve static WordPress assets without sharing the entire PHP container filesystem.

Custom project code should live in:

- `content/themes`
- `content/plugins`
- `content/mu-plugins`

For production teams that want immutable deploys, move custom themes/plugins into a separate build step and treat this template as the runtime substrate.
