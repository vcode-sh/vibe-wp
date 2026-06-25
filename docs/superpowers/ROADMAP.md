# Vibe WP — Status & Roadmap

Last updated: 2026-06-24. This is the canonical "what's shipped / what's next" record. It supersedes the per-phase status scattered across `docs/superpowers/plans/*` and `docs/product-roadmap.md` (which lag the code). The detailed execution history lives in `.superpowers/sdd/progress.md`.

---

## Part A — Shipped (verified against code)

**Installer (TUI + headless core)** — all install modes: new-site, manage-existing, remove(+purge), update-existing, staging-only, external-services (`installer/src/core/{install-plan,external-plan,operations-plan,manage-operations}.ts`); headless API (`--headless-json`/`--dry-run`/`--resume`/`--export-plan`/`--support-bundle`, `core/headless.ts`); panel-first bootstrap mode (`core/panel-bootstrap-plan.ts`, `panel-access.ts`, `host-install.ts`, `screens/panel-screen.tsx`).

**bin/ substrate** — lifecycle (`bin/vibe`), backups (`backup`, `backup-verify`, `backup-test`, `backup-config-apply`, `backup-schedule-apply`), monitoring (`monitor`, `monitor-schedule-apply`, `notify-config-apply`, `notify-test`), security (`harden`, `security-status`), site config (`site-config-apply`, `caddy-www-apply`, `schedule-status`), panel deploy (`bin/panel`, `vibe-panel-run`).

**Panel backend** — exec chokepoint with op allowlist + argv-arrays + redaction + setsid/kill-tree (`core-bridge/exec.ts`); 14 oRPC routers (sites, health, backups, lifecycle, logs, staging, updates, server, operations, provisioning, settings, devinfo, setup, control-overview); persisted jobs + audit + orphan-reconcile + reaper (`core-bridge/{jobs,jobs-db,audit}.ts`); provisioning (create/external/staging/remove).

**Auth / RBAC** — better-auth, roles viewer<operator<admin, race-safe single admin (partial unique index), password policy + rate-limit (DB storage), public `needsSetup` probe + closed registration, `bin/panel reset-password` break-glass.

**Panel frontend** — Calm-Operator sidebar shell, all `_auth/` routes, live streaming (`lib/live/`, `live-operation.tsx`, `live-log-tail.tsx`), operations tray + auto-scroll, ⌘K palette, Users + Profile pages, Operations history, per-site Settings (PHP image, FastCGI cache, debug, www alias, schedules).

**One-command bootstrap** — `bin/panel install --access domain|magic-dns|ip-port|localhost`, off-root `vibe-panel` service behind the sudoers-gated `vibe-panel-run` wrapper, `PANEL_HOST_DIR=/opt/vibe-wp-src` (checkout separated from the `/opt/vibe-wp` site default), `install.sh` clone, owner-via-env. **VPS-validated** (real LE cert via magic-DNS, off-root service, auth, host op through the wrapper, site detection) on 178.104.10.126, 2026-06-23.

**Released:** installer `0.1.3` (the bootstrap) — tag `installer-v0.1.3` → CI → `wp.vcode.sh`.

### Deferred / out-of-scope (still valid)
Single-binary distribution (blocked: libsql native driver) · Tauri desktop (scaffold only) · multi-server/fleet · invite emails (covered by `admin.createUser` + reset-password) · `disableSignUp` (intentionally not set — the hook closes registration; owner bootstrap needs sign-up open).

### Genuinely not-yet-built
A few GUI-parity conveniences from the bootstrap spec §11: AI-connector-key entry in the create-site wizard, support-bundle download from the panel, GUI-triggered stack update, create-site DNS-preflight gating.

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

## Part B — Next feature wave ("Plesk WP Toolkit, host-native + idiot-proof")

