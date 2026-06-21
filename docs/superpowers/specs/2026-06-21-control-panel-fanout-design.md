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
- **Structured output → `--json`.** Add a `--json` mode to `bin/vibe smoke · perf-report ·
  monitor · doctor-runtime` (the four commands whose output is already organised around named
  checks). The panel parses structured JSON, not brittle human text. **Human output stays the
  default**; `--json` is additive (a thin output-format layer over existing logic).
- **Every long op streams.** `restore`, `refresh-from-prod`, `promote-files-to-prod`, `harden`,
  and `wp` updates run as **persisted jobs** streamed over SSE — identical to the backup pattern
  (in-memory `LineStream` for live follow + a `jobs` row for history).
- **Safety first.** Destructive ops (`restore`, `down`, `promote`, `harden`) go behind the
  existing `SafetyConfirm` (plain consequence + reversible/irreversible badge), **admin-gated**.
- **Real audit.** Every mutating procedure writes `{ userId, action, siteId?, jobId?, at }` to
  the `auditLog` table; this backs the Overview **activity timeline** (now real) and a per-site
  **operations history**.
- **Proper hardening.** The service moves **off root** to a dedicated `vibe-panel` system user
  with a tight **sudoers allowlist** for exactly the site `bin/vibe`/`bin/panel` entrypoints;
  `bin/panel install` provisions the user + sudoers rule.
- **Fixes done right.** Empty/no-backup date renders **"never"** (not the epoch "20625 days
  ago"); `serverInfo` is **real** (disk % via `df`, site count from detection, all-healthy from
  the per-site smoke/monitor verdicts).

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

- **Plan A — Reads real everywhere.** `siteStatus` (lazy), `serverInfo`, `server.doctor`,
  `health.report`, `staging.info`, `logs.tail` (SSE) + the `--json` modes + the date-fallback
  fix. Flip the remaining `web/src/data` read queries (`serverInfoQuery`, `healthQuery`,
  `logsQuery`, `stagingQuery`) off fixtures. Lowest risk, highest visible payoff.
- **Plan B — Operations.** `lifecycle` (up/down/restart/cacheFlush), `backups` verify/restore,
  `staging` refresh/promote/attach, `updates` apply, `server.harden` — all role-gated **jobs
  with SSE**, destructive ones behind `SafetyConfirm`, each writing an **audit** row. Wire the
  remaining web actions to these (the OperationRunner already consumes SSE).
- **Plan C — Team & hardening.** The team-admin surface (`members`/`createUser`/`setRole`/
  `remove` + a Settings → Team UI) and the **service hardening** (dedicated `vibe-panel` user +
  sudoers allowlist in `bin/panel`; exec layer invokes `sudo bin/vibe …` per the allowlist).

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
- The service runs **least-privilege** (`vibe-panel` + sudoers), not root.
- `sites.list` is instant; status resolves lazily.
- Gates green; each plan **validated on real hardware**.
