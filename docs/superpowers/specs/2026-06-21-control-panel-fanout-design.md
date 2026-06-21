# Vibe WP Control Panel — Fan-Out Design (make the whole panel real)

Status: Approved design (brainstorm). Date: 2026-06-21.
Scope owner: `control-panel/` + root `bin/`.

## 1. Context

The per-VPS backend **MVP slice** (`sites` · `overview` · `backups` with a streaming backup) is
implemented and **validated on a real VPS** (`panel.vcode.sh`, 2026-06-21). This fan-out makes
**every remaining panel screen real**, fixes the validation findings, and hardens the deployment.

It introduces **no new architecture** — it is the thorough application of the proven patterns
from the MVP spec (`2026-06-21-control-panel-backend-install-design.md`): the single
**exec-layer chokepoint** (allowlist + argv arrays + timeouts + redaction), **oRPC** procedures
over shared contract types, **job + SSE** streaming for long ops, **better-auth RBAC**, and the
**`bin/panel`** host installer. The design bias is **best/most-robust, not quick patches.**

## 2. Decisions (settled)

- **Status latency → lazy `siteStatus`.** `sites.list` returns identity only (instant); each card
  calls `siteStatus(siteId)` which runs `smoke` independently, React-Query-cached (`staleTime`)
  with an on-demand re-check. No per-list blocking smoke; no separate background poller.