Grounded in a 2026-06-23 research pass (full dossier in this session's history). **Cross-cutting rule:** every new panel→host capability = a new `bin/vibe` op + a `VIBE_OPS` entry (`core-bridge/exec.ts`) + an allowlist token in `bin/vibe-panel-run` with argument re-validation at the root boundary (distrust the panel), env-file-only secrets, and `redact()` on all output. The two highest-care widenings are the **wp slug/verb allowlist** (#4) and the **db-provision root path** (#6) — both need a wrapper-specific security review.

| # | Feature | Exists today | Approach (summary) | Effort | Stakes |
|---|---------|--------------|--------------------|--------|--------|
| 1 | **Proper logs** ✅ SHIPPED | ~~`logsRecent`/`logsFollow` (nginx/php/wp, tail 200)~~ DONE | Built & merged to main (`ac983d3`, 2026-06-24): validated `service` enum (nginx/php/wp/mariadb/redis/access/all) + bounded tail across the 3 host gates; server-side filter; severity + `cache=` badges; admin-only `logsExport`; router-side IPv4+IPv6/SQL PII masking on recent+export+live; Compose log rotation; Logs UI. 218 api + 72 web tests. **Pending: VPS Phase-5 validation (needs branch deployed + a live site) and `git push` (local merge only).** |
| 2 | **SMTP relay + server mail** ✅ SHIPPED | ~~nothing (mail silently fails)~~ DONE | Built, merged to main (`f9535ad`), VPS-validated end-to-end 2026-06-24: maintained `msmtp` + queue/retry shims (send→spool→cron-flush), generic SMTP (no provider lock-in), off/relay/log modes, `/etc/msmtprc` rendered 0600 from env, `vibe-wp-smtp` MU plugin (wp_mail_from), `smtp-config-apply`(+recreate)/`smtp-test`(in-container) ops, SMTP_* in sudoers env_keep (+drift guard), admin Mail card. VPS validation caught + fixed 6 host/container/sudo integration bugs unit tests+review missed. |
| 3 | **Companion "Insights" plugin** ✅ SHIPPED (data backbone) | ~~none~~ DONE | Built, merged to main (`640f33a`), VPS-validated end-to-end 2026-06-24: `vibe-wp-insights.php` mu-plugin (×2 mirror + CI md5 guard) writes a 512KB-capped, **secret-free** `wp-content/.vibe/insights.json` on 15-min WP-cron; panel reads it via the `insights` op (in-container read — wp-content is a named volume) + strict size-capped Zod parser; exposes WP/PHP/DB + full plugin/theme inventory (versions/update/active/auto-update) + Site Health + security signals + cache status; read-only Inventory page + live Refresh. **Vuln feed + security score deferred** (need the external-feed decision). VPS caught+fixed 2 runtime bugs (volume read path, cache-init null-bool). |
| 4 | **Plugin/update mgmt + safe-update** ✅ BUILT (branch `control-panel-plugin-mgmt`, VPS-validated 2026-06-24, pending merge) | ~~`updatesAvailable` + `updatesApply`~~ DONE | Structured wp allowlist (verb × slug/version regex) replacing the 4-string lock; per-item plugin/theme activate/deactivate/update/delete + auto-update toggles; scheduled auto-updates (systemd timer); **safe-update job** = backup → update → smoke+TTFB → auto-rollback. **Install dropped** (owner decision — owners use wp-admin); core stays operator; central `WP_ACTION_TIERS` map; `safeUpdate` operator with standalone restore kept admin-only. **Independent wrapper security review: CONDITIONAL PASS (§5.3 satisfied), LC_ALL=C hardening applied.** VPS: 43/43 injection suite on real dash, live activate/deactivate/delete/auto-update/schedule-timer/insights, safe-update happy + auto-rollback paths both confirmed. 312 api + 72 web tests. | M (+S safe-update) | high (allowlist) |
| 5 | **Smart performance tuning** | install-time presets + `perf-report --json` | measure (FPM pm.status, OPcache, Redis evictions, InnoDB read-ratio, FastCGI hit, host RAM over a window) → deterministic `perf-advisor` (explainable env deltas, reserve ≤85% RAM) → preview-diff → `perf-apply` job (fixed tunable-key allowlist) → snapshot + post-apply smoke + **auto-rollback** | L | med (OOM) |
| 6 | **Shared host MariaDB** ✅ BUILT + VPS-PROVEN (branch `control-panel-shared-mariadb`, 17 commits, pending merge) | full feature live | **Done + proven:** `vibe-wp-shared-db` compose (no port), `db-provision`/`db-deprovision` (least-priv `vibe_<slug>` DB+user, subnet host-grant, off-`ps` root cred), `shared-db` wrapper subcommand (+rotate-root), backup+weekly timer, root rotation, SF-2 `local_infile=0`, panel admin lifecycle (status/init/rotate); **site-provisioning** (`compose.shared-db.yaml` external-DB/internal-Redis topology + installer `shared-db` mode + panel `createSharedDb`) and **wizard Database step + Shared-database settings card**; `migrate-to-shared-db` (reversible). **Adversarial security review GATE: PASS. VPS: isolation 31/0 (cross-tenant denial from the network, survives root rotation), no-pw-in-ps, backup+rotation live, AND a real WP site installed on the shared DB (12 wp_ tables, own Redis, no db container) with cross-tenant DENIED from a live site container.** **Remaining:** VPS-validate `migrate-to-shared-db` on a real per-container site (the only unvalidated piece); then merge. | L | **highest** (cross-tenant leak) |

### High-leverage extras (ride existing signal)
- **A. Staging clone + safe "push to live"** (S–M) — extends existing staging refresh/promote with the safe-update backup/rollback pattern.
- **B. Uptime + cert-expiry + DNS monitoring with history** (S) — `monitor --json` + `notify-config` already collect/deliver; add a status-page view + cert-days/DNS-drift tiles.
- **C. Per-site security score + one-click Secure** (M) 🚧 IN PROGRESS (branch `control-panel-security-score`) — `harden`/`security-status` + Insights signals → a score + fix buttons. **Done:** `computeSecurityScore` core (pure, 8 tests — graded 0-100 + prioritized fixable findings: debug-display, outdated core/plugins, XML-RPC, file-edit, Site Health, host firewall/fail2ban/auto-updates) + `siteSecurityScore` procedure; per-site Security UI card (building). **Remaining:** the two NEW fix ops — `disableXmlRpc` (a `VIBE_WP_DISABLE_XMLRPC` filter in the `vibe-wp-environment` MU plugin ×2 mirror) + `disableFileEdit` (a `fileEdit`→`DISALLOW_FILE_EDIT` site-config key; the WP image already honors the env) — plus their VPS validation. Other fixes (debug/core/plugins/host) route to existing actions.
- **D. Backup browser + granular restore + verified-offsite badge** (S–M) — browse a backup, restore just a file/table; surface "last offsite backup verified N h ago".
- **E. Vulnerability + abandoned-plugin radar with quarantine** (M) — Insights + host-fetched vuln feed → flag CVEs/abandoned, offer safe-update or deactivate.

### Build order (dependency-aware, quick-wins + foundations first)
1. ~~**Logs (#1)**~~ ✅ **DONE** (merged `ac983d3`, 2026-06-24; VPS validation + push pending). Plan: `plans/2026-06-24-feature-1-logs.md`.
2. ~~**SMTP relay (#2)**~~ ✅ **DONE** (merged `f9535ad`, VPS-validated, 2026-06-24). Plan: `plans/2026-06-24-feature-2-smtp-relay.md`. Lesson: the host/container/sudo boundary needs VPS validation — 6 integration bugs slipped past unit tests + whole-branch review.
3. ~~**Insights plugin (#3)**~~ ✅ **DONE** (data backbone; merged `640f33a`, VPS-validated, 2026-06-24). Vuln feed + security score deferred.
4. ~~**Plugin/update mgmt + safe-update (#4)**~~ ✅ **BUILT** (branch `control-panel-plugin-mgmt`, security-reviewed + VPS-validated 2026-06-24, pending merge). Spec: `specs/2026-06-23-feature-4-plugin-update-mgmt-design.md`; plan: `plans/2026-06-24-feature-4-plugin-update-mgmt.md`.
5. **Quick-win extras B, C, D** — parallelizable on existing ops + #3.
6. **Smart perf tuning (#5)** — needs #3 + extended perf-report; advisory-first.
7. **Vuln radar (E)** — needs #3 + #4.
8. **Shared MariaDB (#6)** — last, highest-stakes; formal spec + security review before code; opt-in.
9. **Staging clone polish (A)** — slot in once safe-update exists.

Each feature gets its own brainstorm → spec → plan → subagent-driven build → review → VPS-validate, per the established workflow.
