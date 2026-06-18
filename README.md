# vibe-wp

`vibe-wp` is a modern WordPress Docker template built for a fast, modular, production-shaped local stack:

- WordPress 7.0 on PHP-FPM.
- Nginx with FastCGI page cache for anonymous traffic.
- MariaDB LTS with health checks and WordPress-oriented defaults.
- Redis object cache with the PhpRedis extension.
- Separate runtime surfaces for uploads, plugins, themes, and MU plugins.
- Dedicated cron worker instead of request-triggered WP-Cron.
- WP-CLI, Adminer, backup tooling, and configuration from `.env`.

## Quick Start

```sh
make init
make up
make install
```

Open:

- WordPress: http://localhost:8080
- Adminer: `make tools`, then http://localhost:8081

The generated `.env` contains database passwords, Redis password, WordPress salts, and a local admin password. The admin values are printed by `make install`.

## Repository Layout

```text
bin/                 operational scripts
content/uploads/     persistent media uploads
content/plugins/     persistent plugins
content/themes/      persistent themes
content/mu-plugins/  persistent MU plugins
docker/nginx/        Nginx image, cache, and server config
docker/redis/        Redis cache config
docker/wordpress/    WordPress PHP-FPM image and runtime config
docs/                architecture, configuration, operations, research
```

## Daily Commands

```sh
make ps
make logs
make wp ARGS="plugin list"
./bin/wp user list
make wp-info
make doctor-runtime
make smoke
make cache-enable
make backup
make restore BACKUP=backups/<timestamp> ARGS="--yes"
make down
```

WP-CLI runs inside the same WordPress runtime image as PHP-FPM, with the same `.env`, network, database, Redis, and `wp-content` mounts. See [docs/wp-cli.md](docs/wp-cli.md).

## Configuration Philosophy

The stack is configured by `.env`, not by editing container files. The main switch points are:

- `WORDPRESS_IMAGE` for the WordPress/PHP baseline.
- `MARIADB_IMAGE` for the database LTS line.
- `REDIS_IMAGE` for the Redis major line.
- PHP, PHP-FPM, Nginx, MariaDB, Redis, and WordPress constants through explicit env values.

See [docs/configuration.md](docs/configuration.md) for the complete contract.

## Deployment Modes

- Local/dev: `docker compose up -d --build`
- Production volume preset: `docker compose -f compose.yaml -f compose.prod.yaml up -d --build`
- External MariaDB/Redis preset: `docker compose -f compose.external.yaml up -d --build`

See [docs/deployment.md](docs/deployment.md).

## Research Baseline

The defaults are based on current upstream guidance as of June 18, 2026:

- WordPress release archive lists 7.0 as the latest active series.
- WordPress requirements recommend PHP 8.3+ and MariaDB 10.6+ or MySQL 8.0+.
- WordPress 7.0 is compatible with PHP 8.5, 8.4, and 8.3 in the official compatibility matrix.
- The official WordPress Docker image supports env-driven `wp-config.php` values and `WORDPRESS_CONFIG_EXTRA`.
- MariaDB official images expose the `lts` line and `healthcheck.sh`.
- Redis Object Cache documents `WP_REDIS_*` constants and supports PhpRedis.

Full notes and source links are in [docs/research.md](docs/research.md).
