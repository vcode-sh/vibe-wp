# Vibe WP Control Panel — One-Command Panel-First Server Bootstrap

Status: Approved design (brainstorm). Date: 2026-06-23.
Scope owner: root `bin/` + `public-install/`, `installer/src/` (core + screens), and `control-panel/` (`packages/api` core-bridge + `routers/server`, `packages/auth`, `web` first-run/empty-state).
Builds on: `2026-06-21-control-panel-backend-install-design.md` (§7 `bin/panel install`, §7a TUI install UX, §6 auth bootstrap).

## 1. Context

The control panel is already a real per-VPS, host-native application: it runs as a systemd Bun service behind Caddy TLS, executes real work through a hardened exec chokepoint to each site's `bin/vibe`, streams operations over SSE, enforces RBAC, and the web already provisions brand-new sites in the browser (the data seam is 100% real oRPC — no fixtures). `bin/panel install|update|status|uninstall|logs` exists and is idempotent.

What does **not** exist is a way to go from a **bare VPS to a running panel in one command**. Today it is three manual steps with three seams (an audit on 2026-06-23 confirmed all three):

- **Seam A** — the public one-liner (`curl … | sh`) downloads only a compiled installer binary; it never clones the repo that `bin/panel` needs on disk.
- **Seam B** — the installer never offers panel install; the §7a "Install control panel" host action is designed but unbuilt.
- **Seam C** — Docker/Caddy are installed only as a side effect of building a WordPress *site* (`installer/src/core/host-install.ts`), and `bin/panel` assumes they already exist; `server` operations (`harden`/`doctor`/`info`) reach the host *through a site* and throw `NOT_FOUND` on an empty box.

This spec closes those seams for a **panel-first** bootstrap: one command stands up the server (Docker/Caddy/Bun) and the panel with an owner account, then the operator creates their first site **in the browser** (the existing provisioning wizard). The TUI remains the developer surface; the GUI becomes the path for non-technical owners.

## 2. Decisions (settled)

- **Bootstrap scope: panel-first.** The one command produces a server + panel + owner account, **no site yet**. First-run lands the operator on "Create your first site" in the GUI. (Rationale: the most important flow — site creation — happens in the GUI, which is the whole point of "GUI replaces TUI.")
- **Orchestration: installer-led (extend §7a).** The `curl … | sh` launches the installer as today; its §7a "Install control panel" host action is upgraded to (a) prepare a *bare* host and (b) deploy the panel through the installer's existing Execute/progress/live-log UI and DNS preflight. Clean separation: **the installer prepares the host, `bin/panel` deploys the app.**
- **No-domain access: Tier 1 default, port 8443 fallback.** When no real domain is configured:
  - **Tier 1 (default)** — magic wildcard DNS: derive `panel.<ip-dashed>.sslip.io` from the detected public IP; Caddy issues a **real Let's Encrypt cert** on 443. No port, no cert warning, zero DNS setup.
  - **Tier 2 (fallback)** — `https://<ip>:8443` with Caddy's internal CA (self-signed); used only when Tier 1 is unavailable (sslip.io blocked or ACME challenge fails). Port **8443** = the universally recognized alternate-HTTPS port; memorable, signals HTTPS, no conflict with the WP stack (Caddy owns 80/443; nginx :8080 and PHP-FPM :9000 are container-internal; the panel server stays on internal :4000).
  - **Tier 3 (Custom)** — localhost-only + SSH tunnel, for the security-conscious.
- **The one command always ends at a working HTTPS sign-in URL.** Admin credentials never travel over plaintext; HTTPS is mandatory in every tier.
- **Canonical checkout at `/opt/vibe-wp`.** The bootstrap clones the repo there so the panel deploy and host-level ops have source on disk; this aligns with the existing `bin/panel update` (git pull + rebuild). The deployed app stays at `/opt/vibe-wp-panel`.
- **Off-root hardening is out of scope here** (separate "harden" thread). This bootstrap inherits the current root-run posture; the exec allowlist remains the primary control. Flagged as the recommended immediate follow-on (§10).

