# Deployment Modes

## Local Development

Use the default stack:

```sh
make init
make up
make install
make smoke
```

This mode uses:

- bind-mounted `./content`
- local MariaDB
- local Redis
- optional Adminer through `make tools`

## Production Preset

Use the production override when the stack should manage MariaDB and Redis locally, but `wp-content` should live in a Docker named volume instead of the repository checkout:

```sh
cp .env.production.example .env
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

The production override changes:

- `wp-content` from `./content` bind mount to `wp_content` named volume
- `WP_ENVIRONMENT_TYPE=production`
- `FORCE_SSL_ADMIN=1`
- `NGINX_ENABLE_HSTS=1`
- `PHP_OPCACHE_VALIDATE_TIMESTAMPS=0`
- `PHP_OPCACHE_REVALIDATE_FREQ=0`

Only enable HSTS after the public HTTPS domain is permanently configured.

## External MariaDB And Redis

Use the external stack when MariaDB and Redis are provided by a hosting platform, Dokploy services, a managed database, or another Compose project:

```sh
cp .env.external.example .env
docker compose -f compose.external.yaml up -d --build
```

This mode includes only:

- `nginx`
- `wordpress`
- `cron`
- optional `wp` tools profile

It expects:

- `WORDPRESS_DB_HOST`
- `WORDPRESS_DB_NAME`
- `WORDPRESS_DB_USER`
- `WORDPRESS_DB_PASSWORD`
- `WP_REDIS_HOST`
- `WP_REDIS_PREFIX`
- `WP_CACHE_KEY_SALT`

Use a unique Redis prefix and cache salt for every site sharing the same Redis-compatible server.

## Validation

After deploy:

```sh
make doctor-runtime
make smoke
```

For production override config validation:

```sh
make config-prod
```

For external stack validation:

```sh
make config-external
```
