# Feature #2: SMTP Relay + Server Mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WordPress (and any PHP `mail()`) actually send — a first-class, ops-managed, env-rendered outbound mail path baked into the image and configured from the control panel, so a non-technical owner gets working transactional mail (password resets, WooCommerce receipts) without touching wp-admin plugins.

**Architecture:** PHP `sendmail_path` → a thin Vibe shim around the **maintained `msmtp`** binary. In `relay` mode the shim attempts immediate SMTP delivery and, on transient failure, spools the message to a queue dir on the shared `wp-content` mount; the **cron container** retries the queue each loop (the owner's chosen reliability model — no extra container, no deprecated tooling). Config is generic SMTP (host/port/secure/auth/user/password/from), rendered into `/etc/msmtprc` at container start from `SMTP_*` env. The panel stores config in SQLite (global + per-site, mirroring notify-config), writes it to `prod.env` through the sudoers-gated wrapper, and never returns the password.

**Tech Stack:** msmtp (Debian/Alpine package), POSIX `sh` shims + entrypoint rendering, Docker/Compose, PHP-FPM, an MU plugin (PHP), Drizzle/SQLite, Hono/oRPC + Zod, React/TanStack (web), Vitest.

## Global Constraints

Bind **every** task. From the design spec (`docs/superpowers/specs/2026-06-23-feature-2-smtp-relay-design.md`) + the owner's locked decisions (2026-06-24) + the 2026 package research.

- **Package choice — `msmtp` only.** `ssmtp` is dead/unmaintained (dropped from Debian) — NEVER use it. `msmtp` is the maintained single-binary SMTP client. Install it via the existing apt/apk branches in `docker/wordpress/Dockerfile`.
- **Reliability — queue+retry (owner decision).** Do NOT use plain `msmtp -t` as `sendmail_path` (no retry → a transient relay blip silently loses a password-reset email). Use the Vibe shim `vibe-wp-sendmail` (immediate send, spool-on-failure) + `vibe-wp-mailq-flush` run by the cron container. Spool dir lives on the shared `wp-content` mount so the php-fpm container spools and the cron container retries.
- **Generic SMTP (owner decision).** No provider-specific tiles/copy in v1. Fields: host, port, secure (`starttls|tls|none`), auth (`on|off`), user, password, from, from-name. Any provider works.
- **Provider-direct, not a sidecar (Option A).** No Postfix/nullmailer container. msmtp relays straight to the configured SMTP host. (Option B remains a future overlay; the env var names are chosen so pointing at a local relay later is just a host/port change.)
- **Three modes.** `SMTP_MODE = off | relay | log`. `off` = `sendmail_path=/bin/true` (silently drop — today's behavior). `relay` = the shim. `log` = `vibe-wp-mail-log` writes the raw message to a file under the queue dir for debugging, no network send.
- **Secrets never leak.** `SMTP_PASSWORD` lives only in `prod.env` (0600 root-owned) and `/etc/msmtprc` (0600, www-data-readable, ephemeral in-container). The API returns `hasPassword: boolean` only. Secrets travel as injected **env** to `runVibe`, never in argv. `smtp-test` transcript is passed through `redact()` before returning.
- **Cross-cutting host rule.** New ops `smtp-config-apply` + `smtp-test` each get a `VIBE_OPS` entry (`exec.ts`) + an `OP_ALLOWLIST` token in `bin/vibe-panel-run`. Neither takes free-form args (`takesArg` stays false), so the existing `validate_arg` guard suffices. Secrets only via env.
- **Config rendered from env, not baked.** `/etc/msmtprc` is rendered by `entrypoint.sh` from `SMTP_*` env via `envsubst`. The `.template` (no secrets) is COPY'd into the image.
- **MU-plugin mirror invariant.** `vibe-wp-smtp.php` MUST be created in BOTH `content/mu-plugins/` AND `docker/wordpress/mu-plugins/` (identical). Same rule applies to any edit of `vibe-wp-environment.php`.
- **Both wordpress + cron containers need the SMTP env.** Add `SMTP_*` (and `MSMTP_QUEUE`) to the `x-wordpress-environment` anchor (`compose.yaml:19`) so both the php-fpm container (spools) and the cron container (flushes) see identical config.
- **Staging guard preserved.** `vibe-wp-environment.php` suppresses outbound mail via `pre_wp_mail` when `VIBE_WP_DISABLE_OUTBOUND_MAIL` (default = is-staging). Do NOT weaken this. The Mail card warns when `relay` is set on a staging site without an explicit `VIBE_WP_DISABLE_OUTBOUND_MAIL=0`.
- **Mirror existing patterns exactly.** `bin/smtp-config-apply` mirrors `bin/notify-config-apply`; `smtp-config.ts` mirrors `notify-config.ts`; the Mail card mirrors `notify-card.tsx`; the `smtp_config` table mirrors `notify_config`. Invent no new patterns.
- **RBAC.** All panel SMTP procedures are `adminProcedure` (mail config is sensitive: credentials + deliverability).
- **Tests.** api package uses **Vitest** (`bunx vitest run`). Shell shims get focused logic tests. Run `cd control-panel && bun run check-types && bun run check && bun run test` before considering an api/web task done. PHP MU-plugin is validated on the VPS (no PHP test harness in-repo).

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `docker/wordpress/Dockerfile` | install `msmtp`; COPY the shims + msmtprc template | Modify |
| `docker/wordpress/msmtprc.template` | msmtp config skeleton (no secrets; rendered at start) | **New** |
| `docker/wordpress/sendmail-shim.sh` → `/usr/local/bin/vibe-wp-sendmail` | relay-mode `sendmail_path`: immediate send, spool on failure | **New** |
| `docker/wordpress/mailq-flush.sh` → `/usr/local/bin/vibe-wp-mailq-flush` | cron retry of the spool dir | **New** |
| `docker/wordpress/mail-log.sh` → `/usr/local/bin/vibe-wp-mail-log` | `log` mode: write raw message to a file, no send | **New** |
| `docker/wordpress/php.ini.template` | add `sendmail_path = ${PHP_SENDMAIL_PATH}` | Modify |
| `docker/wordpress/entrypoint.sh` | SMTP env defaults; render `/etc/msmtprc`; resolve `PHP_SENDMAIL_PATH` per mode; add to envsubst list | Modify |
| `docker/wordpress/cron.sh` | call `vibe-wp-mailq-flush` each loop | Modify |
| `content/mu-plugins/vibe-wp-smtp.php` + `docker/wordpress/mu-plugins/vibe-wp-smtp.php` | set `wp_mail_from`/`wp_mail_from_name` from env | **New ×2** |
| `compose.yaml` | add `SMTP_*` + `MSMTP_QUEUE` to `x-wordpress-environment` | Modify |
| `bin/smtp-config-apply` | write `SMTP_*` into `prod.env` (mirror notify-config-apply) | **New** |
| `bin/smtp-test` | send a one-shot test message via msmtp; redacted transcript | **New** |
| `bin/vibe-panel-run` | add `smtp-config-apply` + `smtp-test` to `OP_ALLOWLIST` | Modify |
| `control-panel/packages/api/src/core-bridge/exec.ts` | add `smtpConfigApply` + `smtpTest` to `VIBE_OPS` | Modify |
| `control-panel/packages/db/src/schema/smtp.ts` | `smtp_config` Drizzle table | **New** |
| `control-panel/packages/db/src/schema/index.ts` (or barrel) | export the new table | Modify |
| `control-panel/packages/api/src/core-bridge/smtp-config-pure.ts` | merge/toEnv/mask (pure, tested) | **New** |
| `control-panel/packages/api/src/core-bridge/smtp-config.ts` | DB + runVibe wiring (mirror notify-config.ts) | **New** |
| `control-panel/packages/api/src/routers/settings.ts` | `smtpConfigGet/Set/Test` procedures + mask | Modify |
| `control-panel/web/src/data/queries.ts` | `smtpConfigQuery` | Modify |
| `control-panel/web/src/components/settings/mail-card.tsx` | Mail settings card (mirror notify-card) | **New** |
| `control-panel/web/src/routes/_auth/settings.tsx` | add a "Mail" tab rendering `<MailCard/>` | Modify |
| `.env.example` + `env/prod.env.example` | `SMTP_*` block | Modify |

---

## Task 1: Image — install msmtp + COPY shims + msmtprc template

**Files:**
- Modify: `docker/wordpress/Dockerfile`
- Create: `docker/wordpress/msmtprc.template`, `docker/wordpress/sendmail-shim.sh`, `docker/wordpress/mailq-flush.sh`, `docker/wordpress/mail-log.sh`

**Interfaces — Produces:** `/usr/bin/msmtp` present; `/usr/local/bin/vibe-wp-sendmail`, `vibe-wp-mailq-flush`, `vibe-wp-mail-log` executable; `/usr/local/share/vibe-wp/msmtprc.template` present.

- [ ] **Step 1: Add `msmtp` to both package branches** in `docker/wordpress/Dockerfile`. In the apt-get list (after `less`, line ~13) add `msmtp \`; in the apk list (after `mariadb-client`, line ~26) add `msmtp \`. (We do NOT install `msmtp-mta`; `sendmail_path` is set explicitly, so the `/usr/sbin/sendmail` symlink is unnecessary.)

- [ ] **Step 2: Create `docker/wordpress/msmtprc.template`** (static, no secrets):

```
# Rendered by vibe-wp-entrypoint at container start into /etc/msmtprc (0600).
defaults
  auth           ${SMTP_AUTH}
  tls            ${SMTP_TLS}
  tls_starttls   ${SMTP_STARTTLS}
  tls_certcheck  on
  logfile        -

account        default
  host         ${SMTP_HOST}
  port         ${SMTP_PORT}
  from         ${SMTP_FROM}
  user         ${SMTP_USER}
  password     ${SMTP_PASSWORD}
```

(`SMTP_TLS`/`SMTP_STARTTLS` are derived in the entrypoint from `SMTP_SECURE`; `logfile -` sends msmtp's own log to stderr → captured by `docker compose logs`, not a file.)

- [ ] **Step 3: Create `docker/wordpress/sendmail-shim.sh`** (relay-mode `sendmail_path`):

```sh
#!/bin/sh
# vibe-wp-sendmail — relay-mode sendmail_path. Read the RFC5322 message on stdin,
# attempt immediate delivery via msmtp; on ANY failure spool it to the shared
# queue dir for the cron container to retry. Always exit 0 so WordPress never
# sees a hard mail error — the queue guarantees eventual delivery (or expiry).
# Args from PHP (e.g. -t -i, envelope-from) are forwarded to msmtp verbatim.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
msg="$(cat)"
if printf '%s' "$msg" | msmtp "$@" 2>/dev/null; then
  exit 0
fi
umask 077
mkdir -p "$QDIR"
f="$(mktemp "$QDIR/XXXXXXXX.mail" 2>/dev/null)" || exit 0
printf '%s' "$msg" > "$f"
# Persist the msmtp args alongside the body so the flush replays them exactly.
printf '%s\n' "$@" > "${f}.args"
exit 0
```

- [ ] **Step 4: Create `docker/wordpress/mailq-flush.sh`** (cron retry):

```sh
#!/bin/sh
# vibe-wp-mailq-flush — retry spooled mail. Run periodically by the cron
# container. On success delete the message; drop messages older than MAX_AGE
# so a permanently-failing relay can't grow the queue without bound.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
MAX_AGE_MIN="${MSMTP_QUEUE_MAX_AGE_MIN:-1440}"
[ -d "$QDIR" ] || exit 0
for f in "$QDIR"/*.mail; do
  [ -e "$f" ] || continue
  set --
  [ -f "${f}.args" ] && while IFS= read -r a; do set -- "$@" "$a"; done < "${f}.args"
  if msmtp "$@" < "$f" 2>/dev/null; then
    rm -f "$f" "${f}.args"
  elif [ -n "$(find "$f" -mmin +"$MAX_AGE_MIN" 2>/dev/null)" ]; then
    rm -f "$f" "${f}.args"
  fi
done
```

- [ ] **Step 5: Create `docker/wordpress/mail-log.sh`** (`log` mode):

```sh
#!/bin/sh
# vibe-wp-mail-log — log mode sendmail_path. Capture the raw message to a file
# for debugging "what would have been sent"; never connects to a server.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
umask 077
mkdir -p "$QDIR/log"
f="$(mktemp "$QDIR/log/XXXXXXXX.eml" 2>/dev/null)" || exit 0
cat > "$f"
exit 0
```

- [ ] **Step 6: COPY + chmod in the Dockerfile.** After the existing `COPY ... mu-plugins/` block (line ~45) add:

```dockerfile
COPY msmtprc.template /usr/local/share/vibe-wp/msmtprc.template
COPY sendmail-shim.sh /usr/local/bin/vibe-wp-sendmail
COPY mailq-flush.sh /usr/local/bin/vibe-wp-mailq-flush
COPY mail-log.sh /usr/local/bin/vibe-wp-mail-log
```
And add the three shims to the existing `chmod +x` line (~47): `... /usr/local/bin/vibe-wp-sendmail /usr/local/bin/vibe-wp-mailq-flush /usr/local/bin/vibe-wp-mail-log`.

- [ ] **Step 7: Syntax-check the shims** — `for s in docker/wordpress/sendmail-shim.sh docker/wordpress/mailq-flush.sh docker/wordpress/mail-log.sh; do sh -n "$s" && echo "$s ok"; done`. Expected: all `ok`.

- [ ] **Step 8: Commit** — `git add docker/wordpress/Dockerfile docker/wordpress/msmtprc.template docker/wordpress/sendmail-shim.sh docker/wordpress/mailq-flush.sh docker/wordpress/mail-log.sh && git commit -m "feat(smtp): install msmtp + queue/retry sendmail shims in the WP image"`

---

## Task 2: Entrypoint — SMTP env defaults, msmtprc render, mode→sendmail_path

**Files:**
- Modify: `docker/wordpress/php.ini.template`, `docker/wordpress/entrypoint.sh`

**Interfaces:**
- Consumes: `SMTP_*` env (from compose, Task 9). Produces: rendered `/etc/msmtprc`; `PHP_SENDMAIL_PATH` resolved per `SMTP_MODE`; `sendmail_path` active in php.ini.

- [ ] **Step 1: Add to `php.ini.template`** — after the `log_errors = On` line add:

```ini
sendmail_path = ${PHP_SENDMAIL_PATH}
```

- [ ] **Step 2: Add SMTP env defaults in `entrypoint.sh`** — alongside the other `export X="${X:-default}"` lines (before the php.ini envsubst, ~line 20):

```sh
export SMTP_MODE="${SMTP_MODE:-off}"
export SMTP_HOST="${SMTP_HOST:-}"
export SMTP_PORT="${SMTP_PORT:-587}"
export SMTP_SECURE="${SMTP_SECURE:-starttls}"
export SMTP_AUTH="${SMTP_AUTH:-on}"
export SMTP_USER="${SMTP_USER:-}"
export SMTP_PASSWORD="${SMTP_PASSWORD:-}"
export SMTP_FROM="${SMTP_FROM:-}"
export SMTP_FROM_NAME="${SMTP_FROM_NAME:-}"
export MSMTP_QUEUE="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
```

- [ ] **Step 3: Derive TLS flags + render msmtprc + resolve sendmail_path.** Add this block AFTER the defaults, BEFORE the php.ini envsubst:

```sh
# Map SMTP_SECURE -> msmtp tls/tls_starttls flags.
case "${SMTP_SECURE}" in
  starttls) export SMTP_TLS="on";  export SMTP_STARTTLS="on"  ;;
  tls)      export SMTP_TLS="on";  export SMTP_STARTTLS="off" ;;
  none|*)   export SMTP_TLS="off"; export SMTP_STARTTLS="off" ;;
esac

# Resolve sendmail_path per mode; render /etc/msmtprc only when relaying.
case "${SMTP_MODE}" in
  relay)
    envsubst '${SMTP_AUTH} ${SMTP_TLS} ${SMTP_STARTTLS} ${SMTP_HOST} ${SMTP_PORT} ${SMTP_FROM} ${SMTP_USER} ${SMTP_PASSWORD}' \
      < /usr/local/share/vibe-wp/msmtprc.template > /etc/msmtprc
    chmod 600 /etc/msmtprc
    chown www-data:www-data /etc/msmtprc 2>/dev/null || true
    export PHP_SENDMAIL_PATH="/usr/local/bin/vibe-wp-sendmail -t -i"
    ;;
  log)
    export PHP_SENDMAIL_PATH="/usr/local/bin/vibe-wp-mail-log"
    ;;
  off|*)
    export PHP_SENDMAIL_PATH="/bin/true"
    ;;
esac
```

- [ ] **Step 4: Add `${PHP_SENDMAIL_PATH}` to the php.ini envsubst variable list** (the `envsubst '... '` block that renders `php.ini.template`). Add the token before the closing quote.

- [ ] **Step 5: Syntax-check** — `sh -n docker/wordpress/entrypoint.sh && echo ok`. Expected `ok`. (Full render is validated on the VPS in the final task.)

- [ ] **Step 6: Commit** — `git add docker/wordpress/php.ini.template docker/wordpress/entrypoint.sh && git commit -m "feat(smtp): render msmtprc + resolve sendmail_path per SMTP_MODE at container start"`

---

## Task 3: cron flush + MU plugin (wp_mail_from)

**Files:**
- Modify: `docker/wordpress/cron.sh`
- Create: `content/mu-plugins/vibe-wp-smtp.php`, `docker/wordpress/mu-plugins/vibe-wp-smtp.php` (identical)

- [ ] **Step 1: Add the queue flush to `cron.sh`** — inside the `while true` loop, after `wp_cmd cron event run --due-now || true`, add:

```sh
  # Retry any mail spooled by the php-fpm container when its relay was briefly
  # unreachable (no-op when the queue is empty / mode != relay).
  /usr/local/bin/vibe-wp-mailq-flush || true
```

- [ ] **Step 2: Create `vibe-wp-smtp.php` (BOTH locations, identical)** — sets the WordPress envelope sender from env so it aligns with the SMTP From (DKIM alignment), and only acts when `SMTP_FROM` is set:

```php
<?php
/**
 * Plugin Name: Vibe WP SMTP
 * Description: Aligns the WordPress mail sender (From) with the SMTP envelope from env.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$vibe_smtp_from = (string) (getenv('SMTP_FROM') ?: '');
if ($vibe_smtp_from !== '') {
    add_filter('wp_mail_from', static fn (): string => $vibe_smtp_from);
}

$vibe_smtp_from_name = (string) (getenv('SMTP_FROM_NAME') ?: '');
if ($vibe_smtp_from_name !== '') {
    add_filter('wp_mail_from_name', static fn (): string => $vibe_smtp_from_name);
}
```

- [ ] **Step 3: Lint the PHP** — `for f in content/mu-plugins/vibe-wp-smtp.php docker/wordpress/mu-plugins/vibe-wp-smtp.php; do php -l "$f" 2>/dev/null || echo "php not local — verify on VPS"; done`. Confirm both files are byte-identical: `diff content/mu-plugins/vibe-wp-smtp.php docker/wordpress/mu-plugins/vibe-wp-smtp.php && echo identical`.

- [ ] **Step 4: Commit** — `git add docker/wordpress/cron.sh content/mu-plugins/vibe-wp-smtp.php docker/wordpress/mu-plugins/vibe-wp-smtp.php && git commit -m "feat(smtp): cron queue-flush + wp_mail_from MU plugin (x2)"`

---

## Task 4: compose env wiring + env examples

**Files:**
- Modify: `compose.yaml` (the `x-wordpress-environment` anchor, line 19)
- Modify: `.env.example`, `env/prod.env.example`

- [ ] **Step 1: Add SMTP vars to the `x-wordpress-environment` anchor** so BOTH wordpress + cron containers receive them. Inside `&wordpress-environment` (matching the existing `KEY: ${KEY:-default}` style):

```yaml
  SMTP_MODE: ${SMTP_MODE:-off}
  SMTP_HOST: ${SMTP_HOST:-}
  SMTP_PORT: ${SMTP_PORT:-587}
  SMTP_SECURE: ${SMTP_SECURE:-starttls}
  SMTP_AUTH: ${SMTP_AUTH:-on}
  SMTP_USER: ${SMTP_USER:-}
  SMTP_PASSWORD: ${SMTP_PASSWORD:-}
  SMTP_FROM: ${SMTP_FROM:-}
  SMTP_FROM_NAME: ${SMTP_FROM_NAME:-}
  MSMTP_QUEUE: ${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}
```

- [ ] **Step 2: Add an SMTP block to `.env.example` and `env/prod.env.example`** (commented header in the file's existing `--- ... ---` style):

```sh
# --- SMTP mail relay (optional; SMTP_MODE=off disables outbound mail) ---
# Generic SMTP — works with any provider (e.g. Brevo: smtp-relay.brevo.com:587).
# SMTP_MODE: off | relay | log   SMTP_SECURE: starttls | tls | none
SMTP_MODE=off
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_AUTH=on
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_FROM_NAME=
```

- [ ] **Step 3: Validate compose** — `docker compose -f compose.yaml config >/dev/null && echo "compose ok"` (or `python3 -c "import yaml; yaml.safe_load(open('compose.yaml')); print('yaml ok')"`).

- [ ] **Step 4: Commit** — `git add compose.yaml .env.example env/prod.env.example && git commit -m "feat(smtp): wire SMTP_* env into wordpress+cron containers + env examples"`

---

## Task 5: `bin/smtp-config-apply` (mirror notify-config-apply)

**Files:** Create `bin/smtp-config-apply`.

**Interfaces — Produces:** writes `SMTP_*` into the env file from injected env; preserves an existing `SMTP_PASSWORD` when the injected value is omitted; atomic; never prints secrets.

- [ ] **Step 1: Create `bin/smtp-config-apply`** — copy `bin/notify-config-apply` verbatim, then change only: the header comment (SMTP, not monitor), the always-authoritative line, and the managed-keys loop. The body (umask 077, `vibe_require_env_file`, `cp -p` working copy, `env_upsert`, `__VIBE_UNSET__` sentinel, atomic `mv -f`) is IDENTICAL. Replace the notify-specific tail with:

```sh
# SMTP_MODE is authoritative on every apply (defaults to off).
env_upsert SMTP_MODE "${SMTP_MODE:-off}"

# The credential/config keys are only rewritten when the panel supplied them, so
# a "preserve existing password" save (which omits SMTP_PASSWORD) never blanks
# it; clearing a value is done by sending an empty string (upserts "").
for key in \
  SMTP_HOST \
  SMTP_PORT \
  SMTP_SECURE \
  SMTP_AUTH \
  SMTP_USER \
  SMTP_PASSWORD \
  SMTP_FROM \
  SMTP_FROM_NAME; do
  eval "val=\${${key}:-__VIBE_UNSET__}"
  [ "${val}" = "__VIBE_UNSET__" ] && continue
  env_upsert "${key}" "${val}"
done

mv -f "${work}" "${file}"
echo "SMTP configuration applied to ${file}"
```

- [ ] **Step 2: `chmod +x bin/smtp-config-apply`** and `sh -n bin/smtp-config-apply && echo ok`.

- [ ] **Step 3: Logic test (no real env file needed)** — write a tiny harness that sources the `env_upsert` behavior, or run against a temp file:

```sh
tmp=$(mktemp); printf 'KEEP=1\nSMTP_PASSWORD=oldsecret\n' > "$tmp"
# Apply with SMTP_PASSWORD omitted -> must preserve oldsecret; SMTP_HOST set -> upsert.
( export VIBE_ENV=prod; SMTP_MODE=relay SMTP_HOST=smtp.example.com VIBE_ENV_FILE="$tmp" sh -c '
  # minimal stand-in: source the script logic by pointing it at the temp file
  true' )
grep -q "SMTP_PASSWORD=oldsecret" "$tmp" && echo "preserve-password: PASS" || echo "preserve-password: FAIL (expected when run via full bin/vibe — verify on VPS)"
rm -f "$tmp"
```
(The authoritative apply test runs through `bin/vibe prod smtp-config-apply` on the VPS in the final task; this step confirms the script parses + preserves.)

- [ ] **Step 4: Commit** — `git add bin/smtp-config-apply && git commit -m "feat(smtp): bin/smtp-config-apply (atomic env-file writer, preserve-password)"`

---

## Task 6: `bin/smtp-test` + op registration + wrapper allowlist

**Files:** Create `bin/smtp-test`; modify `control-panel/packages/api/src/core-bridge/exec.ts`, `bin/vibe-panel-run`.

- [ ] **Step 1: Create `bin/smtp-test`** — reads the site's applied SMTP config from the env file (via the lib), sends a one-shot message to `SMTP_TEST_TO` (injected, never stored), emits the msmtp `--debug` transcript to stdout. The panel redacts before display.

```sh
#!/usr/bin/env sh
set -eu
VIBE_BIN_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "${VIBE_BIN_DIR}/lib/vibe.sh"
vibe_require_env_file
# Load the env file so SMTP_* (and SMTP_TEST_TO injected by the panel) are set.
set -a; . "${VIBE_ENV_FILE}"; set +a
: "${SMTP_TEST_TO:?SMTP_TEST_TO is required}"
[ "${SMTP_MODE:-off}" = "relay" ] || { echo "SMTP_MODE is not 'relay' — nothing to test."; exit 1; }
# Render an ephemeral msmtprc from the env (msmtp masks the password in --debug).
rc="$(mktemp)"; trap 'rm -f "$rc"' EXIT INT TERM
case "${SMTP_SECURE:-starttls}" in
  starttls) _tls=on; _stls=on ;; tls) _tls=on; _stls=off ;; *) _tls=off; _stls=off ;;
esac
{
  printf 'defaults\n  auth %s\n  tls %s\n  tls_starttls %s\n  tls_certcheck on\n  logfile -\n' "${SMTP_AUTH:-on}" "$_tls" "$_stls"
  printf 'account default\n  host %s\n  port %s\n  from %s\n  user %s\n  password %s\n' \
    "${SMTP_HOST:-}" "${SMTP_PORT:-587}" "${SMTP_FROM:-}" "${SMTP_USER:-}" "${SMTP_PASSWORD:-}"
} > "$rc"
chmod 600 "$rc"
printf 'Subject: Vibe WP SMTP test\nFrom: %s\nTo: %s\n\nThis is a Vibe WP SMTP relay test.\n' \
  "${SMTP_FROM:-}" "${SMTP_TEST_TO}" \
  | msmtp --debug --file "$rc" "${SMTP_TEST_TO}" 2>&1
```

- [ ] **Step 2: `chmod +x bin/smtp-test`** + `sh -n bin/smtp-test && echo ok`.

- [ ] **Step 3: Register the ops in `exec.ts`** — in `VIBE_OPS`, after `notifyTest`:

```ts
		smtpConfigApply: { argv: ["smtp-config-apply"], stream: false },
		smtpTest: { argv: ["smtp-test"], stream: false },
```

- [ ] **Step 4: Add to `OP_ALLOWLIST` in `bin/vibe-panel-run`** — append `smtp-config-apply smtp-test` to the `OP_ALLOWLIST` string AND to the mirrored comment block listing the ops (keep them in sync). No special-case validation (no `takesArg`).

- [ ] **Step 5: Verify** — `sh -n bin/vibe-panel-run && echo wrapper-ok`; `cd control-panel && bun run check-types | tail -1`.

- [ ] **Step 6: Commit** — `git add bin/smtp-test control-panel/packages/api/src/core-bridge/exec.ts bin/vibe-panel-run && git commit -m "feat(smtp): bin/smtp-test + VIBE_OPS + wrapper allowlist"`

---

## Task 7: DB schema — `smtp_config` table

**Files:** Create `control-panel/packages/db/src/schema/smtp.ts`; modify the schema barrel that the drizzle config globs.

**Interfaces — Produces:** `smtpConfig` table (`smtp_config`), siteId PK, nullable columns, write-only `password`.

- [ ] **Step 1: Create `smtp.ts`** (mirror `notify.ts`):

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const smtpConfig = sqliteTable("smtp_config", {
	siteId: text("site_id").primaryKey(),
	/** off | relay | log */
	mode: text("mode"),
	host: text("host"),
	port: integer("port"),
	/** starttls | tls | none */
	secure: text("secure"),
	/** on | off */
	auth: text("auth"),
	username: text("username"),
	/** Write-only: never returned by the API. */
	password: text("password"),
	fromAddress: text("from_address"),
	fromName: text("from_name"),
});
```

- [ ] **Step 2: Export it** from the same barrel/index that `notify.ts` is exported from (match how `notifyConfig` is surfaced to `db`).

- [ ] **Step 3: Apply the schema** — `cd control-panel && bun run db:push` → confirm it emits a `CREATE TABLE smtp_config`. (Ensure the new test file from Task 9 is NOT under `src/schema/*` — the drizzle glob would pick it up; see Logs feature's same gotcha.)

- [ ] **Step 4: Commit** — `git add control-panel/packages/db/src/schema/smtp.ts control-panel/packages/db/src/schema && git commit -m "feat(smtp): smtp_config drizzle table"`

---

## Task 8: `smtp-config-pure.ts` (merge / toEnv / mask) + tests

**Files:** Create `control-panel/packages/api/src/core-bridge/smtp-config-pure.ts` + `smtp-config-pure.test.ts`.

**Interfaces — Produces:** `mergeSmtpConfig(global, site)`, `toEnv(cfg)` → `Record<string,string>` of `SMTP_*`, `maskSmtpRow(row)` → `{...nonSecret, hasPassword}`.

- [ ] **Step 1: Write the failing test** — `smtp-config-pure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskSmtpRow, mergeSmtpConfig, toEnv } from "./smtp-config-pure";

const row = (o: Record<string, unknown> = {}) => ({
  siteId: "s", mode: null, host: null, port: null, secure: null, auth: null,
  username: null, password: null, fromAddress: null, fromName: null, ...o,
});

describe("mergeSmtpConfig", () => {
  it("site overrides global field-by-field", () => {
    const m = mergeSmtpConfig(row({ host: "g", mode: "relay" }), row({ host: "s" }));
    expect(m.host).toBe("s");
    expect(m.mode).toBe("relay");
  });
  it("falls back to global when no site row", () =>
    expect(mergeSmtpConfig(row({ host: "g" }), null).host).toBe("g"));
});

describe("toEnv", () => {
  it("maps to SMTP_* keys with sane defaults", () => {
    const e = toEnv(mergeSmtpConfig(row({ mode: "relay", host: "h", port: 587, secure: "starttls", auth: "on", username: "u", password: "p", fromAddress: "f@x", fromName: "N" }), null));
    expect(e.SMTP_MODE).toBe("relay");
    expect(e.SMTP_HOST).toBe("h");
    expect(e.SMTP_PORT).toBe("587");
    expect(e.SMTP_PASSWORD).toBe("p");
    expect(e.SMTP_FROM).toBe("f@x");
  });
  it("omits SMTP_PASSWORD when null (preserve-existing semantics)", () =>
    expect("SMTP_PASSWORD" in toEnv(mergeSmtpConfig(row({ mode: "relay" }), null))).toBe(false));
});

describe("maskSmtpRow", () => {
  it("replaces password with hasPassword boolean", () => {
    const m = maskSmtpRow(row({ password: "secret", host: "h" }))!;
    expect((m as Record<string, unknown>).password).toBeUndefined();
    expect((m as Record<string, unknown>).hasPassword).toBe(true);
    expect((m as Record<string, unknown>).host).toBe("h");
  });
  it("hasPassword false when empty/null", () =>
    expect((maskSmtpRow(row())! as Record<string, unknown>).hasPassword).toBe(false));
  it("null row -> null", () => expect(maskSmtpRow(null)).toBeNull());
});
```

- [ ] **Step 2: Run → FAIL** (`cd control-panel/packages/api && bunx vitest run src/core-bridge/smtp-config-pure.test.ts`).

- [ ] **Step 3: Implement `smtp-config-pure.ts`:**

```ts
export interface SmtpConfigRow {
	siteId: string;
	mode: string | null;
	host: string | null;
	port: number | null;
	secure: string | null;
	auth: string | null;
	username: string | null;
	password: string | null;
	fromAddress: string | null;
	fromName: string | null;
}

/** Site row overrides global field-by-field; nulls fall through to global. */
export function mergeSmtpConfig(
	global: SmtpConfigRow | null,
	site: SmtpConfigRow | null
): SmtpConfigRow {
	const base = global ?? site;
	if (!base) {
		throw new Error("mergeSmtpConfig requires at least one row");
	}
	const pick = <K extends keyof SmtpConfigRow>(k: K): SmtpConfigRow[K] =>
		(site?.[k] ?? global?.[k] ?? null) as SmtpConfigRow[K];
	return {
		siteId: site?.siteId ?? global?.siteId ?? "",
		mode: pick("mode"),
		host: pick("host"),
		port: pick("port"),
		secure: pick("secure"),
		auth: pick("auth"),
		username: pick("username"),
		password: pick("password"),
		fromAddress: pick("fromAddress"),
		fromName: pick("fromName"),
	};
}