## 3. Architecture & one-command flow

```
curl -fsSL https://wp.vcode.sh/install.sh | sh
        │
        ▼
public-install/install.sh ── fetch+verify installer binary
        │                  └─ ensure git + shallow-clone vibe-wp → /opt/vibe-wp
        ▼
installer TUI  ── bare-server detect (no sites, no Docker/Caddy)
        │        → first screen LEADS with "Set up your control panel"
        │        → panel-install screen: subdomain | access mode | owner email+password
        ▼
Execute screen (existing progress + live-log UI) runs the panel-bootstrap plan:
   install Docker → install Caddy → install Bun
   → /opt/vibe-wp/bin/panel install --access <mode> --domain <d>
                                     --admin-email <e> --admin-password <p>
        │  (build web+server, write env, migrate db, systemd unit,
        │   Caddy route w/ cert strategy, owner bootstrap, smoke)
        ▼
Done screen ── "✓ Control panel live at <url> — open it, sign in, create your first site."
        ▼
Browser ── sign in → zero-site empty state → "Create your first site"
           (existing provisioning wizard: per-site checkout + full install, all in GUI)
```

## 4. Components & the change each needs

| # | Unit | Change | Closes |
|---|------|--------|--------|
| 1 | `public-install/install.sh` | Ensure `git`; shallow-clone `vibe-wp` → `/opt/vibe-wp` (idempotent: pull if present) so the panel deploy + `bin/panel update` have a checkout | Seam A |
| 2 | `installer/src/core/host-install.ts` + new `installer/src/core/panel-bootstrap-plan.ts` | Factor Docker/Caddy install out of the site plan into standalone host tasks; **add Bun**; assemble a panel-bootstrap plan (host prep → `bin/panel install`) | Seam C (Docker/Caddy welded to site install) |
| 3 | `installer/src/screens/*` + `installer/src/app/steps.ts` + `cli/args.ts` | Bare-server detection → lead the first screen with "Set up control panel"; build the §7a screen (subdomain + access mode + owner login, inline DNS preflight); headless `--bootstrap-panel --domain … --admin-email … [--access …]` | Seam B (§7a unbuilt) |
| 4 | `bin/panel` | Accept `--access <domain\|magic-dns\|ip-port\|localhost>`; derive the origin + cert strategy and write it consistently to `VITE_SERVER_URL` (web build), `BETTER_AUTH_URL`, `CORS_ORIGIN`/`trustedOrigins`, and the Caddy site block (real cert / `tls internal` / localhost bind); guard "is Caddy present"; confirm it runs from `/opt/vibe-wp` | No-domain access modes; origin agreement |
| 5 | `control-panel/packages/api/src/core-bridge/*` + `routers/server.ts` | Host-level exec path keyed on `PANEL_HOST_DIR=/opt/vibe-wp` so `serverInfo`/`doctor`/`harden`/`securityStatus` run with **zero sites**; site-dependent checks (e.g. `doctor-runtime`) degrade to "no sites yet" | `/server` `NOT_FOUND` on empty box |
| 6 | `control-panel/web/src/*` | Guarded **"Create owner account"** first-run screen when zero admins (hide the always-on sign-up form); confirm/polish the zero-site `/sites` + `/server` empty states → prominent "Create your first site" CTA | Owner first-run PARTIAL; empty state |
| 7 | `control-panel/packages/auth/src/index.ts` | Make first-admin bootstrap **atomic** (race-safe insert, not read-then-write); set `disableSignUp` and rely on the owner screen + `admin.createUser` | MEDIUM two-admins race; always-on public sign-up |

## 5. Access & DNS resolution

The install screen resolves an **access mode** before the build (the URL must be known at web build time):

