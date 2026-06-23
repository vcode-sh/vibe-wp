# Vibe WP — Status & Roadmap

Last updated: 2026-06-23. This is the canonical "what's shipped / what's next" record. It supersedes the per-phase status scattered across `docs/superpowers/plans/*` and `docs/product-roadmap.md` (which lag the code). The detailed execution history lives in `.superpowers/sdd/progress.md`.

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

## Part B — Next feature wave ("Plesk WP Toolkit, host-native + idiot-proof")

Grounded in a 2026-06-23 research pass (full dossier in this session's history). **Cross-cutting rule:** every new panel→host capability = a new `bin/vibe` op + a `VIBE_OPS` entry (`core-bridge/exec.ts`) + an allowlist token in `bin/vibe-panel-run` with argument re-validation at the root boundary (distrust the panel), env-file-only secrets, and `redact()` on all output. The two highest-care widenings are the **wp slug/verb allowlist** (#4) and the **db-provision root path** (#6) — both need a wrapper-specific security review.

| # | Feature | Exists today | Approach (summary) | Effort | Stakes |
|---|---------|--------------|--------------------|--------|--------|
| 1 | **Proper logs** | `logsRecent`/`logsFollow` (nginx/php/wp, tail 200) | Add validated `service` enum (+mariadb/redis/cron/access) + bounded tail; server-side search; redacted download (`logsExport`); Logs UI page | S–M | low |
| 2 | **SMTP relay + server mail** | nothing (mail silently fails) | `msmtp` in WP image rendering `/etc/msmtprc` from `SMTP_*` env; `smtp-config-apply`/`smtp-test` ops; Mail settings card; host-level shared relay (transactional provider or one Postfix null-client) as the idiot-proof default; SPF/DKIM checklist in UI | M | med (deliverability) |
| 3 | **Companion "Insights" plugin** (foundational) | none (panel reads WP via 3 wp-cli forms) | mu-plugin writes a signed JSON facts drop-file (`wp-content/.vibe/insights.json`); panel reads via new `insights` op (read-only, strict zod schema); exposes plugin/theme inventory+versions+update/active state, Site Health, vuln/EOL signals (host-fetched feed joined by slug), users/last-login | M | med |
| 4 | **Full plugin/update mgmt + safe-update** | `updatesAvailable` (count) + `updatesApply` (all) | Structured wp allowlist (verbs × strict slug/version regex, no eval/db/path); per-item activate/deactivate/install(wp.org-only)/delete/update + themes + auto-update toggles; **safe-update job** = pre-update backup → update → smoke+TTFB → auto-restore on regression (all primitives exist) | M (+S safe-update) | high (allowlist) |
| 5 | **Smart performance tuning** | install-time presets + `perf-report --json` | measure (FPM pm.status, OPcache, Redis evictions, InnoDB read-ratio, FastCGI hit, host RAM over a window) → deterministic `perf-advisor` (explainable env deltas, reserve ≤85% RAM) → preview-diff → `perf-apply` job (fixed tunable-key allowlist) → snapshot + post-apply smoke + **auto-rollback** | L | med (OOM) |
| 6 | **Shared host MariaDB** | external-services mode = connection plumbing (assumes DB/user exist) | One shared MariaDB container; `db-provision`/`db-deprovision` ops create per-site DB + **least-privilege per-site user** (own DB only, no mysql.*/SUPER/GRANT), pinned host-grant + internal-network isolation; root cred in 0600 host file; per-site dumps unchanged; opt-in per site | L | **highest** (cross-tenant leak) |

### High-leverage extras (ride existing signal)
- **A. Staging clone + safe "push to live"** (S–M) — extends existing staging refresh/promote with the safe-update backup/rollback pattern.
- **B. Uptime + cert-expiry + DNS monitoring with history** (S) — `monitor --json` + `notify-config` already collect/deliver; add a status-page view + cert-days/DNS-drift tiles.
- **C. Per-site security score + one-click Secure** (M) — `harden`/`security-status` + Insights signals → a score + fix buttons (XML-RPC, file-edit, version hiding, vuln plugins).
- **D. Backup browser + granular restore + verified-offsite badge** (S–M) — browse a backup, restore just a file/table; surface "last offsite backup verified N h ago".
- **E. Vulnerability + abandoned-plugin radar with quarantine** (M) — Insights + host-fetched vuln feed → flag CVEs/abandoned, offer safe-update or deactivate.

### Build order (dependency-aware, quick-wins + foundations first)
1. **Logs (#1)** — quick win, no new security model.
2. **SMTP relay (#2)** — high user value, self-contained, mirrors existing config-apply.
3. **Insights plugin (#3)** — the data backbone for #4, #5, C, E.
4. **Plugin/update mgmt + safe-update (#4)** — daily-driver; needs #3 inventory.
5. **Quick-win extras B, C, D** — parallelizable on existing ops + #3.
6. **Smart perf tuning (#5)** — needs #3 + extended perf-report; advisory-first.
7. **Vuln radar (E)** — needs #3 + #4.
8. **Shared MariaDB (#6)** — last, highest-stakes; formal spec + security review before code; opt-in.
9. **Staging clone polish (A)** — slot in once safe-update exists.

Each feature gets its own brainstorm → spec → plan → subagent-driven build → review → VPS-validate, per the established workflow.
