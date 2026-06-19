# Vibe WP — Product Roadmap

Status: Living document. Last updated 2026-06-19.

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
- **A guided TUI installer** (Bun + React + OpenTUI): install / manage / remove flows,
  mode-aware planner, real host detection (scans `/opt` + `/srv`), dynamic wizard flow.

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

## Phases

### Phase 1 — Installer polish + idiot-proof happy path (in progress)
- opencode/t1code-grade UI; intuitive navigation; dynamic mode-branching flow. (done)
- Reorder: Essentials → Options → Advanced (move Location to the end). (next)
- "Quick vs Custom" fork + smart defaults so the happy path is Enter-Enter-Enter.

### Phase 2 — Manage dashboard (THIS milestone)
Turn "Manage detected site" into a real per-site control panel over `bin/vibe`. See scope
below.

### Phase 3 — Harden `core/` as a headless API
Factor planning + operations behind a stable, typed, frontend-agnostic interface (and a
JSON/daemon mode) so web/desktop reuse it. Mostly already separated in `installer/src/core`.

### Phase 4 — Web control panel
A small control panel served from the VPS (or hosted), reusing the headless core: same
dashboard, multi-site, team access, remote operations from a browser.

### Phase 5 — Desktop app (LocalWP / Studio competitor)
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

## Risks / open questions

- Desktop app is a **separate product** with real cost (auto-update, signing, cross-OS
  Docker). Sequence it last.
- Headless-core refactor must not regress the TUI; do it behind tests.
- Remote operations (web/app driving a VPS) need an auth/transport story — design in
  Phase 3, not before.
