# Guided VPS Installer

The guided installer is the recommended path for non-technical VPS owners.

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

The public `wp.vcode.sh` host is a small static service. It serves the bootstrap script, the latest manifest, checksums, and immutable versioned installer binaries. It does not host WordPress and it does not store secrets.

Current public installer version: `0.1.2`.

Current status: usable for bootstrap verification, dry-run planning, and interactive TUI review. It is not yet certified as a completed unattended production installer. The remaining production gates are documented below and in [../todo/installer.md](../todo/installer.md).

## Safety Model

The bootstrap script:

- detects Linux CPU architecture
- downloads `manifest.json`
- selects the matching installer binary
- verifies SHA256 before execution
- forwards user arguments to the installer
- supports `VIBE_WP_INSTALLER_NO_EXEC=1` for download and verify only

The bootstrap script does not install Docker, edit host reverse-proxy configuration, clone the repository, write env files, or run Compose. Those actions happen only inside the reviewed TUI flow or through headless `--yes`.

## What The Installer Has Now

Installer `0.1.2` includes:

- integrity-checked public bootstrap through `https://wp.vcode.sh/install.sh`
- Linux x64 and arm64 release artifacts
- interactive OpenTUI/React wizard launched correctly from `curl | sh` over SSH
- clean stdout for `--dry-run`, `--version`, and automation modes
- site inventory that scans `/opt` and `/srv` for existing Vibe WP installs
- create, manage, and safe-remove flows
- per-site slugs, Compose project names, and localhost HTTP ports
- Caddy snippets under `/etc/caddy/sites-enabled/vibe-wp-<site>.caddy`
- global Caddy import management instead of overwriting the whole host Caddyfile
- DNS preflight for new installs
- blocking for placeholder domains and emails such as `example.com`
- numbered choice cards instead of cramped native selects
- a neutral dark visual pass
- masked secret fields for passwords and API keys
- typed confirmation before execution
- a real task runner wired to the interactive Execute screen
- a Manage dashboard wrapping the full `bin/vibe` operation set (health/smoke, health check & alerts, secure the server, performance, status, server checks, recent logs, config, backup, cache flush, restart, staging refresh/promote, restore, and stop)
- safe-remove tasks that back up, stop containers, and disable the site's Caddy snippet without deleting files or Docker volumes
- idempotent env-file writes so installs can be safely retried
- preservation of existing install secrets (DB/Redis passwords) on retry, keeping them in sync with the persisted Docker volumes
- an editable Performance screen: pick a preset, or turn on Customize to edit any individual setting (PHP/WP memory, PHP-FPM pool, Redis, MariaDB buffer pool, Nginx cache) and the assumed server memory; the PHP-FPM pool is auto-clamped so no edit can produce an invalid, crash-looping config
- secure-by-default **server hardening** as the final install step: a System screen "Secure the server" toggle (on by default) runs `./bin/harden` to set up the `ufw` firewall (allowing SSH + 80/443 before enabling), fail2ban, automatic security updates, and safe `sysctl` defaults. Opt out with `--no-harden` (it is also disabled by `--no-host-install`). The Manage dashboard exposes it via the **Secure the server** action. See [operations.md](operations.md)
- built-in **health monitoring**: an hourly systemd service + timer named `vibe-wp-monitor-<slug>-<env>` (on by default) runs `./bin/vibe <env> monitor --quiet` to check HTTP uptime, disk space, TLS expiry, backup freshness, and container health, sending Telegram/webhook/email alerts on failure when configured. The guided flow has a **Monitoring** screen to enable it and enter alert channels (email, webhook, Telegram). Opt out with `--no-monitor`; preseed alert channels with `--monitor-email <addr>`, `--monitor-webhook <url>`, and `--monitor-telegram-token/-chat`. The Manage dashboard runs it on demand via **Health check & alerts**. See the checks and `VIBE_MONITOR_*` keys in [operations.md](operations.md)
- a Backup screen offering three destinations: **Manual** (no automatic backups), **Local backups** (a backup folder created on install, with retention and an optional schedule), and **Local + Cloudflare R2** (also copy each backup off-server). Choosing R2 collects the R2 account ID, access key ID, secret access key, and bucket. On install it creates the backup folder (`install -d -m 0750`), installs rclone when R2 is enabled and host installs are allowed, runs a first backup, and — when a daily or weekly schedule is chosen — installs a systemd service + timer named `vibe-wp-backup-<slug>-<env>` that runs `./bin/vibe <env> backup`. See the engine, retention, and env keys in [operations.md](operations.md)

## Installer Modes

The first screen offers these intents (the menu only shows manage/remove/update/staging-only when existing Vibe WP sites are detected):

