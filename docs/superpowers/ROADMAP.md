# Vibe WP — Status & Roadmap

Last updated: 2026-06-26. This is the canonical "what's shipped / what's next" record. It supersedes the per-phase status scattered across `docs/superpowers/plans/*` and `docs/product-roadmap.md` (which lag the code). The detailed execution history lives in `.superpowers/sdd/progress.md`.

## Current Pre-Tauri Reconciliation — 2026-06-26

Tauri stays scaffold-only until the web panel, distribution/update, safe sync,
and local workflow are production-proofed. Current live-code status:

- **Web panel:** broad GUI/API surface is built, with 24 router groups, server-side
  RBAC, persisted/audited jobs, central realtime invalidation, support bundle
  download, and GUI-triggered panel update. Local code/tests exist. VPS proof on
  2026-06-26 covered `bin/panel install`, break-glass password reset, HTTPS
  smoke, support-bundle generation via the sudoers wrapper with no secret leak,
  clean `bin/panel update`, failed-update rollback from a forced deploy failure,
  and panel safe staging push via the `stagingPushToLive` stream. Authenticated
  browser proof on the same VPS covered sign-in, site discovery, staging
  navigation, the destructive publish confirmation, operations tray creation,
  the active operation dialog, realtime stream steps, and the terminal
  `[done] Push to live succeeded` line with no browser console, page, or request
  failures.
- **Distribution/update:** `bin/panel install/update/uninstall/reset-password`
  and the `vibe-panel` least-privilege runner are built. Public install site
  artifacts are regenerated for installer `0.1.5`. `bin/panel update` now takes
  a local snapshot of the previous panel app and data directory before deploy and
  restores that snapshot if deploy fails, giving the panel DB a pre-migration
  recovery point. VPS validation on 2026-06-26 caught and fixed three release
  blockers: Bun bootstrap now installs `unzip` first, deploy failures now return
  non-zero even under shell `if deploy_panel`, and installer host prep installs
  `make` before `make init-*`. Missing before broad distribution:
  post-deploy health-based rollback and release-channel/version pinning.
- **Sync:** existing primitives are safe enough for current staging use:
  refresh takes a production backup before restoring to staging, and the panel
  safe push-to-live path snapshots prod, promotes managed files, verifies, and
  auto-rolls back. VPS validation on 2026-06-26 covered production-to-staging
  refresh, direct managed-file promote, a panel safe-push rollback on a forced
  permission failure, the fixed safe-push happy path, and a browser-driven
  safe-push run through the confirmation and realtime tray/dialog. Raw
  `stagingPromote` now fails closed. A read-only
  `stagingSyncPlan` API now returns source/target identity, selected scope,
  backup timing, URL rewrite intent, apply role, and blocking identity conflicts.
  Missing before desktop sync: persisted plan ids, freshness/drift checks, URL
  rewrite preview/counts, and structured apply-time JSON/NDJSON output. See
  `docs/sync-contract.md`.
- **Local workflow:** root `local` Compose and installer `--local` sandbox exist.
  A new headless local workflow foundation now exposes local inventory/create/
  reset/delete blueprint state under `.vibe-local`; no desktop UI or local
  pull/push is built yet. CLI domain overrides now also rederive the default
  backup root, so headless plans do not keep the inherited `example` backup path.
- **Docs:** `docs/product-roadmap.md` is archival vision only. Treat old
  feature-wave rows below as historical unless they match this reconciliation
  and live code.

---

## Part A — Shipped (verified against code)

**Installer (TUI + headless core)** — all install modes: new-site, manage-existing, remove(+purge), update-existing, staging-only, external-services (`installer/src/core/{install-plan,external-plan,operations-plan,manage-operations}.ts`); headless API (`--headless-json`/`--dry-run`/`--resume`/`--export-plan`/`--support-bundle`, `core/headless.ts`); panel-first bootstrap mode (`core/panel-bootstrap-plan.ts`, `panel-access.ts`, `host-install.ts`, `screens/panel-screen.tsx`).

