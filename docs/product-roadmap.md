# Vibe WP — Product Roadmap

Status: Living document. Last updated 2026-06-20.

## Vision

Make self-hosted, production-grade WordPress so easy and safe that a non-technical
owner picks a **$5 VPS + Vibe WP** over shared hosting — and a developer picks it over
LocalWP / Studio / DevKinsta for the local→production workflow.

One Docker-native stack, one reusable core, three frontends over time: a terminal
manager (today), a web control panel, and a desktop app for local development with
sync to production.

## Current state (what already exists)

- **Production-shaped Docker stack**: WordPress/PHP-FPM, Nginx FastCGI cache, MariaDB
  LTS, Redis 8, cron worker, on-demand WP-CLI. Config rendered from `.env` at container
  start. Same stack runs **locally and on a VPS**.
- **A full lifecycle CLI** (`bin/vibe <env> <command>`), the substrate for everything:
  `compose · config · up · down · restart · ps · logs · install · wp · backup ·
  backup-verify · restore · doctor-runtime · perf-report · smoke · cache-flush ·
  refresh-from-prod · promote-files-to-prod · env`. `backup` now writes to a configurable
  folder, prunes local + remote copies by retention, and optionally uploads off-server to
  Cloudflare R2; `restore` auto-fetches a missing backup from R2.
- **Multi-environment**: local / stage / prod / external, with staging
  `refresh-from-prod` and `promote-files-to-prod` already implemented.
- **A guided TUI installer** (Bun + React + OpenTUI): `new-site` install (validated on a
  real VPS), a 13-operation manage dashboard, plus `remove-existing` (incl. opt-in `--purge`
  full delete), `update-existing`, and `staging-only` — all validated on a real VPS
  (2026-06-20).
  Mode-aware planner, real host detection (scans `/opt` + `/srv`), dynamic wizard flow, and
  a headless core with `--export-plan` / `--headless` / `--headless-json` / `--dry-run` /
  `--resume` / `--support-bundle`.

**Key insight:** the lifecycle is already built in `bin/vibe`. Most "manager" surface is
UI over existing commands, not new backend.

## Architecture principle (decide once)

All real logic lives in a **reusable, headless core** (the installer's `core/` plus
`bin/vibe`). TUI, web, and desktop are **thin frontends over the same brain**. Every new
capability is added to the core and surfaced by each frontend — never reimplemented per
surface. This is what keeps three product surfaces affordable.

```
            ┌──────────── frontends ────────────┐
   TUI (OpenTUI)   Web control panel   Desktop app (Tauri)
            └───────────────┬───────────────────┘
                    headless core
        (planner · operations · validation · secrets)
                            │
                        bin/vibe  →  Docker stack
```

## Real-VPS validation milestone — 2026-06-20

A full end-to-end validation session ran on a disposable test VPS (details in local-only
agent docs, never in tracked files). Outcome:

- **`new-site` install validated end-to-end on real hardware.** Live HTTPS WordPress 7.0
  with Redis Object Cache confirmed; multiple Vibe WP sites coexisting on one VPS
  confirmed. The 10-task plan (dns-preflight, checkout, env-prod, caddyfile, prod-config,
  prod-up, prod-install, prod-smoke, prod-perf, first-backup) ran clean, with the host
  Docker/Caddy install tasks gated by `--no-host-install` and staging tasks gated by
  `stagingEnabled`.
- **`manage-existing` dashboard validated against real prod:** smoke, perf-report, ps,
  recent logs, config, backup/list-backups, restore round-trip, refresh-from-prod, and
  promote-files-to-prod all exercised on live hardware.
- **Two real install-blocking bugs found via SSH testing and fixed on 2026-06-20:**
  (a) `env-prod`/`env-stage` made idempotent — the tasks skip `make init-*` when the env
  file already exists, so retried installs no longer fail; (b) `writeEnvFile` now
  preserves write-once secrets (DB/Redis passwords) on retry so they stay in sync with the
  already-persisted Docker volumes.
- **`external-services` (bring-your-own MariaDB + Redis) validated end-to-end on real
  hardware.** A site installed in external mode against a standalone external MariaDB and
  external Redis: it served over HTTPS, only the `wordpress`/`nginx`/`cron` containers ran
  (no bundled `db`/`redis`), WordPress data lived in the external MariaDB, and the object
  cache connected to the external Redis (Status: Connected, Drop-in: Valid). The full
  external task chain (`dns-preflight`, `checkout`, `env-external`, `caddyfile`,
  `ext-config`, `ext-up`, `ext-install`, `ext-smoke`, `ext-perf`, `first-backup` via
  `./bin/vibe external ...`) reported ALL DONE.
