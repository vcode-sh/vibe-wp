# Control Panel Features — Implementation Plan (Phases 5–8)

> Built phase-by-phase via dispatched agent teams. Each task: scoped to disjoint files, central gate (`bun run check-types && bun run check && bun run build` from `control-panel/`, `sh -n` for shell, `bun run test`), adversarial review (findings verified), fix, deploy to test VPS, validate. Branch: `control-panel-features`.

**Goal:** implement the remaining panel features after the 4 completion pillars — provisioning (the panel's reason for existing), wiring/honesty leftovers, feature depth, and the infra/hardening tail. Scope = "everything except Tauri" (Tauri desktop + single-binary build deferred).

## Global constraints
- Single host-exec chokepoint: `packages/api/src/core-bridge/exec.ts`. Provisioning adds a NEW allowlisted path that runs the **installer binary** (not a site's `bin/vibe`); inputs validated before spawn, passed as argv arrays, secrets never in argv (use env/stdin) and always redacted before streaming/persisting.
- The panel DELEGATES to the installer headless core + `bin/vibe`; it never reimplements provisioning logic.
- TS/TSX ≤220 lines; no `any`; oRPC + TanStack; shadcn primitives + semantic tokens; English copy; destructive actions behind explicit confirm + admin-gated.
- Reuse the existing jobs/streaming/audit infra (`startJob`, `LineStream`, SSE, operations tray) for long-running provisioning.

---

## Phase 5 — Provisioning & site lifecycle

The installer exposes a frontend-agnostic brain: `runHeadless` (plan + runPlan), `--headless-json` (single-shot stdin→stdout), and a flag CLI `--mode {new-site,external-services,staging-only,remove-existing} --yes [input flags]`. Compiled binaries: `installer/dist/vibe-wp-installer-linux-{x64,arm64}`. Inputs map to `InstallerState` (installer/src/core/types.ts); validation rules in `installer/src/core/validation.ts`.

### Task 5a — Installer-headless exec bridge (FOUNDATION; everything else depends on it)
**Files:** `control-panel/packages/api/src/core-bridge/exec.ts` (new `streamProvision`/`PROVISION_OPS`), `control-panel/packages/env/src/server.ts` (new `PANEL_INSTALLER_BIN`), `bin/panel` (install the installer binary on the host).
**Do:**
- Resolve the installer binary via a new env `PANEL_INSTALLER_BIN` (default `/opt/vibe-wp-panel/bin/vibe-wp-installer`). `bin/panel install` must place the correct-arch binary there (build from `installer/` if `dist/` is stale, or copy the committed binary; chmod +x).
- Add `PROVISION_OPS` allowlist (modes new-site/external-services/staging-only/remove-existing) and `streamProvision(mode, validatedFlags, opts)` beside `streamVibe` — argv = `[bin, "--mode", mode, "--yes", ...flags]`, run under setsid kill-tree + STREAM_TIMEOUT_MS, output merged + redacted, exposed as a streamed job (reuse `startJob`/`LineStream`).
- **Secrets:** determine how the installer accepts secrets (admin/DB/Redis passwords, R2 secret) WITHOUT putting them in argv — prefer env vars or the `--headless-json` stdin path. If the streaming flag-path requires secret flags, pass them via env the installer reads, or document the root-only ps exposure + mitigation. Confirm against `installer/src/cli/`.
- Validate `mode` against the allowlist; validate flag VALUES (never interpolate; argv array).
**Acceptance:** a unit/integration check that `streamProvision` builds the correct argv for each mode and rejects unknown modes; `bin/panel install` lands the binary; secrets never appear in argv or redacted output.

### Task 5b — Provisioning router + contract + typed glue
**Files:** new `control-panel/packages/api/src/routers/provisioning.ts` (+ wire `routers/index.ts`); `control-panel/packages/api/src/contract.ts` (input/result types).
**Do:** admin-gated procedures `createSite`, `createExternal`, `attachStaging`, `removeSite` — each zod-validated (mirror `installer/src/core/validation.ts`: domain regex, slug, admin password ≥16, ports 1024-65535, blocked example.com, external creds, staging domain must differ from prod), map inputs → installer flags, call `streamProvision` via `startJob`, return `{ jobId }` for the operations tray. `removeSite` takes an explicit `purge` boolean.
**Acceptance:** procedures enforce admin; invalid inputs rejected by zod; valid inputs produce a streamed job.

### Task 5c — Provisioning wizards (UI)
**Files:** `web/src/routes/_auth/sites/index.tsx` (wire "New site" + "External DB & Redis"), a new `web/src/routes/_auth/sites/new.tsx` (multi-step wizard, split into ≤220-line step components under `web/src/components/provisioning/`), `web/src/routes/_auth/sites/$siteId/staging.tsx` (replace the "Add staging" toast with a domain dialog → attachStaging), a site-remove control (graceful + full-delete purge behind a strong typed-confirm) reachable from site settings/overview.
**Do:** each wizard collects validated inputs, surfaces DNS-preflight result inline before run (reuse the installer's DNS preflight where possible), fires the provisioning mutation, hands the `jobId` to `useOperations().start()` for the live-log drawer, and on success navigates/invalidates. Secrets entered over TLS, never echoed back.
**Acceptance:** New site / External / Add staging / Remove flows run end to end as streamed jobs with live output; destructive remove requires typed confirmation.

**Phase 5 validate (VPS):** create a throwaway site via the wizard (or the procedure) → it provisions + appears in the list; attach staging → staging.refresh/promote become usable; remove --purge tears it down. (Destructive steps confirmed before running.)

---

## Phase 6 — Wiring / honesty leftovers (mostly small, parallelizable)
- **Real log timestamps + per-line source badge:** `parseLogLines` sets epoch `new Date(0)` and tags every line with the requested source. Parse the real timestamp + emitting service from the compose log line; fix `logs.ts`/`parse.ts` + the log tail UI.
- **Health "Alerts" from real notify config:** `health.ts` returns `alertChannels: []`; populate from the resolved notify config (Phase-3 `notify_config`).
- **"Needs you" backup action + "Restore" link:** overview "Needs you" action should run the backup for backup-missing/stale needs; the "Restore a backup…" link should navigate to the Backups page, not toast.
- **`controlCapabilities` real status:** the control-overview/about surface hardcodes `status:'planned'` for shipped features — derive real status.
- **cert/disk/security NeedItems:** produce the TLS-expiry / low-disk / security-regression needs the contract promises (TLS days from monitor, disk from doctor/server, security from `security-status`).

## Phase 7 — Feature depth
- **Site settings page:** expand `/sites/$siteId/settings` beyond off-site backups — domain/aliases, PHP version, FastCGI cache toggle, WP debug, retention (read/write via `bin/vibe env` + a safe env-writer op, mirroring backup-config-apply).
- **Backup schedule cadence:** off/daily/weekly editable from the panel (write the cron/timer cadence via a config-apply op).
- **Real "Developer details":** container status, raw perf metrics, live-log link, env summary on the overview.
- **Operations/job-history + audit-log viewer:** `operations.list` procedure (read persisted jobs + audit_log) + a UI to see past ops (who/what/when/result) per site and server-wide.

## Phase 8 — Infra / hardening
- **Dedicated `vibe-panel` user + sudoers + `bin/vibe-panel-run` wrapper:** stop running the panel as root; constrain to an allowlisted sudo wrapper (spec §2a/§6). Validate the panel still performs all ops under the reduced privileges.
- **Team remove → reversible ban:** switch `removeUser` (hard delete) to `banUser`/`unbanUser` (spec §2a), keep a delete option behind a stronger confirm.
- **Rate-limit DB storage:** configure better-auth `rateLimit.storage:'database'` so sign-in limits survive restarts.
- **Job/audit pruning:** prune persisted `jobs`/`audit_log` rows beyond a retention window (the panel.db must not grow unbounded).
- **`bin/panel update` + `bin/panel logs`:** in-place upgrade + service-log tail subcommands.

## Per-phase definition of done
Gate green, adversarial review (verified findings fixed), deployed to the test VPS, phase behavior validated at the safest available layer (data/shell/API where browser login isn't possible).