1. **Real subdomain provided** → `domain` mode: real Let's Encrypt cert on 443. Inline DNS preflight (reuse `installer/src/core/dns-preflight.ts`); if the A record isn't pointed yet, **do not dead-end** — offer Tier 1 instead, with a recheck.
2. **No domain** → **`magic-dns` (default)**: derive `panel.<ip-dashed>.sslip.io` from the detected public IP (`host.ts` already detects public IP). Caddy issues a real cert via ACME (the hostname resolves to this server, so HTTP-01/TLS-ALPN succeeds).
3. **Tier 1 unavailable** (sslip.io blocked / ACME challenge fails) → auto-fall back to **`ip-port`**: `https://<ip>:8443`, Caddy `tls internal` (self-signed); the panel still lands at a working URL with a one-time cert-trust click.
4. **Localhost-only** → Custom knob; panel bound to localhost, reached via SSH tunnel (`ssh -L 8443:localhost:4000`).

`trustedOrigins`/`CORS_ORIGIN` and `BETTER_AUTH_URL` are set to the resolved origin in every mode (the better-auth origin check is the CSRF guard). The web build bakes the same origin into `VITE_SERVER_URL`.

## 6. Owner account & auth bootstrap hardening

- The installer captures the owner **email + password** (hidden input) on the §7a screen, or generates a password when headless; `bin/panel install` POSTs to the localhost sign-up endpoint so the first user becomes admin. The password is never logged or persisted, and the public Caddy route is exposed **only after** the owner exists (already true in `bin/panel`).
- **Race fix**: replace the current read-then-write first-admin decision (`packages/auth/src/index.ts` — `userCount === 0 → admin`) with an **atomic** path (e.g. insert-guarded / `WHERE NOT EXISTS`) so two concurrent first sign-ups cannot both be minted admin.
- Set **`disableSignUp`** so public self-registration is closed by config (not only the DB hook); admins add teammates via `admin.createUser` (already built).
- Add the **guarded browser "Create owner account" screen** (renders only while zero admins exist; hides the sign-up toggle otherwise) as the fallback when the operator skips owner capture during install.

## 7. Zero-site server operations (backend)

`server.serverInfo/doctor/harden/securityStatus` currently select `sites[0]` and throw `NOT_FOUND` with zero sites. Change host-level ops to run against the canonical checkout via a configured `PANEL_HOST_DIR` (default `/opt/vibe-wp`):

- **Host-level** (`serverInfo` = df/hostname; `doctor` = host prerequisites; `harden`; `securityStatus`) → run against `PANEL_HOST_DIR`/host scripts; no site required.
- **Site-dependent** (`doctor-runtime`, which checks a running WP/DB/Redis) → return a typed "no sites yet" state rather than erroring, so `/server` renders cleanly on a fresh panel.

The exec layer keeps its allowlist + argv-array + redaction guarantees for the host path; add the relevant host ops to the allowlist where missing (e.g. the `config` op gap noted in the audit).

## 8. Frontend: first-run & empty state

- **First-run owner screen** (§6): a `hasAdmin`-gated route/screen shown only when zero admins exist.
- **Empty state** after sign-in with zero sites: `/sites` already has a real empty state + "New site" button — confirm and elevate it to a prominent **"Create your first site"** CTA so a non-technical owner's next step is obvious. `/server` must render with zero sites (consumes §7).
- No new provisioning UI is needed — the existing wizard (`/sites/new`) is the first-site flow.

## 9. Edge cases

- Idempotent Docker/Caddy/Bun (skip if present).
- Re-run on an already-installed box → `bin/panel update` path (preserves `BETTER_AUTH_SECRET` + sessions).
- Interrupted bootstrap → the installer's journal/`--resume` already resumes at task granularity.
- Non-root SSH user → `sudo` for apt/systemd/caddy (installer already detects sudo).
- Cert issuance lag → smoke waits on **service-up** (HTTP 200 on localhost:4000), not on the public cert; TLS settles asynchronously.
- sslip.io blocked → Tier 2 fallback (§5.3).
- Zero sites → §7.

