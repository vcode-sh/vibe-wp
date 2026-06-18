# MariaDB

## Runtime Model

The database service uses a thin `vibe-wp-mariadb` image on top of the official MariaDB image.

The custom layer only does one thing: it renders `/etc/mysql/conf.d/z-vibe-wp.cnf` from environment variables, then delegates to the official `/usr/local/bin/docker-entrypoint.sh`.

This keeps official MariaDB initialization, upgrade, healthcheck, and data-directory behavior intact while making WordPress-oriented server tuning explicit and versioned in this repository.

## WordPress Baseline

The default profile is tuned for a single WordPress site with PHP-FPM, Redis object cache, and Nginx page cache in the same Compose project:

```env
MARIADB_CHARACTER_SET_SERVER=utf8mb4
MARIADB_COLLATION_SERVER=utf8mb4_unicode_ci
MARIADB_MAX_ALLOWED_PACKET=256M
MARIADB_MAX_CONNECTIONS=150
MARIADB_TABLE_OPEN_CACHE=4000
MARIADB_TABLE_DEFINITION_CACHE=2000
MARIADB_OPEN_FILES_LIMIT=65535
```

The production override increases selected values:

```env
MARIADB_MAX_CONNECTIONS=200
MARIADB_TABLE_OPEN_CACHE=8000
MARIADB_TABLE_DEFINITION_CACHE=4000
```

Do not set `MARIADB_MAX_CONNECTIONS` from CPU count alone. It should be larger than expected PHP-FPM concurrency, cron, WP-CLI, and operational clients, but not so high that per-connection buffers can exhaust memory.

## InnoDB

Default local values:

```env
MARIADB_INNODB_BUFFER_POOL_SIZE=256M
MARIADB_INNODB_LOG_FILE_SIZE=256M
MARIADB_INNODB_LOG_BUFFER_SIZE=16M
MARIADB_INNODB_FLUSH_LOG_AT_TRX_COMMIT=1
MARIADB_INNODB_LINUX_AIO=aio
MARIADB_INNODB_FLUSH_NEIGHBORS=0
MARIADB_INNODB_IO_CAPACITY=400
MARIADB_INNODB_IO_CAPACITY_MAX=2000
MARIADB_INNODB_READ_IO_THREADS=4
MARIADB_INNODB_WRITE_IO_THREADS=4
MARIADB_INNODB_PURGE_THREADS=4
```

Production example values:

```env
MARIADB_INNODB_BUFFER_POOL_SIZE=512M
MARIADB_INNODB_LOG_FILE_SIZE=512M
MARIADB_INNODB_IO_CAPACITY=1000
MARIADB_INNODB_IO_CAPACITY_MAX=4000
```

`MARIADB_INNODB_FLUSH_LOG_AT_TRX_COMMIT=1` is intentionally the default. It favors crash safety over benchmark-only write speed. Use `2` only when the deployment can tolerate losing the last second of committed transactions after an OS or host crash.

`MARIADB_INNODB_LINUX_AIO=aio` keeps native Linux AIO enabled while avoiding noisy `io_uring` fallback warnings on Docker Desktop and restricted container hosts. Set it to `auto` only when the host is configured to allow `io_uring`.

## Temporary Tables And Per-Connection Memory

```env
MARIADB_TMP_TABLE_SIZE=64M
MARIADB_MAX_HEAP_TABLE_SIZE=64M
MARIADB_SORT_BUFFER_SIZE=2M
MARIADB_JOIN_BUFFER_SIZE=2M
MARIADB_READ_BUFFER_SIZE=1M
MARIADB_READ_RND_BUFFER_SIZE=2M
MARIADB_ARIA_PAGECACHE_BUFFER_SIZE=128M
```

`tmp_table_size` and `max_heap_table_size` should usually match. Internal memory temporary tables are limited by the lower of those two values. Raising them can help expensive admin/reporting queries, but they are not a free global cache; memory use can grow with concurrent sessions.

## Hot Cache Startup

```env
MARIADB_INNODB_BUFFER_POOL_DUMP_AT_SHUTDOWN=ON
MARIADB_INNODB_BUFFER_POOL_LOAD_AT_STARTUP=ON
MARIADB_INNODB_BUFFER_POOL_DUMP_PCT=25
```

This lets MariaDB persist a lightweight map of hot buffer-pool pages and reload it on startup, reducing cold-cache behavior after restarts.

## Diagnostics

Diagnostics default to low overhead:

```env
MARIADB_PERFORMANCE_SCHEMA=OFF
MARIADB_SLOW_QUERY_LOG=OFF
MARIADB_LONG_QUERY_TIME=2
MARIADB_MIN_EXAMINED_ROW_LIMIT=100
MARIADB_LOG_QUERIES_NOT_USING_INDEXES=OFF
```

For a focused production investigation, enable:

```env
MARIADB_SLOW_QUERY_LOG=ON
MARIADB_LONG_QUERY_TIME=1
```

Avoid leaving `MARIADB_LOG_QUERIES_NOT_USING_INDEXES=ON` for normal WordPress traffic. It can produce noisy logs for legitimate queries.

## Verification

Print the rendered server defaults:

```sh
docker compose exec db my_print_defaults --mysqld
```

Check active variables:

```sh
docker compose exec db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "SHOW VARIABLES WHERE Variable_name IN (\"innodb_buffer_pool_size\", \"innodb_log_file_size\", \"table_open_cache\", \"tmp_table_size\", \"slow_query_log\");"'
```

Run the runtime doctor:

```sh
make doctor-runtime
```

## Sources

- https://hub.docker.com/_/mariadb
- https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/using-healthcheck-sh
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/mariadb-enterprise-server-innodb-operations/configure-the-innodb-buffer-pool
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/mariadb-enterprise-server-innodb-operations/configure-the-innodb-redo-log
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-redo-log
- https://mariadb.com/docs/server/ha-and-performance/mariadb-memory-allocation