- **Create a new WordPress** (`new-site`) — full guided install: production, optional staging, isolated ports, and tuned env files. Fully working and validated on a disposable VPS.
- **Manage detected site** (`manage-existing`) — a dashboard that runs status, health/smoke, performance, logs, backup, cache, restart, staging, restore, and stop actions against a detected site. See the dashboard mapping in [operations.md](operations.md).
- **Remove detected site** (`remove-existing`) — creates a safety backup, stops containers, and disables the site's Caddy snippet without deleting files or Docker volumes.
- **Update existing checkout** (`update-existing`) — fast-forwards the existing repository and rebuilds/restarts production in place, without touching data.
- **Create staging only** (`staging-only`) — attaches an isolated staging environment to an existing production site.
- **Use external database and Redis** (`external-services`) — bring-your-own MariaDB and Redis: only WordPress and Nginx (plus cron) run in Docker. After the Domain screen the flow collects external Database details (host:port, name, user, password, charset, table prefix) and external Redis details (host, port, password, database, scheme) on dedicated screens, then writes `env/external.env` and runs the install via `./bin/vibe external ...`. There is no bundled staging step in this mode. Validated end-to-end on a real VPS (2026-06-20): HTTPS site, only `wordpress`/`nginx`/`cron` containers running, WordPress data in the external MariaDB, and the object cache connected to the external Redis.

## Headless And CLI Flags

The installer accepts these arguments (see `installer/src/cli/args.ts`):

Value flags:

- `--domain <host>` — production domain (also derives the slug, ports, staging domain, and a guessed site title)
- `--admin-email <email>` — WordPress admin email
- `--staging-domain <host>` — staging domain (enables staging)
- `--mode <mode>` — `new-site`, `manage-existing`, `remove-existing`, `update-existing`, `staging-only`, or `external-services`
- `--ext-db-host <host:port>` — external MariaDB/MySQL host (external-services mode)
- `--ext-db-name <name>` — external database name
- `--ext-db-user <user>` — external database user
- `--ext-db-password <password>` — external database password
- `--ext-redis-host <host>` — external Redis host
- `--ext-redis-port <port>` — external Redis port
- `--ext-redis-password <password>` — external Redis password
- `--backup-dir <path>` — local backup root for the chosen site
- `--backup-schedule <off|daily|weekly>` — install a systemd timer that runs backups on this cadence (default off)
- `--r2-account <id>` — Cloudflare R2 account ID (builds the endpoint `https://<id>.r2.cloudflarestorage.com`)
- `--r2-access-key <id>` — R2 access key ID
- `--r2-secret <key>` — R2 secret access key
- `--r2-bucket <name>` — R2 bucket for off-server backups

  Any `--r2-*` flag opts into off-server backups (sets the backup policy and enables R2).

- `--monitor-email <addr>` — preseed `VIBE_MONITOR_EMAIL_TO` so the hourly health monitor sends email alerts
- `--monitor-webhook <url>` — preseed `VIBE_MONITOR_WEBHOOK_URL` so the hourly health monitor POSTs JSON alerts
- `--monitor-telegram-token <token>` / `--monitor-telegram-chat <id>` — preseed Telegram alert credentials
- `--install-dir <path>` — install directory, default `/opt/vibe-wp`
- `--repo <url>` / `--ref <ref>` — Vibe WP git repository and branch/tag (default `main`)
- `--perf KEY=VALUE` — override a single performance setting (repeatable), e.g. `--perf REDIS_MAXMEMORY=512mb --perf PHP_FPM_PM_MAX_CHILDREN=24`. Recognised keys match the Performance screen; the PHP-FPM pool is always clamped to a valid shape (`min_spare ≤ max_spare ≤ max_children`) so an override cannot crash the container
- `--export-plan <file>` — write the computed install plan to a JSON file and exit
- `--headless <file>` — run from a prepared plan JSON file (pair with `--yes` to execute host changes)

Boolean flags:

- `--headless-json` — read the plan JSON from stdin instead of a file
- `--dry-run` — plan without making host changes
- `--yes` — confirm and execute host changes non-interactively
- `--local` — use the safe macOS local sandbox (UI/UX and planner work only)
- `--no-www` — do not add a `www.` alias or require its DNS
- `--no-caddy` — do not manage Caddy
- `--no-host-install` — do not install missing host packages (also disables server hardening)
- `--no-harden` — skip the secure-by-default server hardening step
- `--no-monitor` — do not install the hourly health-monitoring systemd timer
- `--compact` — force the compact UI layout
- `--ascii` — avoid Unicode UI characters (SSH/legacy terminals)
- `--version` — print the installer version
- `-h`, `--help` — print usage

