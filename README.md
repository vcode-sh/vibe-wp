# vibe-wp

`vibe-wp` is a modern WordPress Docker template built for a fast, modular, production-shaped local stack:

- WordPress 7.0 on PHP-FPM.
- Nginx with FastCGI page cache for anonymous traffic.
- MariaDB LTS with rendered WordPress-oriented performance config.
- Redis 8 object cache with a rendered performance config and the PhpRedis extension.
- WordPress 7.0 AI plugin and default Anthropic, Google, and OpenAI connector plugins.
- Separate runtime surfaces for uploads, plugins, themes, and MU plugins.
- Dedicated cron worker instead of request-triggered WP-Cron.
- Environment-aware WP-CLI, Adminer, backup/restore, staging refresh, and managed WordPress workflows.

## Quick Start

If you are not technical, start with [docs/quick-start-for-site-owners.md](docs/quick-start-for-site-owners.md). It explains local use, VPS setup, staging, backups, and safe plugin/theme updates without Docker internals.

For a new Ubuntu VPS, the guided installer is the intended path:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

```sh
make init
make up
make install
```

Open:

- WordPress: http://localhost:8080
- Adminer: `make tools`, then http://localhost:8081

The generated `.env` contains database passwords, Redis password, WordPress salts, and a local admin password. The admin values are printed by `make install`.

`make install` also installs the baseline plugins, activates the WordPress AI connector plugins, enables Redis Object Cache, and removes Hello Dolly plus old bundled default themes.

## Repository Layout

```text
bin/                 operational scripts
content/uploads/     persistent media uploads
content/plugins/     persistent plugins
content/themes/      persistent themes
content/mu-plugins/  persistent MU plugins
docker/nginx/        Nginx image, cache, compression, and server config
docker/mariadb/      MariaDB image and env-rendered database config
docker/redis/        Redis image and env-rendered cache config
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
make restore BACKUP=backups/local/<timestamp> ARGS="--yes"
./bin/vibe stage refresh-from-prod --yes
./bin/vibe stage promote-files-to-prod --yes
make down
```

WP-CLI runs inside the same WordPress runtime image as PHP-FPM, with the same `.env`, network, database, Redis, and `wp-content` mounts. See [docs/wp-cli.md](docs/wp-cli.md).

## Configuration Philosophy

The stack is configured by `.env`, not by editing container files. The main switch points are:

- `WORDPRESS_IMAGE` for the WordPress/PHP baseline.
- `MARIADB_IMAGE` for the database LTS line.
- `MARIADB_RUNTIME_IMAGE` for the rendered database runtime image.
- `REDIS_IMAGE` for the Redis major line.
- `REDIS_RUNTIME_IMAGE` for the rendered Redis runtime image.
- PHP, PHP-FPM, Nginx, MariaDB, Redis, and WordPress constants through explicit env values.

See [docs/configuration.md](docs/configuration.md) for the complete contract, [docs/web-tier.md](docs/web-tier.md) for the Nginx performance model, [docs/mariadb.md](docs/mariadb.md) for database tuning, and [docs/redis.md](docs/redis.md) for Redis tuning.

## Deployment Modes

- Local/dev: `docker compose up -d --build`
- Production volume preset: `./bin/vibe prod up`
- Staging volume preset: `./bin/vibe stage up`
- External MariaDB/Redis preset: `./bin/vibe external up`

See [docs/deployment.md](docs/deployment.md) and [docs/staging.md](docs/staging.md).

## Guided VPS Installer

The public installer host is served from `wp.vcode.sh`. It downloads a versioned Linux installer binary, verifies SHA256, and then opens the guided terminal UI.

Current installer version: `0.1.2`. It is usable for bootstrap verification, dry-run planning, and TUI review, but it is not yet the completed production installer. See [docs/installer.md](docs/installer.md) for current capabilities, production readiness gates, release workflow, and Dokploy deployment model.

For local macOS UI/core testing without touching a VPS:

```sh
cd installer
bun run dev:local
```

## Research Baseline

The defaults are based on current upstream guidance as of June 18, 2026:

- WordPress release archive lists 7.0 as the latest active series.
- WordPress requirements recommend PHP 8.3+ and MariaDB 10.6+ or MySQL 8.0+.
- WordPress 7.0 is compatible with PHP 8.5, 8.4, and 8.3 in the official compatibility matrix.
- The official WordPress Docker image supports env-driven `wp-config.php` values and `WORDPRESS_CONFIG_EXTRA`.
- MariaDB official images expose the `lts` line and `healthcheck.sh`.
- Redis 8 exposes configurable memory policies and threaded I/O, while Redis Object Cache documents `WP_REDIS_*` constants and supports PhpRedis.

Full notes and source links are in [docs/research.md](docs/research.md).
