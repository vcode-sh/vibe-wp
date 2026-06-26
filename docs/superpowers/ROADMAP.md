# Vibe WP Status And Roadmap

Last updated: 2026-06-26.

This is the canonical roadmap/status document. `docs/product-roadmap.md` is
archival product vision only, and `docs/superpowers/plans/*` are execution
records, not current truth. For roadmap-sensitive decisions, verify this file
against `todo/installer.md`, `docs/sync-contract.md`, and live code.

## Current Pre-Tauri Status

Tauri stays scaffold-only. The product surface that exists today is the web
panel, installer/headless core, root Docker/WordPress stack, and local workflow
foundation.

### Web Panel

Shipped in live code:

- Authenticated web panel with Better Auth, viewer/operator/admin roles, closed
  registration after owner setup, break-glass password reset, and persisted audit
  jobs.
- Host operations run through the single `core-bridge/exec.ts` chokepoint and
  the root-owned `bin/vibe-panel-run` wrapper. The boundary uses fixed op
  allowlists, argv arrays, timeouts, kill-tree handling, stream redaction, and
  wrapper-side argument revalidation.
- Realtime operations tray/dialog, central query invalidation, operation history,
  support-bundle download, panel update job, provisioning, backup/restore,
  logs, staging, inventory, security, monitoring, performance, settings, users,
  shared-db, and WordPress user actions.
- Staging UI now uses `stagingSyncPlan` plus `stagingSyncApplyPlan`, so the GUI
  applies only a freshly issued plan that is revalidated before the safe job
  starts.

Validated on VPS 2026-06-26:

- `bin/panel install`, owner sign-in, HTTPS panel access, site discovery,
  support bundle via the sudoers wrapper with no secret leak, clean panel update,
  failed-update rollback, and safe staging push through the browser/realtime UI.

### Distribution And Update

Shipped in live code:

- `bin/panel install/update/reinstall/uninstall/reset-password`.
- Least-privilege `vibe-panel` service, root-owned sudoers wrapper, and
  `PANEL_HOST_DIR=/opt/vibe-wp-src`.
- `bin/panel update` snapshots panel app/data/systemd/Caddy state before deploy,
  restores on deploy failure, and restores on failed post-deploy healthcheck.
- Pinned updates through `bin/panel update --ref <git-ref>` or
  `VIBE_PANEL_UPDATE_REF`, with a strict ref-character allowlist.

Validated on VPS 2026-06-26:

- Clean update and forced deploy-failure rollback. That pass also fixed missing
  `unzip` for Bun bootstrap, missing `make` before `make init-*`, and shell
  failure propagation under `if deploy_panel`.

### Sync

Shipped in live code:

- `refresh-from-prod --yes` takes a production backup, restores production into
  staging, rewrites production URLs to staging URLs, and smokes staging.
- `stagingPushToLive` takes one production snapshot, promotes only managed
  files (`plugins`, `themes`, `mu-plugins`) with the script backup suppressed,
  verifies production, and auto-restores on promote or verification failure.
- Raw `stagingPromote` fails closed.
- `stagingSyncPlan` returns source/target identities, scope, backup timing,
  blocking conflicts, apply role, TTL/freshness metadata, deterministic plan id,
  and URL rewrite preview. When the host count op succeeds, URL rewrite plans
  include exact occurrence counts from a WP-CLI dry-run.
- `stagingSyncApplyPlan` requires an issued, non-expired plan id, recomputes the
  current plan, checks role requirements, and starts only the existing safe
  refresh or safe push-to-live job.

Validated on VPS 2026-06-26:

- Staging refresh, direct managed-file promote, rollback from a forced
  safe-push failure, fixed safe-push happy path, browser confirmation,
  operations tray/dialog, and realtime completion.

### Local Workflow

Shipped in live code:

- Root local Compose remains available for development.
- Installer `--local` sandbox simulates installer execution under
  `installer/.vibe-local` and never writes `/opt`, `/srv`, `/etc/caddy`, env
  files, or Docker volumes.
- Headless local workflow CLI supports inventory/create/reset/delete blueprint
  state under `.vibe-local`.

Not built:

- Desktop UI.
- Local pull/push sync.
- Multi-server/fleet management.

### Installer

Shipped in live code:

- Installer `0.1.5` with guided OpenTUI flow, headless JSON, dry-run/export,
  resume journal, `install.log`, redacted support bundles, `summary.txt`,
  local sandbox, all install/manage modes, and advanced override checkpointing
  in review.
- Terminal layout fixtures cover wide `120x40`, medium `92x30`, compact `80x24`,
  and emergency `60x18`; all TypeScript files stay at or below 220 lines.

Validated on VPS:

- 2026-06-20: new-site, manage dashboard, remove/purge, update-existing,
  staging-only, external-services, backups, monitoring, hardening, resume, and
  support bundle.
- 2026-06-26: production plus staging fresh install path, staging refresh,
  safe push-to-live, uploads, Redis Object Cache, REST/loopback smoke, and
  FastCGI cache HIT.

## Deferred Before Tauri

- Desktop packaging and desktop UI.
- Local pull/push sync with the same plan/apply/revalidate contract as staging.
- Single-binary distribution; currently blocked by the native libsql driver.
- New VPS proof for any future release claim that changes installer, update,
  sync, host-op, or wrapper behavior.

## Operating Rules

- Do not add Tauri functionality until web panel, distribution/update, sync, and
  local workflow are ready enough to package.
- Do not spawn host commands from routes or UI components. Add a `bin/vibe` or
  installer-headless operation, allowlist it in `core-bridge/exec.ts`, and mirror
  it in `bin/vibe-panel-run`.
- Keep secrets out of argv, logs, summaries, plans, support bundles, browser
  output, and docs.
- Claim VPS validation only when it has been run on a disposable VPS for the
  exact path being described.
