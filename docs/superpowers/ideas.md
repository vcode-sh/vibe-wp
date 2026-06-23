# Vibe WP — Feature Ideas (control panel)

North star: **"Plesk WP Toolkit, but host-native and idiot-proof."** Top-class capability, dead simple for non-technical WordPress owners. Captured 2026-06-23 from the owner's direction + a grounded research pass. Status + the canonical ordered roadmap live in `ROADMAP.md`; full per-feature designs land as `specs/2026-06-23-feature-N-*-design.md` in the build order below.

**Cross-cutting rule (every panel→host capability):** a new `bin/vibe` op + a `VIBE_OPS` entry (`control-panel/packages/api/src/core-bridge/exec.ts`) + an allowlist token in the root-owned `bin/vibe-panel-run` wrapper, with argument re-validation at the root boundary (distrust the panel), env-file-only secrets, and `redact()` on all output.

---

## Core features (build order)

1. **Proper logs.** Richer log surfacing: per-source (nginx/php/wp/mariadb/redis/cron/access), bounded tail, server-side search/filter, severity coloring, redacted download. Exists: `logsRecent`/`logsFollow` (nginx/php/wp only). *Quick win, low risk.*

2. **SMTP relay + server mail.** Make WordPress email actually send. `msmtp` baked into the WP image rendering `/etc/msmtprc` from `SMTP_*` env; `smtp-config-apply` + `smtp-test` ops; a Mail settings card; a host-level **shared relay** (transactional provider, or one Postfix null-client) as the idiot-proof default; SPF/DKIM checklist in the UI. Exists: nothing (mail silently fails today). *Highest everyday-pain fix.*

3. **Vibe WP companion "Insights" plugin** *(the keystone — "our own plugin, like Plesk WP Toolkit")*. A WP mu-plugin that writes a signed JSON facts drop-file (`wp-content/.vibe/insights.json`) the panel reads via a new read-only `insights` op (strict zod schema). Exposes plugin/theme inventory + versions + active/update/auto-update state, WP core + PHP + DB size, Site Health, users + last-login, and known-vuln / abandoned-plugin signals (host-fetched vuln feed joined by slug). **Data backbone** for #4, #5, and extras C/E. Exists: nothing (panel reads WP via 3 wp-cli forms).

4. **Full plugin/update management + safe-update.** List/activate/deactivate/install (wp.org only)/delete/update for plugins + themes + core, auto-update toggles, and a **safe-update job** (pre-update backup → update → smoke + TTFB → auto-restore on regression). Needs #3 for inventory; widens the wp allowlist to structured verbs × strict slug/version regex. Exists: `updatesAvailable` (count) + `updatesApply` (all).

5. **Smart performance tuning.** measure (FPM pm.status, OPcache, Redis evictions, InnoDB read-ratio, FastCGI hit, host RAM over a window) → deterministic explainable advisor (env deltas, reserve ≤85% RAM) → preview-diff → `perf-apply` job (fixed tunable-key allowlist) → snapshot + post-apply smoke + **auto-rollback**. Exists: install-time presets + `perf-report --json`. Needs #3 + extended perf-report. *Advisory-first.*

6. **Shared host MariaDB** *(highest-stakes — ships last, security review first)*. One shared MariaDB container; `db-provision`/`db-deprovision` ops create per-site DB + **least-privilege per-site user** (own DB only; no `mysql.*`/`SUPER`/`GRANT`), pinned host-grant + internal-network isolation; root cred in a 0600 host file; per-site dumps unchanged; **opt-in per site**. Saves RAM (one buffer pool vs. N). Exists: `external-services` mode = the connection layer (assumes DB/user exist; doesn't create/isolate them).

## High-leverage extras (ride existing signal; slot in after the keystone)

- **A. Staging clone + safe "push to live"** (S–M) — extend staging refresh/promote with the safe-update backup/rollback pattern. "Try a change without breaking live."
- **B. Uptime + cert-expiry + DNS monitoring with history** (S) — `monitor --json` + `notify-config` already collect/deliver; add a status-page view + cert-days/DNS-drift tiles.
- **C. Per-site security score + one-click Secure** (M) — `harden`/`security-status` + Insights signals → a score + fix buttons (XML-RPC, file-edit, version hiding, vuln plugins).
- **D. Backup browser + granular restore + verified-offsite badge** (S–M) — browse a backup; restore just a file/table; "last offsite backup verified N h ago".
- **E. Vulnerability + abandoned-plugin radar with quarantine** (M) — Insights + host-fetched vuln feed → flag CVEs/abandoned, offer safe-update or deactivate.

## Also on the radar (not yet scheduled)
GUI parity conveniences (AI-connector keys in the create-site wizard, support-bundle download, GUI stack-update, create-site DNS preflight) · single-binary distribution (blocked: libsql native driver) · Tauri desktop · MariaDB Catalogs (native multi-tenancy — long-term target for #6).
