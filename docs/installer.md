# Guided VPS Installer

Current installer version in this checkout: `0.1.5`.

The guided installer is the recommended path for a single-server Vibe WP install:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

`wp.vcode.sh` serves the bootstrap script, manifest, checksums, and immutable
versioned installer binaries. It does not host WordPress and does not store
secrets.

## Current Status

Shipped in live code:

- OpenTUI/React guided installer.
- Headless JSON/core execution.
- `--dry-run`, `--export-plan`, `--headless`, `--headless-json`, `--resume`,
  `--support-bundle`, and local sandbox mode.
- Persistent `.vibe-installer/state.json`, `install.log`, and `summary.txt`.
- Redacted support bundles with host facts, journal files, and redacted plan.
- Final Execute summary and failure recovery commands without secrets.
- Advanced override checkpoint in Review for DNS override, disabled host/Caddy/
  www/hardening/monitoring, full delete, and custom performance overrides.
- Automated terminal layout fixtures for wide `120x40`, medium `92x30`,
  compact `80x24`, and emergency `60x18`.
- Local workflow blueprint CLI for `.vibe-local` inventory/create/reset/delete.

Validated on VPS:

- 2026-06-20: new-site install, manage dashboard, remove-existing with purge,
  update-existing, staging-only, external-services, backups, monitoring,
  hardening, resume, and support bundle.
- 2026-06-26: panel install/update rollback/support bundle, fresh production
  plus staging install, staging refresh, safe push-to-live, uploads, Redis
  Object Cache, REST/loopback smoke, and FastCGI cache HIT.

## Safety Model

The bootstrap script:

- detects Linux CPU architecture
- downloads `manifest.json`
- selects the matching installer binary
- verifies SHA256 before execution
- forwards user arguments to the installer
- supports `VIBE_WP_INSTALLER_NO_EXEC=1` for download and verify only

The bootstrap script does not install Docker, edit host reverse-proxy config,
clone the repository, write env files, or run Compose. Those actions happen only
inside the reviewed TUI flow or through headless `--yes`.

All host-changing actions stay behind reviewed TUI confirmation or explicit
headless `--yes`. Secrets are redacted from UI, logs, plans, summaries, and
support bundles.

## Installer Modes

- `new-site` — guided production install with optional staging, isolated ports,
  tuned env files, backups, monitoring, and hardening.
- `manage-existing` — dashboard for detected Vibe WP sites: status, smoke,
  performance, logs, config, backup, restore, cache flush, restart, staging
  refresh/promote, hardening, and stop.
- `remove-existing` — safety backup, stop containers, and disable the site's
  Caddy route. Add `--purge` for full delete after backup.
- `update-existing` — update checkout and rebuild/restart production in place
  without touching data.
- `staging-only` — attach isolated staging to an existing live site with its own
  Caddy snippet and DNS preflight against the staging domain only.
- `external-services` — bring-your-own MariaDB and Redis; WordPress/Nginx/cron
  run in Docker.
- `shared-db` — WordPress/Nginx/per-site Redis with a host-level shared MariaDB
  service.
- `panel-bootstrap` — install the web control panel.

## CLI Flags

Value flags:

- `--domain <host>`
- `--admin-email <email>`
- `--admin-password <password>`
- `--staging-domain <host>`
- `--mode <mode>`
- `--install-dir <path>`
- `--repo <url>` / `--ref <ref>`
- `--backup-dir <path>`
- `--backup-schedule <off|daily|weekly>`
- `--r2-account <id>`
- `--r2-access-key <id>`
- `--r2-secret <key>`
- `--r2-bucket <name>`
- `--monitor-email <addr>`
- `--monitor-webhook <url>`
- `--monitor-telegram-token <token>`
- `--monitor-telegram-chat <id>`
- `--ext-db-host <host:port>`
- `--ext-db-name <name>`
- `--ext-db-user <user>`
- `--ext-db-password <password>`
- `--ext-redis-host <host>`
- `--ext-redis-port <port>`
- `--ext-redis-password <password>`
- `--perf KEY=VALUE` (repeatable)
- `--export-plan <file>`
- `--headless <file>`
- `--support-bundle <dir>`

Boolean flags:

- `--headless-json`
- `--resume`
- `--dry-run`
- `--yes`
- `--local`
- `--local-inventory`
- `--purge`
- `--no-www`
- `--no-caddy`
- `--no-host-install`
- `--no-harden`
- `--no-monitor`
- `--compact`
- `--ascii`
- `--version`
- `-h`, `--help`

Local workflow flags:

- `--local-root <path>`
- `--local-create <slug>`
- `--local-reset <slug> --yes`
- `--local-delete <slug> --yes`
- `--local-domain <host>`
- `--local-title <title>`

## Local macOS Testing

```sh
cd installer
bun run dev:local
```

Useful checks:

```sh
cd installer
bun run dry-run:local
bun run export-plan:local
bun run src/main.tsx --local --compact
bun run quality
```

Local mode uses deterministic fake host facts and sandbox paths under
`installer/.vibe-local`. It simulates execution even when the UI reaches
Execute. It must not write `/opt`, `/srv`, `/etc/caddy`, env files, or Docker
volumes. Local mode does not replace disposable VPS proof for Docker, Caddy,
DNS, WordPress, uploads, Redis, FastCGI cache, or Site Health behavior.

## Useful Commands

Download and verify without executing:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh
```

Run a dry-run:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --dry-run
```

Run a specific installer version:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --installer-version 0.1.5
```

## Not Built

- Desktop/Tauri installer UI.
- Local pull/push sync.
- Multi-server/fleet installer management.
