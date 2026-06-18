# Configuration

All runtime configuration starts in `.env`. Generate it with:

```sh
make init
```

## Image Selection

```env
WORDPRESS_IMAGE=wordpress:7.0-php8.5-fpm
NGINX_IMAGE=nginx:1.29-alpine
MARIADB_IMAGE=mariadb:12.3
REDIS_IMAGE=redis:8-alpine
WORDPRESS_RUNTIME_IMAGE=vibe-wp-wordpress
NGINX_RUNTIME_IMAGE=vibe-wp-nginx
```

Use `wordpress:7.0-php8.4-fpm` if a plugin is not ready for PHP 8.5.

`WORDPRESS_RUNTIME_IMAGE` is shared by the `wordpress`, `cron`, and `wp` services so WP-CLI always uses the exact same runtime image as PHP-FPM.

Production and external-service examples are available in:

- `.env.production.example`
- `.env.external.example`

## Public URL

```env
WP_HOME=http://localhost:8080
WP_SITEURL=http://localhost:8080
```

For production behind HTTPS, set both to the public HTTPS URL and set:

```env
FORCE_SSL_ADMIN=1
NGINX_ENABLE_HSTS=1
```

Only enable HSTS after the domain is permanently served over HTTPS.

## Database

MariaDB container values:

```env
MARIADB_DATABASE=wordpress
MARIADB_USER=wordpress
MARIADB_PASSWORD=...
MARIADB_ROOT_PASSWORD=...
```

WordPress values:

```env
WORDPRESS_DB_HOST=db:3306
WORDPRESS_DB_NAME=wordpress
WORDPRESS_DB_USER=wordpress
WORDPRESS_DB_PASSWORD=...
WORDPRESS_TABLE_PREFIX=wp_
```

For an external database, point `WORDPRESS_DB_HOST` at the external host and remove or ignore the local `db` service in your deployment model.

## Redis

```env
REDIS_PASSWORD=...
WP_REDIS_HOST=redis
WP_REDIS_PORT=6379
WP_REDIS_PASSWORD=...
WP_REDIS_PREFIX=vibe-wp-xxxx:
WP_CACHE_KEY_SALT=vibe-wp-xxxx:
WP_REDIS_CLIENT=phpredis
```

Use a unique `WP_REDIS_PREFIX` and `WP_CACHE_KEY_SALT` for every WordPress installation that shares a Redis server.

## PHP and PHP-FPM

PHP memory, upload limits, realpath cache, and OPcache are configured through:

```env
PHP_MEMORY_LIMIT=256M
PHP_UPLOAD_MAX_FILESIZE=128M
PHP_POST_MAX_SIZE=128M
PHP_OPCACHE_MEMORY_CONSUMPTION=256
PHP_OPCACHE_MAX_ACCELERATED_FILES=65000
```

PHP-FPM process manager values:

```env
PHP_FPM_PM=dynamic
PHP_FPM_PM_MAX_CHILDREN=24
PHP_FPM_PM_START_SERVERS=4
```

Tune `PHP_FPM_PM_MAX_CHILDREN` from real memory usage, not from CPU count alone.

## Nginx

```env
NGINX_WORKER_CONNECTIONS=4096
NGINX_KEEPALIVE_TIMEOUT=65s
NGINX_KEEPALIVE_REQUESTS=1000
NGINX_CLIENT_MAX_BODY_SIZE=128m
NGINX_CLIENT_BODY_BUFFER_SIZE=256k
NGINX_GZIP=on
NGINX_OPEN_FILE_CACHE=on
NGINX_STATIC_CACHE_CONTROL=public,max-age=2592000
NGINX_FASTCGI_CACHE_TTL=10m
NGINX_FASTCGI_REDIRECT_CACHE_TTL=1m
NGINX_FASTCGI_CACHE_INACTIVE=30m
NGINX_FASTCGI_CACHE_MAX_SIZE=1g
```

Nginx serves static files, compresses text responses, caches file metadata, and keeps a conservative FastCGI page cache for anonymous traffic. It does not cache logged-in, admin, REST, query-string, no-cache, or cart-like flows.

See [web-tier.md](web-tier.md) for the full Nginx tuning contract and the Nginx/Caddy/OpenLiteSpeed tradeoff.

## WordPress Constants

The template generates common constants from env:

- `WP_ENVIRONMENT_TYPE`
- `WP_HOME`
- `WP_SITEURL`
- `WP_CACHE`
- `DISABLE_WP_CRON`
- `DISALLOW_FILE_EDIT`
- `WP_AUTO_UPDATE_CORE`
- Redis constants

Use `WORDPRESS_CONFIG_EXTRA` only for project-specific constants not already covered.

## Content Permissions

```env
WP_CONTENT_FIX_PERMISSIONS=1
FS_CHMOD_DIR=0755
FS_CHMOD_FILE=0644
```

When enabled, the WordPress entrypoint makes `wp-content` writable by `www-data` and normalizes directories/files to non-world-writable permissions. WordPress also receives explicit `FS_CHMOD_DIR` and `FS_CHMOD_FILE` constants so upload year/month folders are created with predictable permissions. This protects uploads, plugin installs, theme installs, and Redis Object Cache drop-ins from root-owned or `777` leftovers.
