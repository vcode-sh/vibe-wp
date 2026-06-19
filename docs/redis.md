# Redis

Redis is the WordPress object-cache layer for this template. It is intentionally treated as a disposable cache, while MariaDB remains the source of truth.

## Runtime Image

The `redis` service uses a custom runtime image:

```env
REDIS_IMAGE=redis:8-alpine
REDIS_RUNTIME_IMAGE=vibe-wp-redis
```

The image renders `/usr/local/etc/redis/redis.conf` from `docker/redis/redis.conf.template` on every container start. This keeps Redis tuning visible in `.env` instead of hiding performance settings in a long Compose command line.

## Cache Profile

Default local profile:

```env
REDIS_MAXMEMORY=256mb
REDIS_MAXMEMORY_POLICY=allkeys-lfu
REDIS_MAXMEMORY_SAMPLES=10
REDIS_SAVE=
REDIS_APPENDONLY=no
```

Production starts at:

```env
REDIS_MAXMEMORY=512mb
REDIS_IO_THREADS=2
REDIS_MAXCLIENTS=20000
```

Increase `REDIS_MAXMEMORY` from real object-cache pressure and available container memory. The default policy is `allkeys-lfu` so Redis keeps frequently used WordPress objects longer than one-off keys.

Persistence is disabled by default because Redis is not authoritative data in this stack. If you deliberately use Redis for more than object cache, revisit `REDIS_SAVE` and `REDIS_APPENDONLY`.

## Latency Controls

The default Redis profile enables asynchronous freeing and active defragmentation:

```env
REDIS_LAZYFREE_LAZY_EVICTION=yes
REDIS_LAZYFREE_LAZY_EXPIRE=yes
REDIS_LAZYFREE_LAZY_SERVER_DEL=yes
REDIS_LAZYFREE_LAZY_USER_DEL=yes
REDIS_LAZYFREE_LAZY_USER_FLUSH=yes
REDIS_ACTIVE_DEFRAG=yes
```

These settings keep large evictions and deletes away from foreground WordPress requests and reduce fragmentation in long-running cache containers.

Redis 8 threaded I/O is exposed through:

```env
REDIS_IO_THREADS=1
REDIS_IO_THREADS_DO_READS=yes
```

Keep `REDIS_IO_THREADS=1` for small local stacks. Use `2` or more only when the Redis container has spare CPU cores and real network I/O pressure.

## WordPress Object Cache

WordPress receives Redis Object Cache constants from env:

```env
WP_REDIS_HOST=redis
WP_REDIS_PORT=6379
WP_REDIS_SCHEME=tcp
WP_REDIS_PASSWORD=...
WP_REDIS_DATABASE=0
WP_REDIS_PREFIX=vibe-wp:
WP_CACHE_KEY_SALT=vibe-wp:
WP_REDIS_CLIENT=phpredis
WP_REDIS_MAXTTL=604800
WP_REDIS_SELECTIVE_FLUSH=1
WP_REDIS_GRACEFUL=1
WP_REDIS_FLUSH_TIMEOUT=5
```

`WP_REDIS_MAXTTL=604800` gives no-expiration WordPress cache keys a seven-day ceiling so Redis memory stays recyclable. `WP_REDIS_SELECTIVE_FLUSH=1` keeps cache flushes scoped to the configured prefix, which is important when several sites share one Redis-compatible server. `WP_REDIS_GRACEFUL=1` avoids taking WordPress down for a transient Redis outage.

For every site sharing Redis, keep these unique:

- `WP_REDIS_PREFIX`
- `WP_CACHE_KEY_SALT`
- `WP_REDIS_DATABASE` when the Redis provider supports multiple logical databases

## MU Plugin

`content/mu-plugins/vibe-wp-redis.php` loads automatically and adds high-value global cache groups through WordPress cache APIs when the Redis object-cache drop-in is active.

Optional custom group env:

```env
VIBE_WP_REDIS_EXTRA_GLOBAL_GROUPS=
VIBE_WP_REDIS_NON_PERSISTENT_GROUPS=
VIBE_WP_REDIS_UNFLUSHABLE_GROUPS=
```

Leave these empty unless a project-specific plugin documents custom cache groups. The template does not override Redis Object Cache's built-in group lists by default.

## Inspection

Rendered Redis config:

```sh
docker compose exec redis sed -n '1,220p' /usr/local/etc/redis/redis.conf
```

Runtime Redis values:

```sh
docker compose exec redis sh -lc 'redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory maxmemory-policy io-threads activedefrag'
```

Object-cache status:

```sh
./bin/wp redis status
```

Full runtime check:

```sh
make doctor-runtime
```