**bin/ substrate** — lifecycle (`bin/vibe`), backups (`backup`, `backup-verify`, `backup-test`, `backup-config-apply`, `backup-schedule-apply`), monitoring (`monitor`, `monitor-schedule-apply`, `notify-config-apply`, `notify-test`), security (`harden`, `security-status`), site config (`site-config-apply`, `caddy-www-apply`, `schedule-status`), panel deploy (`bin/panel`, `vibe-panel-run`).

**Panel backend** — exec chokepoint with op allowlist + argv-arrays + redaction + setsid/kill-tree (`core-bridge/exec.ts`); 24 router groups (setup, health, control-overview, lifecycle, sites, backups, operations, preflight, provisioning, server, staging, logs, updates, inventory, plugins, themes, settings, devinfo, shared-db, security-score, monitoring, security-radar, performance, wp-users); persisted jobs + audit + orphan-reconcile + reaper (`core-bridge/{jobs,jobs-db,audit}.ts`); provisioning (create/external/staging/remove).

**Auth / RBAC** — better-auth, roles viewer<operator<admin, race-safe single admin (partial unique index), password policy + rate-limit (DB storage), public `needsSetup` probe + closed registration, `bin/panel reset-password` break-glass.

**Panel frontend** — Calm-Operator sidebar shell, all `_auth/` routes, live streaming (`lib/live/`, `live-operation.tsx`, `live-log-tail.tsx`), operations tray + auto-scroll, ⌘K palette, Users + Profile pages, Operations history, per-site Settings (PHP image, FastCGI cache, debug, www alias, schedules).

**One-command bootstrap** — `bin/panel install --access domain|magic-dns|ip-port|localhost`, off-root `vibe-panel` service behind the sudoers-gated `vibe-panel-run` wrapper, `PANEL_HOST_DIR=/opt/vibe-wp-src` (checkout separated from the `/opt/vibe-wp` site default), `install.sh` clone, owner-via-env. **VPS-validated** (real LE cert via magic-DNS, off-root service, auth, host op through the wrapper, site detection) on 178.104.10.126, 2026-06-23.

**Released/current code:** installer `0.1.5`; public install-site artifacts in this checkout are generated from `public-install/build-site.sh 0.1.5`.

### Deferred / out-of-scope (still valid)
Single-binary distribution (blocked: libsql native driver) · Tauri desktop (scaffold only) · multi-server/fleet · invite emails (covered by `admin.createUser` + reset-password) · `disableSignUp` (intentionally not set — the hook closes registration; owner bootstrap needs sign-up open).

### Genuinely not-yet-built
~~A few GUI-parity conveniences from the bootstrap spec §11~~ ✅ SHIPPED 2026-06-25 (main `73b6d5b`): AI-connector-key entry in the create-site wizard (masked, optional, via STDIN), support-bundle download from the panel (VPS-validated: 0 secret leaks), GUI-triggered stack update (`panel update` detached via systemd-run, wrapper rejects all args), create-site DNS-preflight gating (resolved-IP vs VPS-IP, with override). All adversarially reviewed (PASS) + host-op-validated.

---

## Part A.5 — Feature wave 2 SHIPPED (2026-06-25, merged to main b42959a)

