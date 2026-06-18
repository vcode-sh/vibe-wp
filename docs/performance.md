# Performance Notes

## Layers

The template uses three performance layers:

1. OPcache in PHP.
2. Redis persistent object cache for WordPress object caching.
3. Nginx FastCGI page cache for anonymous page views.

These layers solve different problems. Redis does not replace page cache, and page cache does not remove the need for object cache in admin, logged-in, and dynamic flows.

## OPcache

Defaults:

```env
PHP_OPCACHE_MEMORY_CONSUMPTION=256
PHP_OPCACHE_INTERNED_STRINGS_BUFFER=32
PHP_OPCACHE_MAX_ACCELERATED_FILES=65000
PHP_OPCACHE_VALIDATE_TIMESTAMPS=1
PHP_OPCACHE_REVALIDATE_FREQ=2
```

For immutable production images, consider:

```env
PHP_OPCACHE_VALIDATE_TIMESTAMPS=0
PHP_OPCACHE_REVALIDATE_FREQ=0
```

Do not use those values for local theme and plugin editing unless you are comfortable restarting PHP-FPM after code changes.

## PHP-FPM

Start with:

```env
PHP_FPM_PM_MAX_CHILDREN=24
```

Then measure memory per PHP-FPM child:

```sh
docker compose exec wordpress ps -o rss,comm -C php-fpm
```

The safe formula is:

```text
max_children = memory_available_for_php / average_child_memory
```

## MariaDB

The default `MARIADB_INNODB_BUFFER_POOL_SIZE=256M` is intentionally modest for local use. Increase it when the database container has enough memory.

For production durability, keep:

```env
MARIADB_INNODB_FLUSH_LOG_AT_TRX_COMMIT=1
```

Lower values can improve write throughput but reduce crash safety.

## Redis

Redis is configured as a cache:

```env
REDIS_MAXMEMORY=256mb
REDIS_MAXMEMORY_POLICY=allkeys-lru
```

If multiple sites share one Redis server, every site must use unique:

- `WP_REDIS_PREFIX`
- `WP_CACHE_KEY_SALT`

## Nginx FastCGI Cache

The cache is short-lived by default:

```env
NGINX_FASTCGI_CACHE_TTL=10m
```

This gives a visible speedup for anonymous traffic while keeping editorial changes reasonably fresh. For high-traffic sites with explicit cache purge workflows, increase the TTL.

The template skips cache for admin, login, REST API, query strings, authorization headers, logged-in cookies, comment author cookies, and common WooCommerce cart/account paths.
