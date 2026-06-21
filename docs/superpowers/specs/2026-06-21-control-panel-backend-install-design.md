# Vibe WP Control Panel — Per-VPS Backend Wiring & Install Design

Status: Approved design (brainstorm). Date: 2026-06-21.
Scope owner: `control-panel/` (server + packages/api + packages/db + packages/auth) and root `bin/`.

## 1. Context

The control-panel web UI is built (separate spec: `2026-06-21-control-panel-shell-brand-design.md`) and renders against a typed **mock-data seam** (`web/src/data/`). The `server` is a stub: its oRPC procedures return hardcoded JSON and there is **no** call into `bin/vibe` or the installer's headless core (only string mentions). The installer already exposes a frontend-agnostic core: `runHeadless(request)` (`installer/src/core/headless.ts`) + the `--headless-json` CLI, and `bin/vibe <env> <command>` is the host lifecycle substrate.

This spec makes the panel a **real per-VPS application**: it wires the server to the host, defines the typed API contract the web consumes, and adds an installer flow to deploy it. The actual per-procedure implementation + frontend swap + remaining pages is the *implementation plan* that follows.

## 2. Decisions (settled)

- **Execution/deploy model: host-native.** The panel server runs as a **systemd service on the VPS** (Bun runtime) with host access; Caddy reverse-proxies `panel.<domain>` → it and serves the web build. (Not containerized — a deliberate exception, because `bin/vibe` is a host orchestrator.)
- **Server↔core coupling: CLI boundary.** The server **shells out** to `<siteDir>/bin/vibe <env> <command>` for management ops and the installer's `--headless-json` for planning/install — treating the core as a stable CLI contract. No toolchain merge.
- **Access model: public subdomain + login, team from day one.** Caddy TLS on `panel.<domain>`; better-auth gates access; roles **admin / operator / viewer** with team management built now.

## 3. Architecture & runtime topology

```
Browser ──TLS──▶ Caddy (panel.<domain>)
                   │ reverse-proxy
                   ▼
         panel-server  (Bun + Hono + oRPC, systemd: vibe-wp-panel.service)
            │ exec layer (the one host chokepoint)     │ libsql SQLite
            ▼                                           │ (auth, roles, invites,
   <siteDir>/bin/vibe <env> <cmd> · installer --headless-json   audit, jobs)
            ▼
   host Docker / Caddy snippets / systemd timers / the WP sites
```

**Six components:**
1. **Exec layer** (`server/src/core-bridge/`) — the only code that touches the host. Spawns `bin/vibe`/`--headless-json` with the correct `env` + per-site working directory, enforces an **allowlist** of commands + validated args (never arbitrary shell), timeouts, parses JSON, and **redacts** before output leaves.
2. **Site registry** — enumerates sites by reusing the installer's detection (`host.ts`: `find /opt /srv … -path '*/bin/vibe'`), cached in SQLite + refreshable. Supplies every per-site procedure its `{ env, dir }`.
3. **oRPC contract** (`packages/api`) — typed procedures grouped by domain, each backed by the exec layer, each role-guarded.
4. **Operation runner + streaming** — long ops run as **tracked jobs**; output streams to the browser via **SSE (oRPC event iterators)**, redacted; job state persisted for resume/audit.
5. **Auth/RBAC** — better-auth `admin` plugin + access control (Section 6).
6. **Install task** — `bin/panel` deploys the service + Caddy route + bootstrap (Section 7).

## 4. Exec layer (the chokepoint)