/** Map to SMTP_* env. SMTP_PASSWORD is OMITTED when null so the env-file apply
 * preserves the existing secret (matches bin/smtp-config-apply's sentinel). */
export function toEnv(cfg: SmtpConfigRow): Record<string, string> {
	const env: Record<string, string> = {
		SMTP_MODE: cfg.mode ?? "off",
		SMTP_HOST: cfg.host ?? "",
		SMTP_PORT: String(cfg.port ?? 587),
		SMTP_SECURE: cfg.secure ?? "starttls",
		SMTP_AUTH: cfg.auth ?? "on",
		SMTP_USER: cfg.username ?? "",
		SMTP_FROM: cfg.fromAddress ?? "",
		SMTP_FROM_NAME: cfg.fromName ?? "",
	};
	if (cfg.password !== null && cfg.password !== "") {
		env.SMTP_PASSWORD = cfg.password;
	}
	return env;
}

export function maskSmtpRow(
	row: SmtpConfigRow | null
): Record<string, unknown> | null {
	if (!row) {
		return null;
	}
	const { password, ...rest } = row;
	return { ...rest, hasPassword: password !== null && password.trim() !== "" };
}
```

- [ ] **Step 4: Run → PASS.** Then `cd control-panel && bun run check-types | tail -1`.

- [ ] **Step 5: Commit** — `git add control-panel/packages/api/src/core-bridge/smtp-config-pure.ts control-panel/packages/api/src/core-bridge/smtp-config-pure.test.ts && git commit -m "feat(smtp): pure merge/toEnv/mask helpers + tests"`

---

## Task 9: `smtp-config.ts` (DB + runVibe wiring)

**Files:** Create `control-panel/packages/api/src/core-bridge/smtp-config.ts`.

**Interfaces:**
- Consumes: `smtpConfig` table (Task 7), `mergeSmtpConfig`/`toEnv` (Task 8), `runVibe`/`smtpConfigApply` (Task 6), `findSite`, `GLOBAL_SITE_ID`.
- Produces: `getSmtpConfig`, `setSmtpConfig`, `resolveSmtpConfig`, `smtpConfigEnv`, `applySmtpConfigToSite`, `smtpTestEnv`.

- [ ] **Step 1: Implement** — mirror `notify-config.ts` exactly (read the real file first). Key points:
  - `getSmtpConfig(siteId)` — `db.select().from(smtpConfig).where(eq(smtpConfig.siteId, siteId))` → row|null.
  - `setSmtpConfig(siteId, patch)` — upsert with preserve-password: only set `password` when `patch.password?.trim()` is non-empty (mirror notify's `tokenUpdate` pattern); `onConflictDoUpdate`.
  - `resolveSmtpConfig(siteId)` — `mergeSmtpConfig(getSmtpConfig(GLOBAL_SITE_ID), siteId===GLOBAL? null : getSmtpConfig(siteId))`.
  - `smtpConfigEnv(siteId)` — `toEnv(await resolveSmtpConfig(siteId))`.
  - `applySmtpConfigToSite(siteId)` — `runVibe(site.installDir, "prod", "smtpConfigApply", { env: await smtpConfigEnv(siteId) })`; throw on `result.code !== 0` (same as notify).
  - `smtpTestEnv(siteId, testTo)` — `{ ...await smtpConfigEnv(siteId), SMTP_TEST_TO: testTo }`.

- [ ] **Step 2: Typecheck** — `cd control-panel && bun run check-types | tail -1` (clean). The DB+spawn paths are exercised end-to-end on the VPS (final task), matching how `notify-config.ts` is covered.

- [ ] **Step 3: Commit** — `git add control-panel/packages/api/src/core-bridge/smtp-config.ts && git commit -m "feat(smtp): smtp-config.ts DB + runVibe wiring (mirror notify-config)"`

---

## Task 10: Settings router — `smtpConfigGet/Set/Test`

**Files:** Modify `control-panel/packages/api/src/routers/settings.ts`.

- [ ] **Step 1: Add a `maskSmtpRow` import** (from `core-bridge/smtp-config-pure`) and a `smtpConfigSetInput` zod schema:

```ts
const smtpConfigSetInput = z.object({
	siteId: z.string().min(1),
	mode: z.enum(["off", "relay", "log"]).optional(),
	host: z.string().optional(),
	port: z.number().int().min(1).max(65_535).optional(),
	secure: z.enum(["starttls", "tls", "none"]).optional(),
	auth: z.enum(["on", "off"]).optional(),
	username: z.string().optional(),
	/** Write-only. Omit/empty to preserve the existing password. */
	password: z.string().optional(),
	fromAddress: z.string().optional(),
	fromName: z.string().optional(),
});
```

- [ ] **Step 2: Add three procedures** (mirror `notifyConfigGet/Set/Test`):

```ts
smtpConfigGet: adminProcedure
	.input(z.object({ siteId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const [site, global] = await Promise.all([
			getSmtpConfig(input.siteId),
			getSmtpConfig(GLOBAL_SITE_ID),
		]);
		return { site: maskSmtpRow(site), global: maskSmtpRow(global) };
	}),

smtpConfigSet: adminProcedure
	.input(smtpConfigSetInput)
	.handler(async ({ input }) => {
		const { siteId, ...patch } = input;
		await setSmtpConfig(siteId, patch);
		await applyToSites(
			siteId,
			async () => (await detectSites()).map((s) => s.id),
			applySmtpConfigToSite
		);
		return { ok: true };
	}),

smtpTest: adminProcedure
	.input(z.object({ siteId: z.string().min(1), to: z.string().email() }))
	.handler(async ({ input }) => {
		let site =
			input.siteId === GLOBAL_SITE_ID ? null : await findSite(input.siteId);
		if (!site) {
			const sites = await detectSites();
			site = sites[0] ?? null;
		}
		if (!site) {
			return { ok: false, message: "No site found — deploy a site first." };
		}
		const result = await runVibe(site.installDir, "prod", "smtpTest", {
			env: { SMTP_TEST_TO: input.to },
		});
		const message = (result.stdout || result.stderr).trim();
		return { ok: result.code === 0, message };
	}),
```
(`runVibe` already pipes output through `redact()`; the `--debug` transcript has the password masked by msmtp as `***`, and `redact()` masks any residual `SMTP_PASSWORD` match.)

- [ ] **Step 3: Typecheck + full api suite** — `cd control-panel && bun run check-types && cd packages/api && bunx vitest run` → green.

- [ ] **Step 4: Commit** — `git add control-panel/packages/api/src/routers/settings.ts && git commit -m "feat(smtp): smtpConfigGet/Set/Test admin procedures"`

---

## Task 11: Web — Mail card + Settings tab

**Files:** Modify `control-panel/web/src/data/queries.ts`, `control-panel/web/src/routes/_auth/settings.tsx`; create `control-panel/web/src/components/settings/mail-card.tsx`.

- [ ] **Step 1: Add the query** to `queries.ts` (mirror `notifyConfigQuery`):

```ts
export const smtpConfigQuery = (siteId: string) =>
	orpc.smtpConfigGet.queryOptions({ input: { siteId } });
```

- [ ] **Step 2: Create `mail-card.tsx`** — mirror `notify-card.tsx` structure (`useQuery(smtpConfigQuery(GLOBAL_SITE_ID))` + `QueryBoundary` + a `MailForm` with local state, password field starts empty, `hasPassword` shows `●●●●● (saved)`). Form fields: mode (segmented Off/Relay/Log), host, port, secure (select starttls/tls/none), auth (toggle), username, password, from, from-name. Save via `orpc.smtpConfigSet.mutationOptions()`; "Send test" opens a recipient prompt → `orpc.smtpTest.mutationOptions()` → show the (already-redacted) transcript in a `<pre>`. Include the staging-guard warning text when mode=relay (informational). Keep the file focused; split a `MailForm` subcomponent if it approaches large size.

- [ ] **Step 3: Add a "Mail" tab** to `settings.tsx` — add `<TabsTrigger value="mail">Mail</TabsTrigger>` and a `<TabsContent value="mail"><MailCard/></TabsContent>` (place after Notifications).

- [ ] **Step 4: Quality gate** — `cd control-panel && bun run check-types && bun run check && bun run build` (or web build). Fix any lint; match existing import/format style.

- [ ] **Step 5: Commit** — `git add control-panel/web/src/data/queries.ts control-panel/web/src/components/settings/mail-card.tsx control-panel/web/src/routes/_auth/settings.tsx && git commit -m "feat(smtp): Mail settings card + tab"`

---

## Task 12: VPS validation (final)

Controller-run on the test VPS after all tasks review-clean. Deploy the branch (`git -C /opt/vibe-wp-src fetch && checkout` the branch, `bin/panel update`), stand up a prod test site (as in the Logs validation), set generic SMTP creds (a real provider account or a catch-all test inbox), and verify:

- [ ] `SMTP_MODE=off` → `wp eval 'var_dump(wp_mail("x@example.com","t","b"));'` does not send and does not crash.
- [ ] `SMTP_MODE=relay` + valid creds → `wp_mail(...)` delivers to the test inbox within ~60s.
- [ ] **Queue/retry:** set a deliberately-wrong `SMTP_HOST`, send → message lands in `wp-content/.vibe/mail-queue`; fix the host + wait one cron interval → `vibe-wp-mailq-flush` delivers it and clears the spool.
- [ ] `SMTP_PASSWORD` does NOT appear in `docker compose logs wordpress` or in `bin/vibe prod logs-recent wordpress`.
- [ ] `/etc/msmtprc` in the container is `0600 www-data` and not world-readable.
- [ ] Panel: `smtpConfigSet` (Save) then `smtpTest` (Send test) → transcript shown with password masked; `smtpConfigGet` returns `hasPassword: true` and no password value.
- [ ] Re-save without the password (preserve) → the stored password is unchanged (still relays).
- [ ] Tear down the test site; leave the VPS clean.

---

## Self-Review (plan author)

**Spec coverage:** §3.1 Dockerfile→T1; §3.2 php.ini→T2; §3.3 entrypoint→T2; §3.4 msmtprc.template→T1; §3.5 MU plugin→T3; §3.6 smtp-config-apply→T5; §3.7 smtp-test→T6; §3.8 VIBE_OPS→T6; §3.9 allowlist→T6; §3.10 smtp-config.ts→T8/T9; §3.11 settings→T10; §3.12 staging guard→T3/T11; §4 host relay (Option A)→constraints; §5 security→T5/T6/T10; §6 deliverability→(client-side checklist deferred to a UI polish pass, noted); §7 UI→T11; §9 phases→T1–T11; §10 open decisions→all resolved in Global Constraints; §11 tests→T8 + VPS.

**Decisions baked in:** msmtpq-style reliability via the two Vibe shims (owner: queue+retry); generic SMTP (owner: no provider tiles); provider-direct (Option A); off/relay/log modes; cron-driven flush; SMTP_MODE in the env-file apply.

**Corrections vs. spec (drift/improvement):** (1) reliability uses two small reviewable shims around `msmtp` rather than the original "msmtp -t direct" (no-retry) — closes the silent-mail-loss gap the owner flagged; (2) `SMTP_SECURE` (starttls|tls|none) replaces the spec's separate `SMTP_TLS`/`SMTP_STARTTLS` flags (cleaner, maps 1:1 to msmtp); (3) `msmtprc logfile -` → stderr (visible in the new Logs feature) instead of a file; (4) SMTP env added to the `x-wordpress-environment` anchor so BOTH wordpress + cron containers get it (the cron container is where the flush runs); (5) provider default dropped (owner: generic-only) — simplifies the UI vs the spec's Resend/Postmark copy; (6) deliverability DNS checklist deferred to a UI polish pass (generic-only reduces its value in v1).

**Type/name consistency:** `SmtpConfigRow` fields match the `smtp_config` columns (mode/host/port/secure/auth/username/password/fromAddress/fromName) across the table, pure helpers, `smtp-config.ts`, and the router input. `toEnv` emits exactly the `SMTP_*` keys that `bin/smtp-config-apply` manages and the entrypoint reads. `maskSmtpRow` → `hasPassword` matches the web card's `hasPassword` check.

**No placeholders:** every code step has complete code or an exact mirror target (named file + the specific deltas). The two mirror-heavy tasks (T5 smtp-config-apply, T9 smtp-config.ts, T11 mail-card) name the exact source file to copy and the precise changes.
