# One-Command Bootstrap — Phase 1: `bin/panel` No-Domain Access Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `bin/panel install` to stand the panel up over HTTPS with **no real domain** — defaulting to a magic-DNS hostname (`panel.<ip-dashed>.sslip.io`) with a real Let's Encrypt cert, falling back to `https://<ip>:8443` self-signed — so a later phase can drive it from a bare-server bootstrap.

**Architecture:** Add an `--access <domain|magic-dns|ip-port|localhost>` option to `bin/panel`. A single pure resolver maps `(mode, domain, detected-ip, port)` → `{ACCESS_HOST, ACCESS_ORIGIN, CADDY_SITE_ADDRESS, CADDY_TLS_LINE}`. Every place that currently hardcodes `https://$DOMAIN` (web `VITE_SERVER_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, the Caddy site block, the smoke/Done messages) reads the resolver's outputs instead. No behavior change for the existing `--domain` path (it resolves to `mode=domain`).

**Tech Stack:** POSIX `sh` (`bin/panel`), Caddy (ACME for real certs; `tls internal` for self-signed), sslip.io wildcard DNS. Verification via `shellcheck` + a no-op `--print-access` debug path + real-VPS integration.

## Global Constraints

- POSIX `sh` only (`#!/bin/sh`, `set -eu`) — no bashisms. Match the existing `bin/panel` style. (verbatim: file begins `#!/bin/sh` / `set -eu`)
- **Never widen `server/.env`** (holds `BETTER_AUTH_SECRET`): the existing `find … -path '*/server/.env' -prune` guard and `chmod 600` must remain intact.
- **Preserve the off-root boundary**: do not change how the service runs (`User=vibe-panel`), the sudoers wrapper, or `PANEL_PRIVILEGED_RUNNER`. This phase only changes the public origin + Caddy front door.
- **No secrets in logs**: the owner password path (`stty -echo`, localhost POST) is unchanged; never echo it.
- Default port stays **`4000`** (internal server). The **`8443`** value is the *public* Caddy listen port for `ip-port`/`localhost` modes only.
- magic-DNS host format is the **dashed** IPv4 form: `1.2.3.4` → `panel.1-2-3-4.sslip.io` (dashed form gets a clean wildcard cert).

---

### Task 1: Access-mode resolver (pure function) + `--print-access` debug path

Add option parsing for `--access` and a pure resolver that derives all access-dependent values, plus a no-op debug exit so the resolver is testable without touching the host.

**Files:**
- Modify: `bin/panel` (option parsing block `:41-55`; add resolver function near `installer_arch` `:57`; add a debug early-exit in `install_panel`)

**Interfaces:**
- Consumes: `DOMAIN` (existing var), `PORT` (existing, default 4000), the detected public IP (existing `curl … api.ipify.org` pattern at `:264`).
- Produces (shell vars set by `resolve_access`, consumed by Tasks 2–4):
  - `ACCESS_MODE` — one of `domain|magic-dns|ip-port|localhost`
  - `ACCESS_HOST` — hostname only (e.g. `panel.acme.com`, `panel.1-2-3-4.sslip.io`, the bare IP, or `localhost`)
  - `ACCESS_ORIGIN` — full https origin (e.g. `https://panel.acme.com`, `https://1.2.3.4:8443`)
  - `CADDY_SITE_ADDRESS` — the Caddy site block address (e.g. `panel.acme.com`, `1.2.3.4:8443`, `localhost:8443`)
  - `CADDY_TLS_LINE` — empty for ACME modes, `	tls internal` (tab-indented) for self-signed modes

- [ ] **Step 1: Add `--access` to the option parser**

In `bin/panel`, add the var default near the others (`:31-39`):
```sh
ACCESS_MODE=""
```
Add the case arm inside the `while [ $# -gt 0 ]` loop (`:42-54`), before the `*) usage` arm:
```sh
    --access)         ACCESS_MODE="$2";    shift 2 ;;
```

- [ ] **Step 2: Write the resolver function**

Add after `installer_arch()` (`:57-65`):
```sh
# Detect the server's public IPv4 (best-effort; empty on failure).
detect_public_ip() {
  curl -fsS https://api.ipify.org 2>/dev/null || true
}

# Resolve all access-dependent values from (ACCESS_MODE, DOMAIN, PORT).
# Sets: ACCESS_MODE ACCESS_HOST ACCESS_ORIGIN CADDY_SITE_ADDRESS CADDY_TLS_LINE
# Default mode: magic-dns when no --domain/--access given, else domain.
resolve_access() {
  if [ -z "$ACCESS_MODE" ]; then
    if [ -n "$DOMAIN" ]; then ACCESS_MODE=domain; else ACCESS_MODE=magic-dns; fi
  fi
  CADDY_TLS_LINE=""
  case "$ACCESS_MODE" in
    domain)
      [ -n "$DOMAIN" ] || die "access mode 'domain' requires --domain"
      ACCESS_HOST="$DOMAIN"
      ACCESS_ORIGIN="https://$DOMAIN"
      CADDY_SITE_ADDRESS="$DOMAIN"
      ;;
    magic-dns)
      ip="$(detect_public_ip)"
      [ -n "$ip" ] || die "magic-dns needs a detectable public IP (none found)"
      dashed="$(printf '%s' "$ip" | tr '.' '-')"
      ACCESS_HOST="panel.$dashed.sslip.io"
      ACCESS_ORIGIN="https://$ACCESS_HOST"
      CADDY_SITE_ADDRESS="$ACCESS_HOST"
      ;;
    ip-port)
      ip="$(detect_public_ip)"
      [ -n "$ip" ] || die "ip-port needs a detectable public IP (none found)"
      ACCESS_HOST="$ip"
      ACCESS_ORIGIN="https://$ip:8443"
      CADDY_SITE_ADDRESS="$ip:8443"
      CADDY_TLS_LINE="$(printf '\ttls internal')"
      ;;
    localhost)
      ACCESS_HOST="localhost"
      ACCESS_ORIGIN="https://localhost:8443"
      CADDY_SITE_ADDRESS="localhost:8443"
      CADDY_TLS_LINE="$(printf '\ttls internal')"
      ;;
    *) die "invalid --access mode: $ACCESS_MODE (use domain|magic-dns|ip-port|localhost)" ;;
  esac
}
```
Add a `die()` helper near the top if not present (mirror `bin/vibe-panel-run`'s):
```sh
die() { echo "panel: $1" >&2; exit 1; }
```

- [ ] **Step 3: Add a no-op `--print-access` debug exit**

At the very top of `install_panel()` (after `:252`'s `install_panel() {`), before any host mutation:
```sh
  resolve_access
  if [ "${VIBE_PANEL_PRINT_ACCESS:-}" = "1" ]; then
    printf 'mode=%s\nhost=%s\norigin=%s\ncaddy_addr=%s\ncaddy_tls=%s\n' \
      "$ACCESS_MODE" "$ACCESS_HOST" "$ACCESS_ORIGIN" "$CADDY_SITE_ADDRESS" "$CADDY_TLS_LINE"
    return 0
  fi
```
Note: `install_panel` currently prompts for `DOMAIN`/`ADMIN_EMAIL` at its top (`:253-254`). Move those prompts to AFTER this debug block, and make the `DOMAIN` prompt conditional — only prompt when `ACCESS_MODE=domain` and `DOMAIN` is empty (magic-dns/ip-port/localhost need no domain):
```sh
  if [ "$ACCESS_MODE" = domain ] && [ -z "$DOMAIN" ]; then
    printf 'Subdomain for the panel: '; read -r DOMAIN; resolve_access
  fi
  [ -n "$ADMIN_EMAIL" ] || { printf 'Owner email: '; read -r ADMIN_EMAIL; }
```

- [ ] **Step 4: Verify the resolver with the debug path (no host changes)**

Run each mode and confirm the derived values (uses a stubbed IP so it's deterministic and host-independent):
```sh
# domain
VIBE_PANEL_PRINT_ACCESS=1 ./bin/panel install --access domain --domain panel.acme.com --admin-email x@y.z
# magic-dns (stub the IP detector via a fake api.ipify by exporting through a shim is overkill;
#   instead confirm on a host with a public IP, OR temporarily run the resolver logic with a known IP)
VIBE_PANEL_PRINT_ACCESS=1 ./bin/panel install --access ip-port --admin-email x@y.z
```
Expected (domain):
```
mode=domain
host=panel.acme.com
origin=https://panel.acme.com
caddy_addr=panel.acme.com
caddy_tls=
```
Expected (ip-port, with detected IP `203.0.113.7`):
```
mode=ip-port
host=203.0.113.7
origin=https://203.0.113.7:8443
caddy_addr=203.0.113.7:8443
caddy_tls=	tls internal
```

- [ ] **Step 5: shellcheck**

Run: `shellcheck bin/panel`
Expected: no new warnings (resolve POSIX-portability notes if any are introduced).

- [ ] **Step 6: Commit**

```bash
git add bin/panel
git commit -m "panel: add --access resolver (domain/magic-dns/ip-port/localhost) + debug print"
```

---

### Task 2: Propagate `ACCESS_ORIGIN` into the panel env + web build

Replace the three hardcoded `https://$DOMAIN` origins in `deploy_panel` with the resolver's `ACCESS_ORIGIN`, and the web `VITE_SERVER_URL` likewise.

**Files:**
- Modify: `bin/panel` `deploy_panel()` (`:172-176` web `.env`; `:184-193` server `.env`)

**Interfaces:**
- Consumes: `ACCESS_ORIGIN` (Task 1). `deploy_panel` is also called by `update_panel`, which reconstructs `DOMAIN` from `BETTER_AUTH_URL` — so `update_panel` must set `ACCESS_ORIGIN` too (Step 3).
- Produces: `server/.env` with `BETTER_AUTH_URL`/`CORS_ORIGIN` = `ACCESS_ORIGIN`; `web/.env` `VITE_SERVER_URL` = `ACCESS_ORIGIN`.

- [ ] **Step 1: Web build origin**

Change `:173`:
```sh
  printf 'VITE_SERVER_URL=https://%s\n' "$DOMAIN" > "$REPO_DIR/control-panel/web/.env"
```
to:
```sh
  printf 'VITE_SERVER_URL=%s\n' "$ACCESS_ORIGIN" > "$REPO_DIR/control-panel/web/.env"
```

- [ ] **Step 2: Server env origins**

Change the two lines in the `server/.env` heredoc (`:187-188`):
```sh
    "BETTER_AUTH_URL=https://$DOMAIN" \
    "CORS_ORIGIN=https://$DOMAIN" \
```
to:
```sh
    "BETTER_AUTH_URL=$ACCESS_ORIGIN" \
    "CORS_ORIGIN=$ACCESS_ORIGIN" \
```

- [ ] **Step 3: Make `update_panel` set `ACCESS_ORIGIN`**

`update_panel` (`:325-354`) sources `DOMAIN` from `BETTER_AUTH_URL` by stripping `https://` (`:341`). That loses the scheme/port for `ip-port` mode. Replace that derivation: read the full origin and reuse it directly. Change `:341`:
```sh
  DOMAIN="$($SUDO grep -m1 '^BETTER_AUTH_URL=' "$env_file" 2>/dev/null | cut -d= -f2- | sed 's|https://||' || true)"
```
to:
```sh
  ACCESS_ORIGIN="$($SUDO grep -m1 '^BETTER_AUTH_URL=' "$env_file" 2>/dev/null | cut -d= -f2- || true)"
  DOMAIN="$(printf '%s' "$ACCESS_ORIGIN" | sed -e 's|^https://||' -e 's|:.*$||')"
```
(`DOMAIN` is still used by the existing `:346` guard and `:351` log line; keep it as the host for those.)

- [ ] **Step 4: Verify env contents with a dry `deploy` inspection**

Since `deploy_panel` mutates the host, verify by static read of the changed lines:
```sh
grep -n 'VITE_SERVER_URL\|BETTER_AUTH_URL=\|CORS_ORIGIN=' bin/panel
```
Expected: all three now reference `$ACCESS_ORIGIN`, none reference `https://$DOMAIN`.

- [ ] **Step 5: shellcheck + commit**

```bash
shellcheck bin/panel
git add bin/panel
git commit -m "panel: drive web + server origin from ACCESS_ORIGIN (supports no-domain modes)"
```

---

### Task 3: Per-mode Caddy site block

Make the Caddy snippet use `CADDY_SITE_ADDRESS` + `CADDY_TLS_LINE` instead of the hardcoded `$DOMAIN { … }`, so `ip-port`/`localhost` modes serve self-signed HTTPS on `:8443` and `magic-dns`/`domain` get ACME.

**Files:**
- Modify: `bin/panel` `install_panel()` Caddy block (`:289-301`)

**Interfaces:**
- Consumes: `CADDY_SITE_ADDRESS`, `CADDY_TLS_LINE`, `PANEL_DIR`, `PORT` (Task 1 + existing).
- Produces: `/etc/caddy/sites-enabled/vibe-wp-panel.caddy` with a site block valid for the chosen mode.

- [ ] **Step 1: Replace the site block**

Change `:289-301`:
```sh
  printf '%s\n' "$DOMAIN {
	handle /rpc/* {
		reverse_proxy localhost:$PORT
	}
	handle /api/* {
		reverse_proxy localhost:$PORT
	}
	handle {
		root * $PANEL_DIR/app/web/dist
		try_files {path} /index.html
		file_server
	}
}" | $SUDO tee /etc/caddy/sites-enabled/vibe-wp-panel.caddy >/dev/null
```
to:
```sh
  printf '%s\n' "$CADDY_SITE_ADDRESS {
$CADDY_TLS_LINE
	handle /rpc/* {
		reverse_proxy localhost:$PORT
	}
	handle /api/* {
		reverse_proxy localhost:$PORT
	}
	handle {
		root * $PANEL_DIR/app/web/dist
		try_files {path} /index.html
		file_server
	}
}" | $SUDO tee /etc/caddy/sites-enabled/vibe-wp-panel.caddy >/dev/null
```
(`CADDY_TLS_LINE` is empty for ACME modes, producing a harmless blank line that `caddy validate` accepts; for self-signed modes it is the tab-indented `tls internal`.)

- [ ] **Step 2: Update the smoke + Done messaging to the resolved URL**

`:305` and `:322` reference `$DOMAIN`. Change the Done line `:322`:
```sh
  echo "Done. Open https://$DOMAIN and sign in."
```
to:
```sh
  echo "Done. Open $ACCESS_ORIGIN and sign in."
```
(The localhost sign-up POST at `:313-314` stays `http://localhost:$PORT` — unchanged; it is host-internal.)

- [ ] **Step 3: Verify the generated block per mode**

On a throwaway host (or with `$SUDO`/`/etc/caddy` redirected), confirm each mode renders a `caddy validate`-clean block. Minimal local check of the printf output by extracting it:
```sh
# Render check (domain): expect `panel.acme.com {` with no tls line
# Render check (ip-port): expect `203.0.113.7:8443 {` followed by a `	tls internal` line
```
Acceptance is the VPS integration in Task 5; this step is the structural read.

- [ ] **Step 4: shellcheck + commit**

```bash
shellcheck bin/panel
git add bin/panel
git commit -m "panel: per-mode Caddy site block (ACME for domain/magic-dns, tls internal for ip-port/localhost)"
```

---

### Task 4: Caddy presence guard + usage/help

Fail fast with a clear message if Caddy is absent (Approach A installs it in Phase 2; standalone callers need it), and document `--access` in usage.

**Files:**
- Modify: `bin/panel` `install_panel()` (after Bun preflight `:256-261`); `usage()` (`:15-25`)

**Interfaces:**
- Consumes: nothing new.
- Produces: an early `die` when `caddy` is missing; updated help text.

- [ ] **Step 1: Guard Caddy presence**

After the Bun preflight block (`:256-261`) and before DNS work, add:
```sh
  command -v caddy >/dev/null 2>&1 || die "Caddy is not installed. Install Caddy first (the bootstrap installer does this), then re-run."
```

- [ ] **Step 2: Document `--access` in usage**

In `usage()` change the `install` line (`:18`):
```sh
  echo "  install    --domain d --admin-email e [--port N] [--admin-password P]"
```
to:
```sh
  echo "  install    --admin-email e [--access domain|magic-dns|ip-port|localhost] [--domain d] [--port N] [--admin-password P]"
```

- [ ] **Step 3: shellcheck + commit**

```bash
shellcheck bin/panel
git add bin/panel
git commit -m "panel: guard Caddy presence + document --access in usage"
```

---

### Task 5: Real-VPS integration validation (acceptance gate)

Prove the no-domain path end-to-end on the disposable test VPS (SSH details in local-only agent docs). This is the phase's acceptance gate — `bin/panel` is shell, so this integration check substitutes for unit coverage of the host-mutating paths.

**Files:** none (validation only).

- [ ] **Step 1: magic-dns install on the test VPS**

On a test VPS that already has Docker + Caddy + the repo checkout:
```sh
./bin/panel install --access magic-dns --admin-email you@example.com --admin-password '<temp>'
```
Expected: prints `Done. Open https://panel.<ip-dashed>.sslip.io and sign in.`; `bin/panel status` shows the service active.

- [ ] **Step 2: Confirm HTTPS reachability + real cert**

```sh
curl -fsS https://panel.<ip-dashed>.sslip.io/ -o /dev/null -w '%{http_code} %{ssl_verify_result}\n'
```
Expected: `200 0` (HTTP 200, cert verified — a real Let's Encrypt cert, no `-k` needed).

- [ ] **Step 3: ip-port fallback**

Re-run with `--access ip-port` and confirm `https://<ip>:8443` serves the panel (self-signed → expect a cert-trust prompt / `curl -k` succeeds):
```sh
curl -fsSk https://<ip>:8443/ -o /dev/null -w '%{http_code}\n'   # expect 200
```

- [ ] **Step 4: Owner sign-in works**

Open the magic-dns URL in a browser, sign in with the owner credentials from Step 1. Expected: dashboard loads; `/rpc` + `/api/auth` resolve (origin matches `ACCESS_ORIGIN`, so the better-auth origin check passes).

- [ ] **Step 5: Record the result**

Note the validated commit + URL in the phase's completion notes. No code change.

---

## Self-Review

**Spec coverage (Phase 1 slice of `2026-06-23-control-panel-one-command-bootstrap-design.md`):**
- §2 "no-domain access: Tier 1 default, port 8443 fallback" → Tasks 1+3 (magic-dns default, ip-port:8443 self-signed). ✓
- §4 #4 "`bin/panel` accepts `--access`, derives origin + cert strategy, writes `VITE_SERVER_URL`/`BETTER_AUTH_URL`/`CORS_ORIGIN`/Caddy block" → Tasks 1–3. ✓
- §5 access resolution (domain/magic-dns/ip-port/localhost) → Task 1 resolver. ✓
- §10 "preserve the off-root boundary" → Global Constraints + no change to `User=vibe-panel`/wrapper. ✓
- **Out of this phase (correctly deferred to Phase 2/3):** repo clone (install.sh), host-install factoring/Docker-Caddy install, the installer §7a UX, DNS-preflight-fallback orchestration, zero-site server ops, the first-admin race, the owner first-run screen. Phase 1 assumes a host that already has Docker/Caddy/repo.

**Placeholder scan:** none — every step has exact line targets and the literal shell to change.

**Type/name consistency:** the resolver's output vars (`ACCESS_MODE/ACCESS_HOST/ACCESS_ORIGIN/CADDY_SITE_ADDRESS/CADDY_TLS_LINE`) are defined in Task 1 and consumed by the same names in Tasks 2–3; `update_panel` sets `ACCESS_ORIGIN` (Task 2 Step 3) before calling `deploy_panel`, matching Task 2's consumption. ✓

**Note for the implementer:** `bin/panel` is POSIX shell with no unit-test harness in this repo; verification is `shellcheck` + the `--print-access` debug path (deterministic, no host changes) + the Task 5 VPS integration gate. Do not introduce a JS test runner for it.
