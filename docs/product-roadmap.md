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
  refresh-from-prod · promote-files-to-prod · env`.
- **Multi-environment**: local / stage / prod / external, with staging
  `refresh-from-prod` and `promote-files-to-prod` already implemented.
- **A guided TUI installer** (Bun + React + OpenTUI): `new-site` install (validated on a
  real VPS), a 13-operation manage dashboard, plus wired-but-not-yet-hardware-tested
  `remove-existing`, `update-existing`, and `staging-only` modes. Mode-aware planner, real
  host detection (scans `/opt` + `/srv`), dynamic wizard flow, and a headless core with
  `--export-plan` / `--headless` / `--headless-json` / `--dry-run`.

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

## Phases

### Phase 1 — Installer polish + idiot-proof happy path (DONE for the happy path)
- opencode/t1code-grade UI; intuitive navigation; dynamic mode-branching flow. (done)
- "Quick vs Custom" fork + smart defaults so the happy path is Enter-Enter-Enter. (done)
- The `new-site` happy path is now validated end-to-end on a real VPS (see milestone
  above). Remaining polish items (resume, persistent state, support bundle, terminal-size
  snapshots) are tracked in `todo/installer.md`.

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

### Phase 4 — Web control panel (NOT started)
A small control panel served from the VPS (or hosted), reusing the headless core: same
dashboard, multi-site, team access, remote operations from a browser.

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
- Backups: `backup` · `backup-verify` · `restore`.
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

The other installer modes are **wired in the planner but not all proven on hardware**:

- **`remove-existing`** — wired (pre-remove-backup, optional stage-down, prod-down,
  disable-caddy-route in `buildRemoveTasks`) but **not yet run on real hardware**.
- **`update-existing`** — wired (checkout, prod-config, prod-up, prod-smoke in
  `buildUpdateTasks`) but **not yet run on real hardware**.
- **`staging-only`** — wired (dns-preflight, stage-config, stage-up = up+install+smoke).
  The full fresh-staging path is **not validated end-to-end** because the staging
  subdomain needs a public DNS record (stage-smoke fails without it). Note the staging
  *data* workflows (`refresh-from-prod`, `promote-files-to-prod`) **were** validated on
  real hardware via the manage dashboard.

## Risks / open questions

- **`external-services` mode is half-removed — decision pending.** It is gone from the TUI
  menu but still lives in the `InstallMode` type union, the `--mode` CLI argument, and the
  `--help` text; in `install-plan.ts` it falls through to a normal bundled-DB install (see
  the comment there). The root stack already ships `compose.external.yaml` +
  `env/external.env`. Decide: either **fully implement** bring-your-own MariaDB/Redis or
  **fully remove** it from the type union and CLI. Do not leave it in this half state.
- Desktop app is a **separate product** with real cost (auto-update, signing, cross-OS
  Docker). Sequence it last.
- Headless-core refactor must not regress the TUI; do it behind tests.
- Remote operations (web/app driving a VPS) need an auth/transport story — design in
  Phase 3, not before.