All host-changing actions stay behind the reviewed TUI flow or an explicit `--yes`.

## What The Installer Does Not Have Yet

The installer is not complete until these gaps are closed:

- persistent state, resumable execution, and install logs under `.vibe-installer/`
- support bundle export with redacted logs and detected host facts
- first-class modal/dialog layers for destructive actions, failure recovery, and advanced overrides
- full-delete mode for intentionally removing files and Docker volumes
- terminal snapshot checks for wide, medium, compact, and emergency layouts
- real production install proof on a disposable Ubuntu 26.04 VPS with a real domain
- real production-plus-staging install proof on a disposable Ubuntu 26.04 VPS with real domains
- post-install proof for WordPress Site Health REST and loopback checks
- post-install proof for uploads year/month directory creation
- post-install proof for Redis Object Cache connectivity
- post-install proof for FastCGI cache `HIT`

## Production Readiness Gate

Do not mark the installer complete or recommend unattended `--headless --yes` production usage until all of these are true:

- the user can install a production WordPress site from a clean Ubuntu 26.04 VPS without reading Docker documentation
- the same flow can add staging with isolated domains, ports, project names, volumes, and secrets
- every privileged host change appears in review before execution
- interruption can be resumed from `.vibe-installer/state.json`
- failures show plain-English next steps and allow retry or support bundle export
- secrets are redacted from UI, logs, plans, summaries, and support bundles
- the TUI has been visually checked on real SSH terminals, not only local terminal sessions

## Local macOS Testing

The installer can be run locally on macOS for UI/UX and core-flow testing:

```sh
cd installer
bun run dev:local
```

Useful local commands:

```sh
cd installer
bun run dry-run:local
bun run export-plan:local
bun run src/main.tsx --local --compact
```

Local mode:

- uses deterministic fake host facts instead of probing a real VPS
- shows sample existing Vibe WP sites under `installer/.vibe-local/`
- defaults new installs to `installer/.vibe-local/sites/demo-vibe-local`
- disables Docker and Caddy package installation tasks
- marks the generated plan with `localSandbox: true`
- simulates task execution even when the UI reaches the Execute step
- does not write `/opt`, `/srv`, `/etc/caddy`, env files, or Docker volumes

Local mode is for UI and planner development only. It does not replace disposable VPS proof for real production installs, staging installs, DNS, uploads, Redis Object Cache, FastCGI cache, or WordPress Site Health checks.

## Useful Commands

Run the guided installer:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

Download and verify without executing:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh
```

Run a specific installer version:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --installer-version 0.1.2
```

Use a staging installer host:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_BASE_URL=https://staging.wp.vcode.sh sh
```

## Release Flow

Create a release by pushing a tag:

```sh
git tag installer-v0.1.2
git push origin installer-v0.1.2
```

The release workflow:

1. installs Bun dependencies
2. runs `bun run quality`
3. compiles Linux x64 and arm64 installer binaries
4. builds `public-install/site`
5. uploads release assets
6. force-publishes the generated static host to the `dokploy/wp-vcode-bootstrap` branch

Installer binaries are published as gzip-compressed downloads. The bootstrap script verifies the compressed download checksum, extracts the binary, and verifies the executable checksum before running it.

## Dokploy

Use a Dokploy application, not Compose, for `wp.vcode.sh`.

Dokploy owns the public layer: Traefik routers, HTTP to HTTPS redirect, Let's Encrypt certificate, and the domain mapping. The container must not run its own TLS proxy. It only needs to serve static files over plain HTTP on the internal port configured in the Dokploy domain.

Recommended settings:

- source type: GitHub
- repository: `vcode-sh/vibe-wp`
- branch: `dokploy/wp-vcode-bootstrap`
- build path: `/`
- build type: Dockerfile
- Dockerfile: `Dockerfile`
- internal port: `8080`
- domain: `wp.vcode.sh`
- HTTPS: enabled
- memory limit: 128 MB
- CPU limit: 0.25
- volumes: none
- secrets: none

The deploy branch is generated by GitHub Actions and should not be edited by hand. Dokploy should auto-deploy on push to this branch.

Current production Dokploy target:

- project: `wp vcode`
- project ID: `CG0xv7dCV4c5rdBCZOEYn`
- environment: `production`
- environment ID: `i4R7pSm4G7A0e2MHP3DVG`
- application: `wp-vcode-bootstrap`
- application ID: `M0RhmNczoK7D9mBMoG9_G`
- Dokploy app name: `wp-vcode-bootstrap-ig5k8g`
- domain ID: `BcoinbnHY75vP2e-aK5D-`