- **Internal + external backups fully implemented and VPS-validated.** Backups are no
  longer local-only: `backup` writes to a configurable folder (`VIBE_BACKUP_DIR`), prunes
  local + remote copies beyond `VIBE_BACKUP_RETENTION` (keeps newest N), and — when R2 is
  enabled — uploads to Cloudflare R2 (S3-compatible) via rclone with `rclone check`
  verification; `restore` auto-fetches a backup from R2 when it is missing locally. The
  installer Backup screen offers Manual / Local backups / Local + Cloudflare R2, creates
  the folder, installs rclone, runs a first backup, and installs a systemd service+timer
  (`vibe-wp-backup-<slug>-<env>`) for a daily or weekly schedule. Validated on real
  hardware: configurable folder, upload + verify, local + remote retention,
  restore-from-remote, and the systemd timer enabled + active with a successful manual
  run. Remaining gap: a live Cloudflare R2 upload through the installer still needs a real
  R2 API token (mechanics proven against an S3-compatible store).
- **Health monitoring + alerts implemented and VPS-validated.** `./bin/vibe <env> monitor`
  checks HTTP uptime, disk space, TLS certificate expiry, backup freshness, and container
  health (ok/warn/fail, non-zero exit on failure), and sends Telegram/webhook/email alerts
  when configured (thresholds and channels via `VIBE_MONITOR_*` env keys). The installer
  installs an hourly systemd service+timer (`vibe-wp-monitor-<slug>-<env>`) by default and
  exposes a **Health check & alerts** dashboard action. Validated on real hardware:
  all-green monitor run (HTTP 200, TLS 89 days, fresh backup) plus the hourly timer
  enabled + active with a successful service run logged to journald.
- **Resumable installs + support bundle implemented and VPS-validated.** `--headless` runs
  now keep a persistent journal under `.vibe-installer/` (`state.json` + `install.log`,
  `core/journal.ts`); `--resume` skips already-completed steps (`core/plan-runner.ts`
  `runPlan` journal param). `--support-bundle <dir>` writes a redacted diagnostics bundle
  (host.json, install.log, state.json, plan.redacted.json) via `core/support-bundle.ts`.
  Validated on real hardware: a run failing at step 2 left a journal, and re-running with
  `--resume` skipped step 1 and continued.
- **`remove-existing` + `update-existing` validated on real hardware.** Both modes ran on a
  disposable VPS. Two bugs found + fixed: `remove-existing` was not adopting the site slug
  (wrong Caddy snippet path), and a stack-start race where `up` did not wait for
  healthchecks caused a transient smoke 503 — `bin/vibe up` now uses `compose up --wait`,
  `bin/smoke` retries the first request, and `bin/restore` verifies the backup archive
  before resetting the database.
- **`staging-only` end-to-end validated on real hardware.** Attaching staging to a live
  prod-only site now writes a *separate* staging Caddy snippet (`vibe-wp-<slug>-stage.caddy`,
  prod snippet untouched), scaffolds `env/stage.env`, and runs the DNS preflight against the
  staging domain only (prod is already live). Validated: attaching a staging subdomain to a
  prod-only site served staging over HTTPS with a valid cert + noindex, prod unaffected.
- **Full-delete mode implemented and VPS-validated.** `remove-existing --purge`
  (`state.fullDelete`) now drops Docker volumes (`down -v --remove-orphans`), deletes the
  install directory, and removes the Caddy snippets — always after the safety backup;
  default remove stays stop-only. Validated on a VPS: directory + 4 volumes removed,
  off-server backup preserved, other sites unaffected.
- **SSH visual checks done.** The TUI was PTY-rendered at wide (120x40), medium (92x30),
  compact (80x24), and emergency (60x18) sizes for the welcome/performance/backup screens
  with no crashes or errors (compact mode engages for the two smaller sizes).
- **Clearer destructive-action confirmation.** Dashboard danger operations
  (restore/stop/publish staging) now show an explicit plain-language consequence and an
  "Enter to confirm, Esc to cancel" prompt (`ManageOperation.consequence`,
  `dashboard-detail.tsx`).
- **Host hardening implemented and VPS-validated.** `./bin/vibe <env> harden` (idempotent
  `./bin/harden`) sets up the `ufw` firewall (allowing SSH + 80/443 before enabling),
  fail2ban (`sshd` jail), automatic security updates, and safe `sysctl` defaults; an
  `--ssh-key-only` opt-in additionally disables SSH password/root-password login. The
  installer runs hardening as the final install step (secure by default; `--no-harden` to
  opt out) and exposes a **Secure the server** dashboard action. Validated on real
  hardware: applied 9 items, `ufw` active (OpenSSH/80/443 allowed), fail2ban active,
  unattended-upgrades enabled, all sites still reachable (200), and SSH uninterrupted.

