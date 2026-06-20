```
██╗   ██╗██╗██████╗ ███████╗   ██╗    ██╗██████╗
██║   ██║██║██╔══██╗██╔════╝   ██║    ██║██╔══██╗
██║   ██║██║██████╔╝█████╗     ██║ █╗ ██║██████╔╝
╚██╗ ██╔╝██║██╔══██╗██╔══╝     ██║███╗██║██╔═══╝
 ╚████╔╝ ██║██████╔╝███████╗   ╚███╔███╔╝██║
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝    ╚══╝╚══╝ ╚═╝

  Managed WordPress on Docker, tuned for VPS production.
```

# vibe-wp

`vibe-wp` is a modern WordPress Docker template built for a fast, modular, production-shaped local stack:

- WordPress 7.0 on PHP-FPM.
- Nginx with FastCGI page cache for anonymous traffic.
- MariaDB LTS with rendered WordPress-oriented performance config.
- Redis 8 object cache with a rendered performance config and the PhpRedis extension.
- WordPress 7.0 AI plugin and default Anthropic, Google, and OpenAI connector plugins.
- Separate runtime surfaces for uploads, plugins, themes, and MU plugins.
- Dedicated cron worker instead of request-triggered WP-Cron.
- Environment-aware WP-CLI, Adminer, staging refresh, and managed WordPress workflows.
- Backup and restore with retention, plus optional off-server backups to Cloudflare R2 (via rclone) on a daily or weekly schedule; restore auto-fetches a missing backup from R2.

## Quick Start

If you are not technical, start with [docs/quick-start-for-site-owners.md](docs/quick-start-for-site-owners.md). It explains local use, VPS setup, staging, backups, and safe plugin/theme updates without Docker internals.

For a new Ubuntu/Debian VPS, the guided installer is the intended path. It walks you through a new site and shows the exact plan before changing anything:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

See [Guided VPS Installer](#guided-vps-installer) below for what it does, the management dashboard, and headless flags.

To run the stack directly on your own machine:

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
./bin/vibe local logs-recent
./bin/vibe local backups
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

For a fresh Ubuntu/Debian VPS, the guided installer is the intended path. The public installer host is served from `wp.vcode.sh`: the one-liner downloads a versioned Linux installer binary, verifies its SHA256, and opens a guided terminal UI (a Bun + React/OpenTUI app).

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

The installer never changes the server without first showing the exact plan for review (or you pass `--yes` for a headless run). What it does on a new site:

- installs missing host packages (Docker, Caddy) unless you opt out
- writes per-site env files with generated secrets and isolated ports, so several sites coexist on one host
- brings the Docker stack up and runs the WordPress install
- configures Caddy as the reverse proxy with automatic HTTPS (Let's Encrypt)
- optionally sets up a staging site on a separate domain

A site built this way has been validated live on a real VPS: HTTPS via Caddy + Let's Encrypt, WordPress 7.0, Redis Object Cache active, Nginx FastCGI cache reaching `HIT`, and multiple sites coexisting on one host.

### Installer modes

The installer opens with a menu of intents:

- **Create a new WordPress** — production, optional staging, isolated ports, tuned env files. This is the fully working, VPS-validated path.
- **Manage detected site** — opens a management dashboard for an already-installed site (see below).
- **Remove detected site** — makes a safety backup, then stops containers without deleting data.
- **Update existing checkout** — keeps the current directory and refreshes config.
- **Create staging only** — attaches a staging site to an existing production site.
- **Use external database and Redis** — bring your own MariaDB and Redis; only WordPress and Nginx run in Docker. The installer collects your external database and Redis connection details, writes `env/external.env`, and drives the install via `./bin/vibe external`. VPS-validated end-to-end.

### Management dashboard

"Manage detected site" is a control panel that runs read-and-maintain operations against a detected site, each backed by a `bin/vibe` command and grouped from safest to most dangerous:

- **Check on it** — check it's healthy (`smoke`), speed report (`perf-report`), what's running (`ps`), check the server (`doctor-runtime`), recent logs (`logs-recent`), double-check settings (`config`).
- **Maintain** — back up now (`backup` — kept in a local folder with retention, and copied off-server to Cloudflare R2 when enabled), clear the cache (`cache-flush`), restart the site (`restart`).
- **Staging** (shown when staging exists) — copy live to staging (`refresh-from-prod`), publish staging to live (`promote-files-to-prod`).
- **Danger zone** — restore a backup (`restore`), stop the site (`down`).

### Headless / non-interactive use

The installer accepts flags for scripted runs. The main ones:

```text
--domain <host>          Production domain (derives slug, ports, staging, title)
--admin-email <email>    WordPress admin email
--mode <mode>            new-site | manage-existing | remove-existing |
                         update-existing | staging-only | external-services
--ext-db-host <host>     External MariaDB/MySQL host:port (external-services)
--ext-db-name <name>     External database name
--ext-db-user <user>     External database user
--ext-db-password <pw>   External database password
--ext-redis-host <host>  External Redis host
--ext-redis-port <port>  External Redis port
--ext-redis-password <pw> External Redis password
--staging-domain <host>  Staging domain (enables staging)
--no-www                 Do not add a www. alias or require its DNS
--no-caddy               Do not manage Caddy
--no-host-install        Do not install missing host packages
--install-dir <path>     Install directory, default /opt/vibe-wp
--repo <url> / --ref <r> Source repository and branch/tag
--yes                    Run without the interactive review step
--dry-run                Plan only, make no host changes
--export-plan <file>     Write the computed install plan to a JSON file
--headless <plan.json>   Execute a previously exported plan
--headless-json          Read a plan from stdin
--local                  Safe local sandbox for macOS/UI testing
--compact / --ascii      Force compact UI / avoid Unicode characters
```

See [docs/installer.md](docs/installer.md) for current capabilities, release workflow, and deployment model.

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
