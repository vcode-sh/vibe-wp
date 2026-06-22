# Control Panel Completion — Implementation Plan

> **For agentic workers:** built phase-by-phase via dispatched agents. Phases are SEQUENCED (later phases depend on earlier). Within a phase, tasks are scoped to disjoint files so they can run in parallel. Each task gates (`bun run check-types && bun run check && bun run build` from `control-panel/`, plus shell tests where applicable) and the controller commits.

**Goal:** Close the remaining control-panel gaps surfaced by the 2026-06-22 audit — security hardening, truthful data, operator actions, and team/RBAC — so the panel is honest, safe, and fully operable.

**Sequencing (hard dependencies):**
1. **Phase 1 — Security & hardening** (no deps; unblocks Phase 4's RBAC).
2. **Phase 2 — Truthful data** ‖ **Phase 3 — Operator actions** (mostly disjoint files; can interleave).
3. **Phase 4 — Team & roles** (needs Phase 1's `ac` fix + the bootstrap-role refinement).

## Global constraints
- TABS indent; TS/TSX ≤220 lines; no `any`; shadcn primitives + semantic tokens (no hardcoded colors); English copy.
- **One host-exec chokepoint:** new host actions are allowlisted `VIBE_OPS` argv arrays in `packages/api/src/core-bridge/exec.ts`; secrets travel as injected env (redacted), never argv. No spawning outside `exec.ts`.
- **Secrets write-only:** any secret (Telegram bot token, R2 secret) is stored in `panel.db`, returned as a `hasSecret` boolean, never read back; never printed.
- Env-file writers must preserve every non-managed line + file mode 0600 + use an atomic temp+rename (mirror `bin/backup-config-apply`).
- Gate every task: `bun run check-types && bun run check && bun run build` (run `build` first when a TanStack route is added, so `routeTree.gen.ts` regenerates).

---

## Phase 1 — Security & hardening

### Task 1A — Auth: close open registration + RBAC access-control fix
**Files:** Modify `control-panel/packages/auth/src/index.ts`.
**Do:**
- Merge the admin-plugin default statements so `admin` actually holds `user`/`session` capabilities (prereq for Phase 4): import `{ defaultStatements, adminAc }` from `better-auth/plugins/admin/access` and build `ac` from `{ ...defaultStatements, site:[...], server:[...], team:[...] }`; grant the `admin` role the admin-plugin user/session perms (spread `adminAc.statements` or list them).
- Gate public sign-up to bootstrap-only: in `databaseHooks.user.create.before`, when `existing.length > 0`, throw a better-auth `APIError("FORBIDDEN", { message: "Registration is closed. Ask an admin to create your account." })` (import `APIError` from `better-auth/api`). This keeps the first-install bootstrap (0 users) working and blocks all later public `/sign-up/email`. (Phase 4 will refine this to allow admin-context creates.)
**Acceptance:** typecheck green; bootstrap-first-user still becomes admin; a second `/sign-up/email` is rejected. Do NOT change the bootstrap-role line yet (Phase 4 owns the `?? newUser.role` refinement).

### Task 1B — `bin/panel`: preserve `BETTER_AUTH_SECRET` across installs
**Files:** Modify `bin/panel` (the build/env section ~lines 63–73).
**Do:** Before generating a fresh secret, reuse the existing one if present: if `$PANEL_DIR/app/server/.env` (or the install's prior `.env`) already defines `BETTER_AUTH_SECRET=`, extract and reuse it; otherwise generate. Result: re-installs/upgrades keep sessions valid.
**Acceptance:** running `bin/panel install` twice does not change `BETTER_AUTH_SECRET`; a first install still generates one. Keep `set -eu` safety; never echo the secret.

### Task 1C — `logsFollow`: concurrency cap
**Files:** Modify `control-panel/packages/api/src/routers/logs.ts` (+ a tiny shared counter, inline or in a small module).
**Do:** Track active follow streams (module-level counter, incremented on stream start, decremented in `finally`). Reject with `ORPCError("TOO_MANY_REQUESTS")` when a global cap (e.g. 8) or per-user cap (e.g. 3) is exceeded. Keep it `protectedProcedure` (viewers may watch logs) — the cap is the fix, not role-gating.
**Acceptance:** opening more than the cap rejects cleanly; closing a stream frees a slot; existing single-stream behavior unchanged.

### Task 1D — Jobs: restart recovery + registry reaper
**Files:** Modify `control-panel/packages/api/src/core-bridge/jobs.ts`, `jobs-db.ts`; add a startup reconcile call where the server boots (`control-panel/server/src/index.ts` or wherever `createAuth`/app init runs).
**Do:** (1) On startup, mark any DB job rows still `running` as `failed` with a note "interrupted by restart" (a `reconcileOrphanedJobs()` in `jobs-db.ts` run once at boot). (2) Add a reaper: cap the in-memory `registry`/`finalized` maps (evict finalized entries older than a TTL or beyond a max size) so they don't grow unbounded.
**Acceptance:** after a simulated restart, no DB row is stuck `running`; the registry evicts old finished jobs; live/active jobs still stream.

**Phase 1 deploy + validate:** redeploy; confirm second sign-up rejected, re-install keeps the session (no forced re-login), log-stream cap works, restart leaves no `running` rows.

---

## Phase 2 — Truthful data (stop fake/zero values)

### Task 2A — Health: real uptime + TLS (cheap) and on-demand perf report
**Files:** `packages/api/src/core-bridge/exec.ts` (add ops), `packages/api/src/routers/health.ts`, `packages/api/src/routers/perf.ts` (new or fold into health), `packages/api/src/contract*`, `web/src/routes/_auth/sites/$siteId/health.tsx`.
**Do:**
- Add ops: `monitor: { argv: ["monitor", "--json"], stream: false }` and `perfReport: { argv: ["perf-report", "--json"], stream: false }`. Confirm `monitor --json` does NOT fire alerts (read-only); if it does, add/extend a `--no-notify`/check-only flag in `bin/monitor`.
- In `healthReport`, populate `uptimePercent` + `tlsDays` from `parseMonitorJson(monitor --json)` (cheap). Stop returning hardcoded zeros; where a metric is genuinely heavy (TTFB/cache), DROP it from the always-loaded report.
- Wire the existing **"Perf report"** button (currently a toast stub at `health.tsx:29-30`) to run `perfReport` on-demand (via a job or a direct call) and render TTFB/cache/opcache/redis from `parsePerfJson`.
**Acceptance:** health page shows real uptime/TLS (not 0); the Perf report button returns real perf data instead of a toast; no fake zeros remain.

### Task 2B — Server security card from real state
**Files:** add `bin/security-status` (new POSIX script) + dispatch in `bin/vibe`; `packages/api/src/core-bridge/exec.ts` (op `securityStatus: { argv: ["security-status"], stream: false }`); a parser in `parse.ts`; `packages/api/src/routers/server.ts` (or wherever serverInfo lives); `web/src/routes/_auth/server.tsx`.
**Do:** `bin/security-status` prints JSON `{firewall, fail2ban, autoUpdates}` by checking `ufw status` (active?), `systemctl is-active fail2ban`, and unattended-upgrades config presence. Surface it through a procedure; render the Server security card from it (red/amber/green per real state) instead of the hardcoded green text at `server.tsx:72-81`.
**Acceptance:** the security card reflects actual host state (toggling ufw off shows it as off).

### Task 2C — Overview safety-net + "Needs you" from real data
**Files:** `packages/api/src/routers/sites.ts` (the `needs:[]` / `safety` / `subline` hardcodes at ~60-74), contract, `web/src/routes/_auth/sites/$siteId/overview.tsx` (+ `safety-net.tsx`).
**Do:** Derive `safety.backupText` from the real latest backup (reuse `backupsList`/`lastBackupISO`); derive `securityText`/`securityDetail` from Task 2B's security status; populate `needs[]` from real signals (pending plugin/core updates already available via `updatesAvailable`; failing health checks; no recent backup). Wire `needs-you.tsx` "Later" dismiss (Task: small).
**Acceptance:** overview shows real backup/security state and surfaces genuine needs (e.g. pending updates) instead of static copy; "Later" dismisses.

---

## Phase 3 — Operator actions

### Task 3A — Lifecycle ops UI
**Files:** `web/src/routes/_auth/sites/$siteId/overview.tsx` or a site-scoped controls block in `web/src/components/`; uses existing `orpc.lifecycleUp/Restart/CacheFlush/Down` + the operations tray.
**Do:** Add operator/admin-gated controls (Restart, Cache flush, Stop/Start) that fire the existing lifecycle procedures as streamed jobs (reuse the operations tray + LiveOperation). Down is admin-only with a confirm.
**Acceptance:** an operator can restart/flush-cache/stop/start a site from the UI; actions stream + audit; viewers don't see the controls.

### Task 3B — Notifications: persist + apply alert channels (mirror backups-config)
**Files:** `packages/db/src/schema/` (new `notify_config` table, like `backup_config`), `packages/api/src/core-bridge/notify-config*.ts` (resolve + env map → `VIBE_MONITOR_*`), `bin/notify-config-apply` (new; mirror `bin/backup-config-apply`) + `bin/vibe` dispatch + `VIBE_OPS` op, `packages/api/src/routers/settings.ts` (`notifyConfigGet/Set`), `web/src/routes/_auth/settings.tsx` (wire the Notifications tab Save), optional "Send test" via a `bin/monitor --test`/notify op.
**Do:** Store Telegram bot token (secret, write-only) + chat id + webhook URL + alert-on-warn in `panel.db` (global + optional per-site); on save, write `VIBE_MONITOR_TELEGRAM_TOKEN/CHAT_ID`, `VIBE_MONITOR_WEBHOOK_URL`, `VIBE_MONITOR_ALERT_ON_WARN` into each site's env (atomic writer) so the monitor cron delivers alerts. Wire the unwired Save button.
**Acceptance:** saving channels persists + writes env; the monitor uses them; secret never read back; a test alert can be sent.

### Task 3C — R2 "Test connection" (backupConfigTest)
**Files:** `bin/vibe` + a `backup-test` command (run `rclone lsd R2:` with injected env), `VIBE_OPS` op `backupTest`, `packages/api/src/routers/settings.ts` (`backupConfigTest`), `web/src/components/settings/r2-global-card.tsx` (Test button).
**Do:** Resolve R2 env (existing `backupConfigEnv`), run an allowlisted rclone connectivity probe, return `{ ok, message }`. Add a "Test connection" button to the global R2 card.
**Acceptance:** valid creds → green; bad creds → clear error; secret never printed.

---

## Phase 4 — Team & roles (Plan C)

### Task 4A — RBAC bootstrap-role refinement + admin-context signup allowance
**Files:** `control-panel/packages/auth/src/index.ts`.
**Do:** Refine the `before` hook from Task 1A so admin-plugin `createUser` (authenticated admin context) is allowed and RESPECTS a provided role (`role: newUser.role ?? (firstUser ? "admin" : "viewer")`), while public `/sign-up/email` stays bootstrap-only. Add the `adminClient` access-control to the web auth client.
**Acceptance:** admin can create operator/viewer users with the role sticking; public signup still closed.

### Task 4B — Team management API
**Files:** new `packages/api/src/routers/team.ts` (+ wire into `routers/index.ts`).
**Do:** Admin-gated procedures: `teamList` (list users + roles), `teamCreate` (email + temp password + role via admin plugin), `teamSetRole`, `teamRemove`/ban. Use the better-auth admin plugin server API. No email invites (deferred) — admin sets a temp password.
**Acceptance:** procedures enforce admin; create/list/set-role/remove work end to end.

### Task 4C — Settings → Team UI
**Files:** `web/src/routes/_auth/settings.tsx` (new "Team" tab, admin-only), `web/src/lib/auth-client.ts` (add `adminClient` plugin), a `web/src/components/settings/team-card.tsx`.
**Do:** Admin-only Team tab: user list with role badges, add-user form (email + password + role), change-role, remove. Hidden for non-admins.
**Acceptance:** admin manages the team from the UI; non-admins don't see the tab; role changes reflect immediately.

---

## Per-phase definition of done
Gate green (types/lint/build + shell tests), adversarial review (verified findings fixed), deployed to the test VPS, and the phase's user-facing behavior validated (data-layer where browser login isn't possible).