All remaining roadmap features built (multi-agent workflow), fully implemented + GUI-complete + idiot-proof-polished (adversarial review: all PASS), and merged:
- **C. Security score + one-click Secure** — score/findings + working XML-RPC + file-edit one-click fixes. VPS-validated: file-edit lock + xmlrpc disable confirmed at runtime (caught+fixed a real bug: VIBE_WP_DISABLE_XMLRPC wasn't threaded into the compose env anchor).
- **B. Uptime/cert/DNS monitoring with history** — Drizzle sample store + status view + timeline (recharts).
- **D. Backup browser + granular restore** — browse files/tables, single-item restore. VPS-validated: list + table restore + pre-restore safety copy confirmed.
- **E. Vuln + abandoned-plugin radar** — wp.org abandoned/outdated detection (works without a key) + pluggable CVE feed + quarantine actions.
- **#5. Smart performance tuning** — measure → advisor → preview → apply with snapshot + post-apply smoke + auto-rollback. VPS-validated: measure + apply + rollback mechanism confirmed.
- **A. Staging clone + safe push-to-live** — promote wrapped in backup→smoke→auto-rollback.

VPS bootstrap rebuilt clean (Docker+Caddy+Bun+off-root panel, magic-DNS cert) on test.vcode.sh; panel live. Host-op/runtime layer validated by the controller; authenticated GUI verification is owner-side (login required).

---

## Part B — Historical Feature-Wave Ledger

This table is a historical ledger from the 2026-06-23/25 feature wave, not the
current next-work queue. Use the 2026-06-26 reconciliation above plus live code
for present status. **Cross-cutting rule:** every new panel→host capability = a
new `bin/vibe` op + a `VIBE_OPS` entry (`core-bridge/exec.ts`) + an allowlist
token in `bin/vibe-panel-run` with argument re-validation at the root boundary
(distrust the panel), env-file-only secrets, and `redact()` on all output.

| # | Feature | Exists today | Approach (summary) | Effort | Stakes |
|---|---------|--------------|--------------------|--------|--------|
| 1 | **Proper logs** ✅ SHIPPED | ~~`logsRecent`/`logsFollow` (nginx/php/wp, tail 200)~~ DONE | Built & merged to main (`ac983d3`, 2026-06-24): validated `service` enum (nginx/php/wp/mariadb/redis/access/all) + bounded tail across the 3 host gates; server-side filter; severity + `cache=` badges; admin-only `logsExport`; router-side IPv4+IPv6/SQL PII masking on recent+export+live; Compose log rotation; Logs UI. 218 api + 72 web tests. **Pending: VPS Phase-5 validation (needs branch deployed + a live site) and `git push` (local merge only).** |
| 2 | **SMTP relay + server mail** ✅ SHIPPED | ~~nothing (mail silently fails)~~ DONE | Built, merged to main (`f9535ad`), VPS-validated end-to-end 2026-06-24: maintained `msmtp` + queue/retry shims (send→spool→cron-flush), generic SMTP (no provider lock-in), off/relay/log modes, `/etc/msmtprc` rendered 0600 from env, `vibe-wp-smtp` MU plugin (wp_mail_from), `smtp-config-apply`(+recreate)/`smtp-test`(in-container) ops, SMTP_* in sudoers env_keep (+drift guard), admin Mail card. VPS validation caught + fixed 6 host/container/sudo integration bugs unit tests+review missed. |
| 3 | **Companion "Insights" plugin** ✅ SHIPPED (data backbone) | ~~none~~ DONE | Built, merged to main (`640f33a`), VPS-validated end-to-end 2026-06-24: `vibe-wp-insights.php` mu-plugin (×2 mirror + CI md5 guard) writes a 512KB-capped, **secret-free** `wp-content/.vibe/insights.json` on 15-min WP-cron; panel reads it via the `insights` op (in-container read — wp-content is a named volume) + strict size-capped Zod parser; exposes WP/PHP/DB + full plugin/theme inventory (versions/update/active/auto-update) + Site Health + security signals + cache status; read-only Inventory page + live Refresh. **Vuln feed + security score deferred** (need the external-feed decision). VPS caught+fixed 2 runtime bugs (volume read path, cache-init null-bool). |
| 4 | **Plugin/update mgmt + safe-update** ✅ Built in live code | ~~`updatesAvailable` + `updatesApply`~~ DONE | Structured wp allowlist (verb × slug/version regex) replacing the 4-string lock; per-item plugin/theme activate/deactivate/update/delete + auto-update toggles; scheduled auto-updates (systemd timer); **safe-update job** = backup → update → smoke+TTFB → auto-rollback. **Install dropped** (owner decision — owners use wp-admin); core stays operator; central `WP_ACTION_TIERS` map; `safeUpdate` operator with standalone restore kept admin-only. **Independent wrapper security review: CONDITIONAL PASS (§5.3 satisfied), LC_ALL=C hardening applied.** Historical VPS proof exists for the feature branch; re-run targeted GUI/VPS proof before a new release claim. | M (+S safe-update) | high (allowlist) |
| 5 | **Smart performance tuning** | install-time presets + `perf-report --json` | measure (FPM pm.status, OPcache, Redis evictions, InnoDB read-ratio, FastCGI hit, host RAM over a window) → deterministic `perf-advisor` (explainable env deltas, reserve ≤85% RAM) → preview-diff → `perf-apply` job (fixed tunable-key allowlist) → snapshot + post-apply smoke + **auto-rollback** | L | med (OOM) |
| 6 | **Shared host MariaDB** ✅ Built in live code, targeted proof still needed | full feature live | `vibe-wp-shared-db` compose (no port), `db-provision`/`db-deprovision` (least-priv `vibe_<slug>` DB+user, subnet host-grant, off-`ps` root cred), `shared-db` wrapper subcommand (+rotate-root), backup+weekly timer, root rotation, SF-2 `local_infile=0`, panel admin lifecycle (status/init/rotate); **site-provisioning** (`compose.shared-db.yaml` external-DB/internal-Redis topology + installer `shared-db` mode + panel `createSharedDb`) and **wizard Database step + Shared-database settings card**; `migrate-to-shared-db` (reversible). Historical VPS proof exists for isolation and a real shared-DB site. Remaining proof before broad release: `migrate-to-shared-db` on a real per-container site. | L | **highest** (cross-tenant leak) |

### High-leverage extras (ride existing signal)
- **A. Staging clone + safe "push to live"** (S–M) — extends existing staging refresh/promote with the safe-update backup/rollback pattern.
- **B. Uptime + cert-expiry + DNS monitoring with history** (S) — `monitor --json` + `notify-config` already collect/deliver; add a status-page view + cert-days/DNS-drift tiles.
- **C. Per-site security score + one-click Secure** — built in live code: security score/radar routers, UI cards, XML-RPC/file-edit fixes, and supporting env flags exist. Re-run targeted GUI/VPS proof before treating this as newly validated for release.
- **D. Backup browser + granular restore + verified-offsite badge** (S–M) — browse a backup, restore just a file/table; surface "last offsite backup verified N h ago".
- **E. Vulnerability + abandoned-plugin radar with quarantine** (M) — Insights + host-fetched vuln feed → flag CVEs/abandoned, offer safe-update or deactivate.

### Build order (dependency-aware, quick-wins + foundations first)
1. ~~**Logs (#1)**~~ ✅ **DONE** (merged `ac983d3`, 2026-06-24; VPS validation + push pending). Plan: `plans/2026-06-24-feature-1-logs.md`.
2. ~~**SMTP relay (#2)**~~ ✅ **DONE** (merged `f9535ad`, VPS-validated, 2026-06-24). Plan: `plans/2026-06-24-feature-2-smtp-relay.md`. Lesson: the host/container/sudo boundary needs VPS validation — 6 integration bugs slipped past unit tests + whole-branch review.
3. ~~**Insights plugin (#3)**~~ ✅ **DONE** (data backbone; merged `640f33a`, VPS-validated, 2026-06-24). Vuln feed + security score deferred.
4. ~~**Plugin/update mgmt + safe-update (#4)**~~ ✅ built in live code; re-run targeted proof before release claims. Spec: `specs/2026-06-23-feature-4-plugin-update-mgmt-design.md`; plan: `plans/2026-06-24-feature-4-plugin-update-mgmt.md`.
5. **Quick-win extras B, C, D** — parallelizable on existing ops + #3.
6. **Smart perf tuning (#5)** — needs #3 + extended perf-report; advisory-first.
7. **Vuln radar (E)** — needs #3 + #4.
8. **Shared MariaDB (#6)** — last, highest-stakes; formal spec + security review before code; opt-in.
9. **Staging clone polish (A)** — slot in once safe-update exists.

Each feature gets its own brainstorm → spec → plan → subagent-driven build → review → VPS-validate, per the established workflow.