## 10. Security posture (honest)

- **HTTPS in every tier** — no plaintext admin login (Tier 1 real cert, Tier 2 self-signed, Tier 3 tunnel).
- Login-gated, rate-limited (5/10s on sign-in), origin-checked CSRF (`trustedOrigins` includes the resolved access origin), public route gated on owner-exists.
- **The panel still runs as root in this thread.** The dedicated least-privilege `vibe-panel` user + scoped sudoers (`bin/vibe-panel-run`) described in the backend-install design (§8) is **not** built here. A public one-command installer is exactly where this matters most, so it is the **recommended immediate follow-on** after this thread. The exec command allowlist remains the primary control until then.
- A public admin panel on a guessable URL is an attack surface; the Done screen should nudge toward a real domain and (later) the off-root hardening, and Tier 3 remains available for the cautious.

## 11. Scope / out of scope

**In scope:** bare VPS → one command → Docker/Caddy/Bun + panel + owner account + a working HTTPS sign-in URL (Tier 1 default, Tier 2 fallback) + zero-site `/server` + the GUI "create your first site" empty state + race-safe owner bootstrap.

**Out of scope (separate threads, not folded in):** off-root `vibe-panel` hardening · GUI parity wins (AI connector keys, support-bundle download, GUI stack-update, DNS-preflight gating inside the create-site wizard) · multi-server/fleet · invite emails · single-binary distribution · Tauri.

## 12. Testing & verification

- **TDD (pure logic):** host-install task assembly (Docker/Caddy/Bun present vs absent), the panel-bootstrap plan, sslip.io host derivation from a public IP, access-mode → origin/cert-strategy mapping, the atomic owner bootstrap, and zero-site host-exec argv building.
- **Integration:** drive the installer headless (`--bootstrap-panel`) against the disposable **bare** test VPS → assert Docker + Caddy + Bun installed, panel service active, HTTPS reachable (Tier 1 cert *or* Tier 2 self-signed), owner sign-in succeeds, `/server` renders with zero sites, and the GUI new-site wizard provisions a site end-to-end.
- **Real-VPS validation is the acceptance gate** (the disposable test VPS; SSH details in local-only agent docs).

## 13. Build order

1. **Host prep, factored** — extract Docker/Caddy(+Bun) install from the site plan into standalone host tasks (#2); `public-install/install.sh` clones `/opt/vibe-wp` (#1).
2. **`bin/panel` access modes** (#4) — access mode → origin/cert strategy; Tier 1/2 Caddy blocks.
3. **Zero-site server ops** (#5, #7) — host-level exec via `PANEL_HOST_DIR`.
4. **Installer §7a panel-first UX** (#3) — bare-server detection, the install screen, headless flags, wire to the bootstrap plan.
5. **Auth hardening + first-run + empty state** (#6, #7-auth) — atomic owner, `disableSignUp`, owner screen, "create first site" CTA.
6. **Validate on a bare VPS** (acceptance gate).

## 14. Success criteria

- On a fresh, empty VPS, a single `curl … | sh` ends with the operator able to open a working HTTPS URL (real cert by default), sign in as the owner, see a clean zero-site `/server`, and create their first WordPress site entirely in the browser.
- No plaintext admin login in any access mode; first-admin creation is race-safe; public self-registration is closed after the owner exists.
- The flow is idempotent and resumable; re-running upgrades via `bin/panel update`.
- `tsc`/lint/tests green; the bootstrap is validated on real hardware.

## 15. References

- `2026-06-21-control-panel-backend-install-design.md` — §6 auth bootstrap, §7 `bin/panel install`, §7a TUI install UX, §8 security model (off-root hardening).
- 2026-06-23 audit (this session) — six-surface done/missing/nice-to-have map; the three bootstrap seams.
- sslip.io / nip.io — wildcard DNS for IP-derived hostnames (Tier 1).
- Caddy `tls internal` — internal-CA self-signed certs (Tier 2).