- **Structured output → `--json`.** Add a `--json` mode to `bin/vibe smoke · monitor ·
  doctor-runtime` (flat named-check lists — easy) and, with a dedicated nested schema,
  `perf-report` (dense multi-section output — explicit per-section objects + its own contract
  type; budget extra effort). Human output stays the default. Two musts (audit): `smoke`
  internally calls `doctor-runtime`, so its `--json` must not double-encode (use the exit code /
  nest it, never pipe doctor's human text into the envelope); and the panel always calls
  `monitor --quiet` so status polling never fires real Telegram/webhook/email alerts.
- **Every long op streams (as a generalized job).** `restore`, `refresh-from-prod`,
  `promote-files-to-prod`, `harden`, `wp` updates run as **persisted jobs** over SSE. `jobs.ts`
  is hard-coded to `backup`/`prod` today — it must first be **generalized to `(op, env, kind)`**
  and gain an **`operationsCancel`** procedure (`proc.kill()` → status `canceled`). **Mandatory
  `--yes`:** `restore`/`refresh-from-prod`/`promote-files-to-prod` block forever on a stdin
  prompt without `--yes` (no tty in a service) — the exec allowlist MUST pass `--yes`; the UI's
  `SafetyConfirm` replaces the shell confirmation.
- **`logs` is a follow-stream, NOT a job.** `logs -f` never exits, so it must not go through the
  job/`jobs`-table machinery. Plan A ships `logs.recent` (one-shot `logs-recent` snapshot via
  `useQuery` — the simple real flip) plus a dedicated `logs.tail` follow-stream that **kills the
  child on subscriber disconnect** (generator `finally` → `proc.kill()`) with a server-side max
  duration, after empirically confirming `@orpc/server` runs the generator's cleanup on client
  abort. No leaked `docker compose logs -f` processes.
- **Safety first.** Destructive ops (`restore`, `down`, `promote`, `harden`, team `remove`) go
  behind the existing `SafetyConfirm` (plain consequence + reversible/irreversible badge),
  **admin-gated**.
- **Real audit.** Every mutating procedure writes `{ userId, action, siteId?, jobId?, at }` to
  the `auditLog` table; this backs the Overview **activity timeline** and a per-site
  **operations history** (see §2a for the action→kind mapping + the empty-until-Plan-B state).
- **Hardening (honest defense-in-depth, not a sandbox).** The service moves **off root** to a
  dedicated `vibe-panel` user. Privileged site ops run via a small constrained wrapper
  **`bin/vibe-panel-run <op> <siteDir> <env> [args]`** (re-enforces the op allowlist at the shell
  level), invoked `sudo -n -- bin/vibe-panel-run …`; `/etc/sudoers.d/vibe-wp-panel` (0440,
  `visudo -cf`-validated) grants `vibe-panel` NOPASSWD for **only that wrapper** — so the sudoers
  surface is one constrained script (not all of `bin/vibe`), and the user needs no docker group.
  **Caveat (audit):** any path that runs `bin/vibe` as root is effectively root-equivalent, so
  the real controls stay the **exec/wrapper allowlist + auth + rate-limit + redaction**; the
  dedicated user is blast-radius reduction, not a strong boundary. A per-op **`privileged`** flag
  in `VIBE_OPS` decides whether the exec layer prefixes the wrapper.
- **Fixes done right.** Empty/no-backup date renders **"never"** (not the epoch "20625 days
  ago"); `serverInfo` is **real** (disk % via `df`, site count from detection, all-healthy from
  the per-site smoke/monitor verdicts).

## 2a. Audit-verified corrections (binding — amend §3–§5)

A precise read-only audit (2026-06-21) confirmed all 17 `bin/vibe` commands exist and verified
the design against the real scripts, the web contract, and the better-auth docs. Binding
corrections beyond §2:

**Contract sources (so the implementer never guesses):**
- `serverInfo` is assembled in the oRPC layer, not one command: `diskPercent` from
  `exec('df -P /')`, `siteCount` from the registry, `allHealthy` from aggregating `siteStatus`,
  `vps` from `hostname -f` (or a `PANEL_VPS_LABEL` env). `allHealthy` currently has no UI binding
  (the Server page's security card is static) — wire it or leave computed-but-unbound.
- `HealthReport.alertChannels` is panel config, NOT from `bin/vibe` (read from settings/DB).
  `uptimePercent` maps to a defined source (`monitor --json` uptime field) or is computed — state
  the mapping; never fabricate.
- `StagingInfo`: `url = hostFromUrl(stage.WP_HOME)` from `env/stage.env`; `noindex = true` (Vibe
  WP convention); `present:false` when no `stage.env`.
- **Lazy status is a contract change:** `SiteSummary.status` becomes **optional** (`status?:
  Verdict`); `sites.list` returns identity only; the site card shows a skeleton dot until
  `siteStatus(siteId)` resolves.
- **Activity timeline:** define an `auditLog.action` → `ActivityEntry.kind`
  (`backup|health|cache|update|deploy`) mapping. Until Plan B writes audit rows, real
  `siteOverview` returns `activity: []` — legitimately empty on a real VPS until then; render an
  empty state.
- **Query keys:** flipped queries use `orpc.<proc>.queryOptions()` keys (not the legacy manual
  `['site', id, …]` arrays); post-mutation invalidation must use the oRPC-derived key.

**RBAC (Plan C — two real bugs to fix FIRST):**
- **CRITICAL — `ac` is missing the admin-plugin statements.** The custom `createAccessControl`
  in `packages/auth/src/index.ts` only declares `site/server/team`; the admin plugin's endpoints
  (`createUser`/`listUsers`/`setRole`/`removeUser`/`banUser`) authorize against `user`/`session`
  statements. **Merge `defaultStatements`** (from `better-auth/plugins/admin/access`) into the
  custom statement and grant `admin` the `user`/`session` permissions — else the team endpoints
  fail their permission checks.
- **Fix the bootstrap hook.** `databaseHooks.user.create.before` sets `role` purely by user-count,
  which would **clobber an admin-provisioned `operator`/`viewer`** on create. Respect a provided
  role: `role: newUser.role ?? (firstUser ? "admin" : "viewer")`.
- **Team APIs** (server-side, via `adminProcedure` + forwarded Hono headers):
  `auth.api.listUsers({ headers, query: { limit: 100, sortBy: "createdAt" } })`;
  `auth.api.createUser({ headers, body: { email, name, password, role, data: { emailVerified:
  true } } })`; `auth.api.setRole({ headers, body: { userId, role } })`; **`remove` = `banUser`**
  (reversible) not `removeUser` (permanent hard-delete) — UI uses `SafetyConfirm`.
- Keep the existing **RANK-based `requireRole()`** for oRPC enforcement (simple, correct); use
  `ac` only for the admin-plugin internal guards + the client `adminClient({ ac, roles })` plugin
  (add to `web/src/lib/auth-client.ts`; export `ac`/`roles` from `@control-panel/auth`).

**bin operational notes:** `refresh-from-prod`/`promote-files-to-prod` are always a stage→prod
pair; `perf-report` does live container-exec + HTTP (give it a generous exec timeout);
`backup-verify --deep` extracts to `/tmp` (surface as an advanced, disk-warned option).

## 3. Contract additions (per domain)

Each procedure is backed by the exec layer (`<siteDir>/bin/vibe <env> <cmd>`), guarded by role
(◦ = operator+, ⁂ = admin, unmarked = viewer+), and returns/streams the existing
`web/src/data` contract types (already shared from `packages/api/src/contract.ts`).

| Domain | New procedures | Backed by |
|---|---|---|
| **sites** | `siteStatus(siteId)` → `Verdict` | `smoke --json` |
| **server** | `serverInfo` (real) · `doctor` · `harden` ⁂ *(stream)* | `df` + per-site smoke · `doctor-runtime --json` · `harden` |
| **health** | `report(siteId)` (real) · `runCheck` ◦ *(stream)* | `smoke --json` + `perf-report --json` + `monitor --json` |
| **staging** | `info(siteId)` · `refresh` ◦ *(stream)* · `promote` ⁂ *(stream)* · `attach` ⁂ *(stream)* | `refresh-from-prod` · `promote-files-to-prod` · staging-only |
| **logs** | `tail(siteId, source)` *(SSE)* | `logs` (follow) / `logs-recent` |
| **lifecycle** | `up` ◦ · `restart` ◦ · `cacheFlush` ◦ · `down` ⁂ *(all stream)* | `up`/`restart`/`cache-flush`/`down` |
| **backups** | `verify(siteId, id)` ◦ *(stream)* · `restore(siteId, id)` ⁂ *(stream)* | `backup-verify` · `restore` |
| **updates** | `available(siteId)` · `apply(siteId, what)` ◦ *(stream)* | `wp … --json` · `wp core/plugin update` |
| **team** | `members` · `createUser` ⁂ · `setRole` ⁂ · `remove` ⁂ | better-auth admin plugin |

The exec allowlist (`VIBE_OPS`) extends from `{smoke,backups,backup}` to include the new commands
above; each stays an argv array with a timeout and redaction.

## 4. The three plans (sequenced, each VPS-validated)

Each plan produces working, testable software and is **re-validated on the test VPS** before the
next — never a giant unverified branch.

- **Plan A — Reads real everywhere.** `siteStatus` (lazy; `SiteSummary.status` optional),
  `serverInfo` (§2a derivation), `server.doctor`, `health.report` (`smoke`/`monitor`/`doctor`
  `--json` for the tiles; `perf-report --json` with its dedicated nested schema for TTFB/cache),
  `staging.info` (§2a source), `logs.recent` (snapshot flip) + the optional `logs.tail`
  follow-stream, the `--json` modes, and the date-fallback fix. Flip `serverInfoQuery`,
  `healthQuery`, `logsQuery`, `stagingQuery` off fixtures and the sites card to lazy status.
  Lowest risk, highest visible payoff.
- **Plan B — Operations.** `lifecycle` (up/down/restart/cacheFlush), `backups` verify/restore,
  `staging` refresh/promote/attach, `updates` apply, `server.harden` — all role-gated **jobs
  with SSE**, destructive ones behind `SafetyConfirm`, each writing an **audit** row. Wire the
  remaining web actions to these (the OperationRunner already consumes SSE).
- **Plan C — Team & hardening.** First fix the two RBAC bugs (§2a): merge the admin-plugin `ac`
  statements and the bootstrap-hook role precedence. Then the team-admin surface
  (`members`/`createUser`/`setRole`/`remove`=ban via the §2a APIs + a Settings → Team UI + the
  `adminClient` plugin) and the **service hardening** (dedicated `vibe-panel` user + the
  constrained `bin/vibe-panel-run` wrapper + scoped sudoers, provisioned by `bin/panel install`;
  per-op `privileged` flag in `VIBE_OPS`).

## 5. Frontend

Flip the remaining `web/src/data/queries.ts` factories to `orpc.*`; render the lazy `siteStatus`
per card (skeleton dot → verdict, with a re-check affordance); wire `OperationRunner` to each new
streaming op from its page; build **Settings → Team** (member list + add/role/remove) and **Server
& security** real actions; make the **activity timeline** read the real `auditLog`; fix the
backup-date display. All within AGENTS.md rules (≤220-line modules, semantic tokens, no host
spawns from components).

## 6. Testing & validation

- **TDD the pure logic:** the `--json` parsers (smoke/perf/monitor/doctor), the lazy-status
  derivation, the audit-row builder, the "never"/relative-date formatter, the exec-allowlist
  additions.
- **Per-plan agent team** (fresh implementer + adversarial reviewer + fix loop) enforcing the
  gates (`check-types`/`check`/`test`) and AGENTS.md rules.
- **Real-VPS re-validation after each plan** on `panel.vcode.sh`: Plan A — every screen shows
  real data; Plan B — run a real restore/refresh/harden with live streamed redacted output +
  an audit entry; Plan C — sign in as a second (operator) user, confirm role limits, and confirm
  the service runs as `vibe-panel` (not root) yet still performs site ops via the sudoers
  allowlist.

## 7. Out of scope / later

Multi-server fleet; invite **emails** (admins still provision via `createUser`); the polished
§7a TUI one-command install screen (its own effort); the Tauri desktop app (Phase 5);
DB-backed rate-limit storage.

## 8. Success criteria

- **Every** panel screen shows real data from the host (no remaining fixtures except where
  explicitly deferred).
- Every operation runs as a streamed, audited, role-gated job; destructive ones are confirmed.
- The service runs as a dedicated `vibe-panel` user (not root); privileged site ops are gated by
  the constrained `bin/vibe-panel-run` wrapper + scoped sudoers (blast-radius reduction — the
  exec/wrapper allowlist + auth remain the primary controls).
- `sites.list` is instant; status resolves lazily.
- Gates green; each plan **validated on real hardware**.
