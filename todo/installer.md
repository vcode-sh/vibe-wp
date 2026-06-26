# Installer And Pre-Tauri Ledger

Last updated: 2026-06-26.

This file is a live status ledger. Older audit notes were removed because they
duplicated stale 2026-06-19/20 backlog text. Use `docs/installer.md`,
`docs/sync-contract.md`, `docs/superpowers/ROADMAP.md`, and live code for current
truth.

## Current Shipped State

- Installer version: `0.1.5`.
- Public bootstrap host: `https://wp.vcode.sh/install.sh`.
- Installer modes shipped: `new-site`, `manage-existing`, `remove-existing`,
  `update-existing`, `staging-only`, `external-services`, `shared-db`, and
  `panel-bootstrap`.
- Headless surfaces shipped: `--dry-run`, `--export-plan`, `--headless`,
  `--headless-json`, `--resume`, `--support-bundle`, local sandbox, and local
  workflow inventory/create/reset/delete.
- Journal output shipped: `.vibe-installer/state.json`, `install.log`, and
  `summary.txt`.
- Execute recovery shipped: final summary and failure recovery commands without
  secrets.
- Advanced override checkpoint shipped: Review lists DNS override, disabled host
  package/Caddy/www/hardening/monitoring choices, full delete, and custom
  performance overrides before execution.
- Terminal layout fixtures shipped: wide `120x40`, medium `92x30`, compact
  `80x24`, emergency `60x18`.
- Panel update hardening shipped: update snapshot, rollback on deploy failure,
  rollback on failed healthcheck, and pinned `--ref` / `VIBE_PANEL_UPDATE_REF`.
- Sync plan/apply shipped for web staging: read-only `stagingSyncPlan`,
  exact URL rewrite count when host dry-run succeeds, issued plan ids with TTL,
  and `stagingSyncApplyPlan` revalidation before safe refresh/push jobs.

## VPS Validation Recorded

2026-06-20:

- New-site install.
- Manage dashboard operations.
- Remove-existing and `--purge`.
- Update-existing.
- Staging-only.
- External-services.
- Backups, restore, monitoring, hardening, resume, and support bundle.

2026-06-26:

- Panel install.
- Break-glass reset.
- HTTPS panel smoke.
- Support bundle through sudoers wrapper with no secret leak.
- Clean panel update.
- Forced panel update rollback.
- Fresh production plus staging install.
- Staging refresh.
- Safe push-to-live rollback and fixed happy path.
- Authenticated browser GUI/realtime proof for staging publish.
- Uploads, Redis Object Cache, REST/loopback smoke, and FastCGI cache HIT.

Do not claim new VPS proof for any path unless it is re-run after the relevant
code change.

## Current Not-Built Items

- Tauri desktop UI and packaging.
- Local pull/push sync.
- Multi-server/fleet management.
- Single-binary distribution while the native libsql driver remains a blocker.

## Current Release Checks

Installer:

```sh
cd /Users/tomrobak/_projects_/vibe-wp/installer
bun run quality
```

Control panel:

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check
bun run check-types
bun run test
```

Shell/script sanity:

```sh
cd /Users/tomrobak/_projects_/vibe-wp
sh -n bin/panel
sh -n bin/vibe
sh -n bin/vibe-panel-run
git diff --check
```

## Safe VPS Installer Checks

Use only a disposable VPS for destructive validation.

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --dry-run
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

## Product Boundary Before Tauri

- Keep Tauri scaffold-only.
- Host operations must go through `bin/vibe`, installer headless core, or the
  panel host-exec chokepoint.
- Keep allowlists, argv arrays, timeouts, persisted jobs, audit logs, and
  redaction.
- Never print secrets in logs, summaries, support bundles, browser output, or
  docs.