## Phases

### Phase 1 — Installer polish + idiot-proof happy path (DONE for the happy path)
- opencode/t1code-grade UI; intuitive navigation; dynamic mode-branching flow. (done)
- "Quick vs Custom" fork + smart defaults so the happy path is Enter-Enter-Enter. (done)
- The `new-site` happy path is now validated end-to-end on a real VPS (see milestone
  above). Resumable installs + redacted support bundle are now done + VPS-validated
  (`--resume`, `--support-bundle`). Remaining polish items (a final `summary.txt`,
  terminal-size snapshots) are tracked in `todo/installer.md`.

### Phase 2 — Manage dashboard (DONE + validated)
"Manage detected site" is a real per-site control panel over `bin/vibe`: 13 operations
across Check / Maintain / Staging / Danger groups, each mapped to a real `bin/vibe`
command (`core/manage-operations.ts`). The read/operate operations listed in the scope
below are implemented, and the key ones were exercised on real prod during the 2026-06-20
session.

### Phase 3 — Harden `core/` as a headless API (DONE + exercised on a VPS)
Core is verified UI-free (`core/boundary.test.ts` fails on any React/OpenTUI import) and
the installer suite is green (46 tests pass). A public facade (`core/index.ts`) is the one
stable import surface; a typed `runHeadless(request)` dispatcher (`core/headless.ts`) is
the frontend-agnostic brain (detect / validate / plan / operations / runPlan /
runOperation). `--export-plan`, `--headless <plan>`, `--headless-json`, and `--dry-run`,
plus the CLI flags `--domain` / `--admin-email` / `--mode` / `--staging-domain` /
`--no-www` / `--no-host-install`, were all exercised on the real VPS. `--headless-json`
pipes a JSON request → JSON response with no TUI, seeding the daemon/IPC mode web +
desktop will use.

### Phase 4 — Web control panel (per-VPS backend MVP slice implemented + **validated on a real VPS 2026-06-21**)
A small control panel served from the VPS (or hosted), reusing the headless core: same
dashboard, multi-site, team access, remote operations from a browser.

**Backend MVP slice (2026-06-21, branch `control-panel-backend-install`):** The per-VPS
server backend is wired end-to-end:
- **Exec-layer chokepoint** (`packages/api/src/core-bridge/exec.ts`): the only code that
  spawns host processes. Every call goes through an op allowlist (`smoke`/`backups`/`backup`)
  using an argv array — no shell-interpolated strings. All captured output is redacted by
  `redact.ts` before storage, logging, or streaming.
- **Sites + backups + operations over `bin/vibe`**: `detectSites` scans `PANEL_SITES_ROOTS`
  (`/opt:/srv` by default) for Vibe WP installs; `sitesList`, `siteOverview`,
  `backupsList`, `backupsRun`, `operationsStream` oRPC procedures serve real data through
  the exec layer; long-running backup jobs stream redacted output via oRPC event iterators
  (SSE) to the browser.
- **better-auth roles**: `admin`/`operator`/`viewer` via the admin plugin + access control;
  first-registered user automatically becomes `admin`; sign-in rate-limited; `role` column
  on the `user` table.
- **`bin/panel install`**: POSIX sh script that installs Bun if missing, builds the
  control-panel on a VPS, writes the `.env`, applies the DB schema (`db:push`), writes a
  `vibe-wp-panel.service` systemd unit (runs as root for the MVP — a dedicated-user + sudoers
  allowlist is a fan-out hardening item), drops a Caddy snippet that serves the built SPA and
  reverse-proxies `/rpc` & `/api` to the server over HTTPS, bootstraps the owner account —
  and exposes `bin/panel status` and `bin/panel uninstall [--purge]`.

**Validated on a real VPS (2026-06-21, `panel.vcode.sh`):** `bin/panel install` deployed it
end-to-end; browser sign-in as the bootstrapped admin showed the box's real Vibe WP sites
with live green smoke verdicts, and **"Back up now" streamed a real `bin/vibe backup`**
(MariaDB dump → wp-content archive → R2 off-site upload, redacted) creating a fresh backup —
proving the Caddy → server → exec → `bin/vibe` → SSE → web chain on actual hardware. Fan-out
follow-ups: `sites.list` smoke latency (~16s; make lazy/cached), the empty-backup date
fallback, the remaining `serverInfo`/`health`/`logs`/`staging` query flips, and the
dedicated-user + sudoers service hardening.