- Single module; every host interaction goes through it. No procedure spawns processes directly.
- **Allowlist**: a fixed map of `{ op → bin/vibe subcommand }` (derived from `installer/src/core/manage-operations.ts`); inputs validated by zod before they reach the shell; args passed as an argv array (no string interpolation).
- Runs **each site's own** `bin/vibe` (`<siteDir>/bin/vibe <env> <cmd>`) — every site is a full checkout (confirmed by detection finding `*/bin/vibe`).
- Timeouts + cancellation; stdout/stderr captured; JSON parsed where available, text parsed otherwise.
- **Redaction** (reuse the installer's `redaction.ts` principle) applied to all captured output before it is stored or streamed.
- Where a `bin/vibe` command emits human text today (e.g. `perf-report`, `smoke`, `ps`), add a `--json` output mode in the root scripts so the panel parses structured data rather than scraping.

## 5. oRPC contract surface

**Shared types = the seam.** Promote `web/src/data/types.ts` shapes (`SiteSummary`, `SiteOverview`, `MetricTile`, `BackupRecord`, `HealthReport`, `StagingInfo`, `LogLine`, …) into `packages/api` as contract types imported by both server (produce) and web (consume). Closing the seam = flipping each `web/src/data/queries.ts` `queryFn` from a fixture to `orpc.<proc>.queryOptions()`.

| Domain | Procedures | Backed by |
|---|---|---|
| **sites** | `list` · `overview(siteId)` · `create` ⁂ · `remove(purge?)` ⁂ | detect · smoke+monitor+perf · `--headless-json` install/remove |
| **health** | `report(siteId)` · `runCheck` ◦ · `perf` ◦ | `smoke` · `doctor-runtime` · `perf-report` · `monitor` |
| **backups** | `list` · `run` ◦ · `verify` ◦ · `restore` ⁂ | `backup` · `backup-verify` · `restore` |
| **lifecycle** | `up` ◦ · `down` ⁂ · `restart` ◦ · `cacheFlush` ◦ | `up`/`down`/`restart`/`cache-flush` |
| **logs** | `tail(siteId, source)` *(SSE)* | `logs` |
| **staging** | `info` · `refresh` ◦ · `promote` ⁂ · `attach` ⁂ | `refresh-from-prod` · `promote-files-to-prod` · staging-only |
| **updates** | `available(siteId)` · `apply` ◦ | `wp … --json` (feeds the "Needs you" lane) |
| **server** | `info` · `doctor` · `harden` ⁂ | host detect · `doctor` · `harden` |
| **operations** | `list` · `get(jobId)` · `stream(jobId)` *(SSE)* · `cancel` ⁂ | the job runner |
| **team** | `members` · `createUser` ⁂ · `setRole` ⁂ · `remove` ⁂ | better-auth admin plugin |

◦ = operator+, ⁂ = admin-only, unmarked = viewer+.

**Job model.** Long-running procedures return a `Job` immediately: `{ id, kind, siteId?, env, status: queued|running|succeeded|failed|canceled, exitCode?, startedAt, finishedAt?, logRef }`, persisted in SQLite. The UI calls `operations.stream(jobId)` — an oRPC event iterator (SSE) pushing redacted progress lines + terminal status. Read procedures stay plain request/response. This is what the web's `OperationRunner` pattern consumes.

## 6. Auth, RBAC & bootstrap (better-auth, doc-verified)

Use the better-auth **`admin` plugin + access control** — not a hand-rolled role column, and not the heavier `organization` plugin (multi-tenant orgs are overkill for one VPS = one team).

- **Roles via `createAccessControl`** (`better-auth/plugins/access`): define `admin` / `operator` / `viewer` with statements (e.g. `site: ["read","operate","manage"]`, `server: ["read","manage"]`, `team: ["manage"]`); pass `adminPlugin({ ac, roles: { admin, operator, viewer }, adminRoles: ["admin"] })`. oRPC middleware maps the Section-5 tiers to `auth.api.userHasPermission(...)`, so `◦`/`⁂` become real guards.
- **Team without email**: an admin provisions teammates with **`admin.createUser({ email, password, role })`** (no org, no email). A token-invite link + optional transactional email may layer on later.
- **Bootstrap via database hook**: add `role` as a `user.additionalFields` with **`input: false`** (prevents privilege escalation via the signup payload); `databaseHooks.user.create.before` sets `role: "admin"` when `userCount === 0`, else `viewer`. The app serves a one-time **"Create the owner account"** screen while zero admins exist, then normal login. No secret is written to install logs.
- **Rate limiting is built-in**: enable better-auth's rate limiter (prod-default 60s/100) with `rateLimit: { storage: "database", customRules: { "/sign-in/email": { window: 10, max: 5 } } }`.
- **Sessions/CSRF**: secure httpOnly cookies over Caddy TLS; set `baseURL` + `trustedOrigins` to `https://panel.<domain>` (better-auth's origin check is the CSRF guard).
- **Audit**: every mutating procedure records `{ userId, action, siteId?, jobId, at }`; backs the Activity timeline + operations history.

## 7. Install task

A standalone **`bin/panel <install|update|status|uninstall>`** (peer of `bin/harden`/`bin/monitor`, invoked directly — *not* `bin/vibe panel`, which is env-prefixed/per-site). The installer TUI exposes "Install control panel" as a host action. Install dir `/opt/vibe-wp-panel/` (`data/` libsql db · `web/` static · server · `.env`).

**`panel install` (idempotent, mirroring `install-plan.ts`/`backup.ts`/`monitor.ts`):**
1. **Preflight** — ensure Bun on host; **DNS preflight** for `panel.<domain>`; confirm Docker + Caddy.
2. **Build** — build web (`bun run build` → static) and the server; **deploy via the Bun runtime** under systemd (a single-binary `bun build --compile` is *not* assumed: `packages/db` uses libsql whose native file driver doesn't reliably embed; a binary build would require switching to the `bun:sqlite` driver — deferred).
3. **Env** — generate `BETTER_AUTH_SECRET`; set `baseURL`/`trustedOrigins=https://panel.<domain>`, libsql url (`file:.../data/panel.db`), sites root (`/opt`,`/srv`).
4. **DB** — create the libsql file; run Drizzle migrations.
5. **systemd** — install `vibe-wp-panel.service` (`Restart=always`, `WantedBy=multi-user.target`) via the existing pattern (`printf … | sudo tee /etc/systemd/system/vibe-wp-panel.service` → `systemctl daemon-reload` → `systemctl enable --now`). Run as a **least-privilege `vibe-panel` user** (docker group + a sudoers allowlist scoped to the site `bin/vibe` entrypoints) — deliberate hardening beyond the root-timer convention; the exec **allowlist** is the primary control regardless.
6. **Caddy** — write `vibe-wp-panel.caddy` (imported into `/etc/caddy`), then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy` (identical to existing install plans).
7. **First-run + smoke** — zero-users serves owner-setup; verify HTTP 200 on `panel.<domain>` + service active; print "visit https://panel.<domain> to create the owner account."

**Lifecycle**: `panel update` (pull, rebuild, migrate, restart) · `panel status`/`logs` · `panel uninstall` (remove service + Caddy snippet; keep or `--purge` data).

## 8. Security model

- The exec **allowlist** (Section 4) is the primary control: only known `bin/vibe` subcommands with zod-validated argv ever run; no arbitrary shell.
- Least-privilege `vibe-panel` service user; sudoers scoped to the entrypoints.
- **Redaction** on all captured output (logs, streams, support bundles).
- `role` field `input: false`; bootstrap hook; better-auth rate limit + TLS + trustedOrigins.
- No secrets rendered or written to install logs.

## 9. Build order & agent-team organization

**Thin vertical slice first, then fan out:**
1. **Contract + exec foundation** *(first)* — promote types into `packages/api`; build the exec layer (allowlist, timeouts, JSON, redaction) + site registry (reuse `host.ts`); job model + SSE; add `--json` to the few text-only `bin/vibe` commands.
2. **One full vertical slice, end-to-end** — `sites.list/overview` + `health.report` + `backups.list/run` (one streaming op) + **auth bootstrap** + **`bin/panel install`**; flip those web queries fixture→oRPC; **validate on the real test VPS** (proves Caddy→server→exec→`bin/vibe`→SSE).
3. **Fan out** — remaining contract (staging, logs tail, lifecycle, updates, server, team), each flipping its web query + finishing any missing page/state.
4. **Harden** — RBAC across all procedures, audit, rate-limit, redaction tests; `panel update`/`uninstall`.

**Agent-team workflow (contract-first):** a **Glue** track lands the shared types first; then parallel **Backend** (exec → registry → procedures → job/SSE → redaction), **Auth** (admin plugin + AC + bootstrap + team), **Frontend** (flip queries, wire `OperationRunner` to SSE, team/settings UI, missing pages), and **Install** (`bin/panel` + systemd + Caddy + first-run + smoke) tracks. Each task gets adversarial review; a final whole-branch review; **real-VPS validation** is the acceptance gate. The MVP slice (1–2) is built and VPS-validated before the fan-out.

## 10. Testing & verification

- **TDD for pure logic**: exec-arg building, the command **allowlist**, **redaction**, output parsers.
- **Integration**: drive `--headless-json` against a real site; verify job/SSE end-to-end.
- **Real-VPS validation** as the project's acceptance gate (the disposable test VPS, SSH details in local-only agent docs).
- Frontend: existing Vitest + visual checks; contract types shared so `tsc` catches drift.

## 11. Out of scope / deferred

Multi-server (one panel per VPS now) · invite **emails** (use `admin.createUser`) · the panel self-updating its own running process (use `bin/panel update`) · a single-binary server build (`bun:sqlite` migration) · the Tauri desktop path.

## 12. Success criteria

- A logged-in admin on `panel.<domain>` sees their real sites, runs a real backup with a live redacted stream, and the job is audited — all driven through the exec layer to `bin/vibe`.
- `bin/panel install` deploys the panel on a fresh VPS (systemd + Caddy + first-run owner setup), validated on real hardware.
- Roles enforce the Section-5 tiers; no arbitrary shell reachable; no secrets leaked.
- The web consumes the oRPC contract via the swapped `web/src/data` seam; `tsc`/`ultracite`/tests green.

## 13. Sources

- better-auth admin plugin: https://www.better-auth.com/docs/plugins/admin
- better-auth rate limiting: https://www.better-auth.com/docs/concepts/rate-limit
- better-auth database hooks / custom fields: https://www.better-auth.com/docs/concepts/database
- better-auth organization plugin (evaluated, not used): https://www.better-auth.com/docs/plugins/organization
