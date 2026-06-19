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
make init-prod
./bin/vibe prod up
```

The production override changes:

- `wp-content` from `./content` bind mount to `wp_content` named volume
- `WP_ENVIRONMENT_TYPE=production`
- `FORCE_SSL_ADMIN=1`
- `NGINX_ENABLE_HSTS=1`
- `WP_AUTO_UPDATE_CORE=false`
- `PHP_OPCACHE_VALIDATE_TIMESTAMPS=1`
- `PHP_OPCACHE_REVALIDATE_FREQ=60`

Only enable HSTS after the public HTTPS domain is permanently configured.

Production uses managed WordPress mode: plugins and themes can be updated in wp-admin, while WordPress core is upgraded by changing `WORDPRESS_IMAGE` and rebuilding the stack.

## Staging Preset

Use staging as a second isolated Compose project on the same VPS:

```sh
make init-stage
./bin/vibe stage up
./bin/vibe stage install
```

Then refresh staging from production:

```sh
./bin/vibe stage refresh-from-prod --yes
```

Staging uses:

- `COMPOSE_PROJECT_NAME=vibe-wp-stage`
- its own database volume
- its own Redis volume
- its own `wp_content` volume
- `WP_ENVIRONMENT_TYPE=staging`
- noindex and outbound-mail safeguards

See [staging.md](staging.md).

## External MariaDB And Redis

Use the external stack when MariaDB and Redis are provided by a hosting platform, Dokploy services, a managed database, or another Compose project:

```sh
cp env/external.env.example env/external.env
./bin/vibe external up
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

Environment-aware validation:

```sh
./bin/vibe prod smoke
./bin/vibe stage smoke
```

For production override config validation:

```sh
make config-prod
```

For external stack validation:

```sh
make config-external
```