### Phase 5 — Desktop app (LocalWP / Studio competitor) (NOT started)
Tauri app: spin up local sites, blueprints, and **push/pull sync to production** built on
the existing `refresh-from-prod` / `promote-files-to-prod` primitives. Biggest lift —
done last, when core + sync are proven.

## Phase 2 scope — Manage dashboard

Entry: Sites → "Manage detected site" → pick site. Replace today's fixed task list with a
**per-site dashboard** that reads status and offers operations, each mapping to an
existing `bin/vibe` command (prod and stage where relevant).

**Read (status panels):**
- Health: `smoke`, `doctor-runtime` → green/red checks.
- Performance: `perf-report` → key metrics.
- Containers: `ps` → running services.
- (Derived) URLs, staging presence, disk/cache where cheaply available.

**Operate (actions, each behind confirmation / `--yes`):**
- Lifecycle: `up` · `down` · `restart`.
- Backups: `backup` (configurable folder + retention + optional off-server Cloudflare R2) ·
  `backup-verify` · `restore` (auto-fetches from R2 when missing locally).
- Cache: `cache-flush`.
- Logs: `logs` (tail).
- Updates: WordPress core/plugins via `wp`.
- Staging: `refresh-from-prod` · `promote-files-to-prod`.

**UX:** a dashboard layout (status cards + an action list), reusing the existing
`task-runner` for execution and streaming output. Destructive actions (restore, down,
promote) stay behind explicit confirmation, consistent with installer rules. No secrets
printed (use `redaction.ts`).

**Stays UI/flow + core-operations only** — no new infra; everything routes through
`bin/vibe`, which already exists.

## Competitive positioning

| | Shared hosting | cPanel/Plesk | GridPane/SpinupWP | **Vibe WP** |
|---|---|---|---|---|
| Performance stack | generic | generic | tuned | tuned, Docker-native |
| Local = prod parity | no | no | no | **yes (same stack)** |
| Local→prod sync | no | no | partial | **built-in primitives** |
| Open / portable | no | no | no | **yes** |
| Control surface | cPanel | cPanel | web panel | **TUI now, web+app next** |

Wedge: "managed-WordPress quality on a VPS you own," reachable over plain SSH today.

## Remaining / untested installer work

`remove-existing` (incl. `--purge`), `update-existing`, and `staging-only` are all now
proven on hardware:

- **`remove-existing`** — wired (pre-remove-backup, optional stage-down, prod-down,
  disable-caddy-route in `buildRemoveTasks`) and **validated on a real VPS (2026-06-20)**,
  including the opt-in `--purge` full delete (drops Docker volumes, deletes the install
  directory, removes the Caddy snippets — after the safety backup).
- **`update-existing`** — wired (checkout, prod-config, prod-up, prod-smoke in
  `buildUpdateTasks`) and **validated on a real VPS (2026-06-20)**.
- **`staging-only`** — wired (dns-preflight on the staging domain only, env-stage,
  stage-config, stage-caddyfile separate snippet, stage-up = up+install+smoke) and
  **validated end-to-end on a real VPS (2026-06-20)**: attaching staging to a live
  prod-only site served staging over HTTPS with a valid cert + noindex, prod untouched.

The first screen was reworked into a site-first control panel (2026-06-20): detected sites
lead as the primary list (server-status line on top), selecting one reveals its actions
(Manage / Update / Add staging / Remove), and "+ Create a new WordPress site" / "+ external
DB & Redis" are peer actions. The Execute screen already shows a progress bar + per-task
status + live log. The one installer path still unproven on hardware is a real
production-plus-staging install with two fresh isolated domains.

## Risks / open questions

- ~~**`external-services` mode is half-removed — decision pending.**~~ **Resolved
  (2026-06-20): fully implemented and VPS-validated.** It is now a menu-selectable install
  mode ("Use external database and Redis"). Its flow adds dedicated Database and Redis
  screens after Domain, the planner builds the external task chain via `core/external-plan.ts`
  (`buildExternalTasks` + `externalEnvValues`, writing `env/external.env`), headless
  `--ext-*` flags exist, and the root stack's `compose.external.yaml` + `env/external.env`
  are now driven by the installer. See the validation milestone above.
- ~~**Safe-remove: stay stop-only, or add a destructive full-delete mode?**~~ **Resolved
  (2026-06-20):** default remove stays stop-only; full delete is opt-in via
  `remove-existing --purge`, which drops Docker volumes, deletes the install directory, and
  removes the Caddy snippets after the safety backup. Done + VPS-validated.
- Desktop app is a **separate product** with real cost (auto-update, signing, cross-OS
  Docker). Sequence it last.
- Headless-core refactor must not regress the TUI; do it behind tests.
- Remote operations (web/app driving a VPS) need an auth/transport story — design in
  Phase 3, not before.
