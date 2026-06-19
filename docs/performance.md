# Performance Notes

## Layers

The template uses four performance layers:

1. OPcache in PHP.
2. Redis persistent object cache for WordPress object caching.
3. Nginx static file and compression tuning.
4. Nginx FastCGI page cache for anonymous page views.

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

The MariaDB service uses a rendered `/etc/mysql/conf.d/z-vibe-wp.cnf` rather than a long Compose command line. This keeps the database tuning readable and makes the active configuration easy to inspect with `my_print_defaults`.

The default `MARIADB_INNODB_BUFFER_POOL_SIZE=256M` is intentionally modest for local use. Increase it when the database container has enough memory. The production example starts at `512M`, but larger servers should size the buffer pool from real database working set and available memory.

For production durability, keep:

```env
MARIADB_INNODB_FLUSH_LOG_AT_TRX_COMMIT=1
```

Lower values can improve write throughput but reduce crash safety.

The default also increases redo log size, table metadata caches, open-file capacity, and enables buffer-pool dump/load so restarts do not always begin with a fully cold InnoDB cache. See [mariadb.md](mariadb.md).

## Redis

Redis is configured as a cache:

```env
REDIS_MAXMEMORY=256mb
REDIS_MAXMEMORY_POLICY=allkeys-lfu
WP_REDIS_MAXTTL=604800
WP_REDIS_SELECTIVE_FLUSH=1
WP_REDIS_GRACEFUL=1
```

The Redis container renders its own config file from env, disables persistence by default, enables lazy freeing, and exposes Redis 8 threaded I/O for production sizing. The WordPress side uses PhpRedis and the Redis Object Cache drop-in with a seven-day max TTL for no-expiration object-cache keys.

If multiple sites share one Redis server, every site must use unique:

- `WP_REDIS_PREFIX`
- `WP_CACHE_KEY_SALT`

See [redis.md](redis.md).

## Nginx FastCGI Cache

Nginx handles static assets directly, enables gzip for text-based responses, caches open file metadata, and uses FastCGI cache for anonymous page views.

Static file defaults:

```env
NGINX_GZIP=on
NGINX_OPEN_FILE_CACHE=on
NGINX_STATIC_CACHE_CONTROL=public,max-age=2592000
```

The page cache is short-lived by default:

```env
NGINX_FASTCGI_CACHE_TTL=10m
NGINX_FASTCGI_REDIRECT_CACHE_TTL=1m
```

This gives a visible speedup for anonymous traffic while keeping editorial changes reasonably fresh. For high-traffic sites with explicit cache purge workflows, increase the TTL.

The template skips cache for admin, login, comments, REST API, XML-RPC, query strings, no-cache requests, authorization headers, logged-in cookies, password/reset/settings cookies, comment author cookies, feeds, and common WooCommerce cart/account paths.

`fastcgi_cache_lock` is enabled to avoid stampedes when an uncached anonymous page receives concurrent traffic. `fastcgi_cache_use_stale` allows Nginx to serve a stale cached response during upstream errors, timeouts, or background updates.

See [web-tier.md](web-tier.md) for the full web-tier decision and tuning matrix.
