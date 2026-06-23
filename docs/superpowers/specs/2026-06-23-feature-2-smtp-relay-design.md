# Feature #2: SMTP Relay + Server Mail — Design Spec

**Date:** 2026-06-23
**Effort:** M
**Branch target:** `feature/smtp-relay`
**Status:** Draft — open decisions flagged in §10

---

## 1. Context

WordPress sends mail for password resets, new-user notifications, WooCommerce order confirmations, plugin alerts, and the admin contact form. Today, every site in this stack is a **silent black hole** for outbound mail:

- `vibe-wp-environment.php` hooks `pre_wp_mail` and returns `true` to suppress all mail when `VIBE_WP_DISABLE_OUTBOUND_MAIL=1` or when `WP_ENVIRONMENT_TYPE=staging` (the default on stage). This is intentional for staging — emails to real customers must never leak from a dev clone — but production sites carry the same default (`VIBE_WP_DISABLE_OUTBOUND_MAIL=0` in `prod.env.example`) and still have no working mail path unless the owner manually installs WP Mail SMTP.
- The base WordPress image has no MTA or sendmail binary. PHP's `mail()` function is unconfigured; `wp_mail()` degrades to `mail()` which silently drops the message.
- No `sendmail_path` is set in `php.ini.template`.

The result: production WordPress sites on this stack silently drop all mail by default. Owners typically discover this when a customer says they never received a password reset.

This spec adds a first-class, ops-managed mail path — baked into the image, configured entirely from env, surfaced through the control panel — that makes outbound mail work without the owner touching wp-admin plugin settings.

---

## 2. Decisions (Settled)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **`msmtp` as the sendmail replacement** | Tiny (~200 kB), single binary, no daemon, pure SMTP client. Ships in both `apt` and `apk`. Reads a config file rendered at entrypoint from env vars. Perfect fit for the "render from env" pattern the whole stack already uses. |
| D2 | **Not a WP plugin** | A plugin requires the owner to install, configure, and keep updated. An MU plugin sets `wp_mail_from`/`wp_mail_from_name`; the actual transport is `sendmail_path` in `php.ini` — below the WP layer entirely. |
| D3 | **Not per-site Postfix** | Postfix is a full MTA, complex to configure correctly, and a known open-relay risk if misconfigured. msmtp is a null client (client-side relay only — it never accepts inbound connections or relays from other hosts). |
| D4 | **`SMTP_MODE=relay\|off\|log`** | `off` = today's behavior (suppress via `VIBE_WP_DISABLE_OUTBOUND_MAIL`). `relay` = forward through configured SMTP. `log` = write to a Maildir under `/var/mail/vibe-wp/` for debugging without sending. |
| D5 | **`SMTP_PASSWORD` is write-only** | Stored only in the site env file (0600, root-owned), never returned by any API endpoint. Masked as `hasPassword: boolean` in the panel response. Secrets travel as injected env to `bin/vibe smtp-config-apply`, never as argv. |
| D6 | **MU plugin for `wp_mail_from`** | Sets WordPress envelope sender from `SMTP_FROM` env so that DKIM signing (done at the relay) aligns with the From header. Removes the most common reason owners install WP Mail SMTP. Mirrored in both `content/mu-plugins/` and `docker/wordpress/mu-plugins/` per repo invariant. |
| D7 | **Host-level shared relay as the default path** | A VPS IP typically has no PTR record, no SPF, no DKIM. Pointing every site at a single transactional provider account (Resend, Postmark, SES, Mailgun) via a host-level shared SMTP credential set is the deliverability-safe default. Per-site override is supported. |
| D8 | **`smtp-config-apply` and `smtp-test` ops mirror `notify-config-apply` / `notify-test` exactly** | Same atomic-rename env-file write, same `VIBE_OPS` registration, same `vibe-panel-run` allowlist entry. No new patterns invented. |

---

## 3. Architecture & Components

### 3.1 Dockerfile changes

File: `docker/wordpress/Dockerfile`

Add `msmtp` to the package install block, for both `apt-get` and `apk` paths:

```dockerfile
# apt-get path (Debian/Ubuntu base):
apt-get install -y --no-install-recommends \
  ... \
  msmtp \
  msmtp-mta     # installs /usr/sbin/sendmail symlink

# apk path (Alpine base):
apk add --no-cache \
  ... \
  msmtp
# Alpine's msmtp package does NOT include the sendmail symlink; add explicitly:
ln -sf /usr/bin/msmtp /usr/sbin/sendmail
```

No new `COPY` lines — the config is rendered at entrypoint from env, not baked in.

### 3.2 `php.ini.template` changes

File: `docker/wordpress/php.ini.template`

Add one new line:

```ini
sendmail_path = ${PHP_SENDMAIL_PATH}
```

Default in `entrypoint.sh` (§3.3 below):

```sh
export PHP_SENDMAIL_PATH="${PHP_SENDMAIL_PATH:-/usr/bin/msmtp -t}"
```

When `SMTP_MODE=off` or `SMTP_MODE=log` the entrypoint sets `PHP_SENDMAIL_PATH` to `/bin/true` (silently discards) or a tiny wrapper script respectively, so `sendmail_path` controls behavior without requiring a second ini file.

### 3.3 `entrypoint.sh` changes

File: `docker/wordpress/entrypoint.sh`

Three additions, all before the `envsubst` calls:

**A. Set defaults for SMTP env vars:**

```sh
export SMTP_MODE="${SMTP_MODE:-off}"
export SMTP_HOST="${SMTP_HOST:-}"
export SMTP_PORT="${SMTP_PORT:-587}"
export SMTP_USER="${SMTP_USER:-}"
export SMTP_PASSWORD="${SMTP_PASSWORD:-}"
export SMTP_FROM="${SMTP_FROM:-wordpress@localhost}"
export SMTP_FROM_NAME="${SMTP_FROM_NAME:-WordPress}"
export SMTP_TLS="${SMTP_TLS:-on}"
export SMTP_AUTH="${SMTP_AUTH:-on}"
export SMTP_LOGFILE="${SMTP_LOGFILE:-/var/mail/vibe-wp/smtp.log}"
```

**B. Render `/etc/msmtprc` (mode 0600, owned root, readable by www-data via group or ACL — see §5):**

```sh
case "${SMTP_MODE}" in
  relay)
    mkdir -p /var/mail/vibe-wp
    envsubst '${SMTP_HOST} ${SMTP_PORT} ${SMTP_USER} ${SMTP_PASSWORD}
              ${SMTP_FROM} ${SMTP_TLS} ${SMTP_AUTH} ${SMTP_LOGFILE}' \
      < /usr/local/share/vibe-wp/msmtprc.template > /etc/msmtprc
    chmod 640 /etc/msmtprc
    chown root:www-data /etc/msmtprc
    export PHP_SENDMAIL_PATH="/usr/bin/msmtp -t"
    ;;
  log)
    mkdir -p /var/mail/vibe-wp
    export PHP_SENDMAIL_PATH="/usr/local/bin/vibe-wp-mail-log"
    # render a log-only msmtprc too (uses msmtp --logfile only, no real server):
    # alternative: write the mail to Maildir without msmtp (see §3.4)
    ;;
  off|*)
    export PHP_SENDMAIL_PATH="/bin/true"
    ;;
esac
```

**C. Add `PHP_SENDMAIL_PATH` to the `envsubst` variable list in the `php.ini.template` block.**

### 3.4 New `msmtprc.template`

File: `docker/wordpress/msmtprc.template` (new file, COPY'd in Dockerfile)

```
# msmtp config rendered by vibe-wp-entrypoint at container start.
# 0640 root:www-data — contains SMTP credentials.
defaults
  auth           ${SMTP_AUTH}
  tls            ${SMTP_TLS}
  tls_starttls   on
  tls_certcheck  on
  logfile        ${SMTP_LOGFILE}

account        default
  host         ${SMTP_HOST}
  port         ${SMTP_PORT}
  from         ${SMTP_FROM}
  user         ${SMTP_USER}
  password     ${SMTP_PASSWORD}
```

The template is baked into the image at build time (static file, no secrets). Secrets arrive only at container start via env, rendered into `/etc/msmtprc` by the entrypoint. `/etc/msmtprc` is ephemeral — it lives only inside the running container, is not mounted, and is never written to any host path.

### 3.5 New MU plugin: `vibe-wp-smtp.php`

**Must be created in BOTH locations** (repo invariant documented in CLAUDE.md):

- `content/mu-plugins/vibe-wp-smtp.php`
- `docker/wordpress/mu-plugins/vibe-wp-smtp.php`

Purpose: set `wp_mail_from` and `wp_mail_from_name` from env so the WordPress From header matches the SMTP envelope sender used by msmtp — required for DKIM alignment.

```php
<?php
/**
 * Plugin Name: Vibe WP SMTP
 * Description: Sets WordPress mail sender from env vars for DKIM-aligned envelope sender.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('vibe_wp_smtp_from')) {
    function vibe_wp_smtp_from(): string
    {
        $value = getenv('SMTP_FROM');
        return ($value !== false && $value !== '') ? (string) $value : '';
    }
}

if (!function_exists('vibe_wp_smtp_from_name')) {
    function vibe_wp_smtp_from_name(): string
    {
        $value = getenv('SMTP_FROM_NAME');
        return ($value !== false && $value !== '') ? (string) $value : '';
    }
}

$vibe_smtp_from = vibe_wp_smtp_from();
if ($vibe_smtp_from !== '') {
    add_filter('wp_mail_from', static function () use ($vibe_smtp_from): string {
        return $vibe_smtp_from;
    });
}

$vibe_smtp_from_name = vibe_wp_smtp_from_name();
if ($vibe_smtp_from_name !== '') {
    add_filter('wp_mail_from_name', static function () use ($vibe_smtp_from_name): string {
        return $vibe_smtp_from_name;
    });
}
```

This file stays under 220 lines. It does nothing when `SMTP_FROM` is unset (env var absent or empty) — safe default for sites that do not configure SMTP.

### 3.6 New shell op: `bin/smtp-config-apply`

File: `bin/smtp-config-apply` (new, mirror of `bin/notify-config-apply`)

Writes `SMTP_*` env vars into the site's `prod.env` using the same atomic-rename pattern as `notify-config-apply`:

- Managed keys: `SMTP_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_TLS`, `SMTP_AUTH`.
- `SMTP_PASSWORD` is only overwritten when `SMTP_PASSWORD` is non-empty in the injected env (preserve-existing-secret semantics identical to `VIBE_MONITOR_TELEGRAM_TOKEN`).
- All managed keys are upserted (added when absent, replaced when present).
- Every other line in `prod.env` is preserved verbatim.
- The working copy inherits the original file's mode (0600) via `cp -p`; atomic `mv -f` swaps it in.
- Secrets are never printed to stdout/stderr.

### 3.7 New shell op: `bin/smtp-test`

File: `bin/smtp-test` (new)

Reads SMTP config from the site's `prod.env` (already applied by `smtp-config-apply`) and sends a test message to `SMTP_TEST_TO` (injected by the panel as a one-shot env var, NOT stored in the env file). Uses:

```sh
echo "Subject: Vibe WP SMTP Test\nFrom: ${SMTP_FROM}\nTo: ${SMTP_TEST_TO}\n\nThis is a test message from Vibe WP." \
  | msmtp --debug --file /etc/msmtprc "${SMTP_TEST_TO}" 2>&1
```

The `--debug` flag emits the SMTP transcript (including EHLO/AUTH/DATA exchange) to stderr. The panel captures both stdout+stderr, **redacts** the output through `redact.ts` before returning it to the UI, and displays a truncated transcript to the owner. The password is never in the transcript (msmtp masks it as `***`). The panel further redacts any remaining `SMTP_PASSWORD` matches via `redact.ts`.

The test op reads credentials from the running container's `/etc/msmtprc` (rendered at container start) or re-renders from the env file directly (without a container restart) for a static test that bypasses PHP.

### 3.8 `VIBE_OPS` registration

File: `control-panel/packages/api/src/core-bridge/exec.ts`

Add to the `VIBE_OPS` const object (after `notifyTest`):

```typescript
smtpConfigApply: { argv: ["smtp-config-apply"], stream: false },
smtpTest:        { argv: ["smtp-test"],         stream: false },
```

### 3.9 `vibe-panel-run` allowlist

File: `bin/vibe-panel-run`

Add `smtp-config-apply` and `smtp-test` to `OP_ALLOWLIST` (line 155, maintaining the mirrored comment):

```sh
OP_ALLOWLIST="... notify-config-apply notify-test smtp-config-apply smtp-test ..."
```

No new special-case validation is needed — both ops take no free-form args (no `takesArg` flag). The existing `validate_arg` guard on any extras is sufficient.

### 3.10 New core-bridge module: `smtp-config.ts`

File: `control-panel/packages/api/src/core-bridge/smtp-config.ts`

Mirrors `notify-config.ts` in structure:

- `getSmtpConfig(siteId)` — reads from SQLite `smtp_config` table.
- `setSmtpConfig(siteId, patch)` — upserts; only overwrites `smtpPassword` when non-empty string supplied.
- `resolveSmtpConfig(siteId)` — merges global row + site row (global provides host-level shared relay defaults; per-site row overrides selectively).
- `applySmtpConfigToSite(siteId)` — calls `runVibe(..., 'smtpConfigApply', { env })` with secrets in env, never in argv.
- `smtpTestEnv(siteId)` — assembles the env map (including `SMTP_TEST_TO`) for the test op.

### 3.11 Settings router additions

File: `control-panel/packages/api/src/routers/settings.ts`

Add four new procedures (admin-gated):

```typescript
smtpConfigGet:  adminProcedure  // returns { site: masked, global: masked }
smtpConfigSet:  adminProcedure  // upserts + applyToSites fan-out
smtpTest:       adminProcedure  // sends test email, returns redacted transcript
```

`maskSmtpRow()` masks `smtpPassword` as `hasPassword: boolean`, identical to `maskRow()` for backup secrets.

### 3.12 Cross-cutting rule: `VIBE_WP_DISABLE_OUTBOUND_MAIL`

`vibe-wp-environment.php` currently suppresses mail via `pre_wp_mail` when `VIBE_WP_DISABLE_OUTBOUND_MAIL=1` OR when the environment type is staging.

When `SMTP_MODE=relay` is set on a staging site (e.g. an owner deliberately testing mail on stage), `VIBE_WP_DISABLE_OUTBOUND_MAIL` must NOT be forced on by default. The current code defaults the staging suppression to `vibe_wp_is_staging()`, which is correct — it is only the DEFAULT, and `VIBE_WP_DISABLE_OUTBOUND_MAIL=0` already overrides it. No change needed to the mu-plugin logic; the panel's Mail card should surface a warning when `SMTP_MODE=relay` is enabled on a staging site and `VIBE_WP_DISABLE_OUTBOUND_MAIL` is not explicitly set to `0`.

---

## 4. Host-Level Shared Relay

### 4.1 The problem with per-site raw sendmail

A typical VPS IP address has:
- No PTR (rDNS) record pointing to the domain.
- No SPF record authorizing the IP.
- No DKIM signing.
- No DMARC policy.

Even with msmtp configured to relay directly to port 25, the receiving mail server (Gmail, Outlook, etc.) will either reject or spam-folder every message. This is not fixable by the owner without a dedicated mail IP and ISP cooperation.

### 4.2 Option A — Steer to a transactional provider (recommended default)

The owner creates one account at a transactional ESP (Resend, Postmark, AWS SES, Mailgun, SendGrid). The provider handles SPF/DKIM/DMARC and provides SMTP credentials. The panel stores those credentials in the **global** SMTP config row (scoped to `GLOBAL_SITE_ID`, the same pattern backup and notify already use). Every site on the VPS inherits the global credentials via `resolveSmtpConfig` unless it has a per-site override.

Each site's `SMTP_FROM` differentiates which domain the provider sees as sender. The provider must have DKIM set up for each sending domain — the panel's Mail card surfaces a DNS checklist (§6).

**Advantages:** No extra Docker container, no Postfix config, provider handles deliverability reputation, bounces, and suppression lists. Cheaper than a dedicated mail IP.

**Disadvantages:** Monthly cost at provider (~$0–$20/mo for low volume). Owner must create an account and supply credentials. DKIM setup required per domain at the provider.

### 4.3 Option B — Bundled host-level Postfix null-client container

A single Postfix container on the internal Docker network (`postfix` service in `compose.yaml`) configured as a null client — it accepts mail ONLY from internal Docker network addresses (not from the internet), relays everything upstream to a provider or smarthost, and never delivers locally or to the open internet.

Every site's `msmtp` points at `SMTP_HOST=postfix` (the internal service name) with `SMTP_PORT=25` and `SMTP_AUTH=off` (auth happens at the Postfix→upstream leg, not the msmtp→Postfix leg). Per-site `SMTP_FROM` still determines the envelope sender for DKIM alignment.

```yaml
# compose.yaml addition (shared service)
postfix:
  image: vibe-wp-postfix        # custom image, Postfix null-client
  networks:
    - internal
  # NO port mapping to host — internal-only
  environment:
    - POSTFIX_RELAYHOST=${POSTFIX_RELAYHOST:-}
    - POSTFIX_SASL_USER=${POSTFIX_SASL_USER:-}
    - POSTFIX_SASL_PASSWORD=${POSTFIX_SASL_PASSWORD:-}
```

**Open-relay risk mitigation:** `mynetworks` in `main.cf` is set to only the Docker internal subnet (e.g. `172.16.0.0/12`). `inet_interfaces = loopback-only,internal` is NOT sufficient because "internal" is not a Postfix keyword — instead: `inet_interfaces = all` with `mynetworks` restricted. The container has no published host port. A host firewall rule (UFW/iptables) that blocks port 25 inbound from the internet is a defense-in-depth layer (the installer already handles UFW). Result: even if Postfix is misconfigured, it cannot relay mail from the open internet because Docker's internal network is not reachable from outside the host.

**Advantages:** One credential set for all sites on the host, simpler per-site msmtp config (no per-site SMTP_USER/PASSWORD needed), operator controls the full relay chain.

**Disadvantages:** Extra Docker service (RAM, complexity). Still needs a smarthost or provider upstream for deliverability. Postfix config is non-trivial to get right. The bundled Postfix image adds maintenance burden.

### 4.4 Recommendation for this spec

Ship **Option A** (provider-managed SMTP) in the initial implementation because:
1. Zero additional Docker services.
2. Deliverability is the provider's problem, not the operator's.
3. The global/per-site config model already exists; adding SMTP creds to it is a thin addition.
4. Resend and Postmark both offer a generous free tier (3,000–100 emails/month) adequate for small WP sites.

**Option B** remains viable for multi-site operators who want a single Postfix container. It can be added in a follow-on spec. The env var naming (`SMTP_HOST`, `SMTP_PORT`, `SMTP_AUTH`) is designed so that pointing msmtp at a local Postfix just means changing those two values — no structural changes.

See §10 (Open Decisions) for the owner's choice.

---

## 5. Security Model

| Concern | Mitigation |
|---------|-----------|
| **SMTP credentials in env file** | `prod.env` is 0600, root-owned. Written only by root (via `smtp-config-apply` through the sudoers-gated `vibe-panel-run` wrapper). Never returned by any API. |
| **Panel API never returns password** | `smtpConfigGet` returns `hasPassword: boolean` only (via `maskSmtpRow()`). Same pattern as backup `secret` and notify `telegramToken`. |
| **Secrets not in argv** | `applySmtpConfigToSite` passes `SMTP_PASSWORD` in the process `env` map, not in `argv`. The `vibe-panel-run` privilege boundary enforces this: op argv is logged and validated; env is not logged. |
| **Test transcript redacted** | `smtpTest` op output is piped through `redact()` before the panel returns it. The panel additionally redacts any occurrence of `SMTP_PASSWORD` value from the transcript string. msmtp itself masks passwords in `--debug` output as `***`. |
| **`/etc/msmtprc` permissions** | Rendered 0640 root:www-data. PHP-FPM runs as www-data, so it can read the file. No other OS user can read it. The file is ephemeral — not mounted to any host path. |
| **msmtp not a relay** | msmtp has no listening port. It cannot accept inbound connections. It only makes outbound connections to the configured `SMTP_HOST:SMTP_PORT`. No open-relay risk is possible with msmtp itself. |
| **`smtp-config-apply` idempotent + atomic** | Same `cp -p` + `mv -f` pattern as `notify-config-apply`. The env file is never observed truncated. The working copy inherits the 0600 mode from `cp -p`. |
| **`smtp-test` one-shot recipient** | `SMTP_TEST_TO` is passed as a one-shot injected env, never stored in the env file. The panel validates it as an email address before passing. |
| **`vibe-panel-run` allowlist** | `smtp-config-apply` and `smtp-test` are added to `OP_ALLOWLIST`. No `takesArg` flag means zero caller-supplied arguments reach either op. Any attempt to pass args causes `validate_arg` to abort. |
| **No new secrets through argv** | All `SMTP_*` values travel through the injected env map in `runVibe()`. The `buildVibeArgv` function receives no secrets. |

---

## 6. Deliverability

### 6.1 Why raw sendmail from a VPS IP fails

Receiving mail servers score inbound messages against:

1. **PTR record** — Does the IP have a reverse DNS entry matching the sending domain? Most VPS IPs do not.
2. **SPF** — Is the IP listed in the domain's TXT record as an authorized sender? Only if the owner explicitly adds the VPS IP.
3. **DKIM** — Is the message signed with a private key whose public key is in DNS? Not possible without a dedicated signing daemon.
4. **DMARC** — Does the From header align with SPF or DKIM? Fails if neither is set.

Even a correctly configured msmtp pointing at port 25 of a recipient MX will fail the PTR check on major providers. Using a transactional relay sidesteps all of this — the provider's IP pool has PTR, SPF, DKIM, and DMARC configured.

### 6.2 DNS checklist surfaced in the panel

The Mail settings card includes an expandable "Deliverability checklist" section. The panel runs a passive DNS check (using `dig` or `host` via a new read-only op, or a JS-side fetch to a public DNS-over-HTTPS endpoint) and shows:

| Record | Check | Status |
|--------|-------|--------|
| SPF | `v=spf1 ... include:<provider>` present in `TXT @` | Pass / Fail / Unknown |
| DKIM | `<selector>._domainkey.<domain>` `TXT` resolves | Pass / Fail / Unknown |
| DMARC | `_dmarc.<domain>` `TXT` resolves with `v=DMARC1` | Pass / Fail / Unknown |
| MX | domain has at least one MX record (receiving, not sending, but shows domain is configured) | Pass / Fail |

The checklist is informational — it does not block the SMTP config save. Required DNS values are provider-specific and shown as instructional copy copied from the provider's docs (Resend, Postmark, etc.).

### 6.3 SMTP_FROM alignment rule

The `vibe-wp-smtp.php` MU plugin sets `wp_mail_from` to `SMTP_FROM`. The transactional provider signs outbound mail with a DKIM key for the domain in `SMTP_FROM`. If the owner sets `SMTP_FROM=noreply@example.com`, they must add the provider's DKIM DNS record for `example.com`. The panel's checklist checks this domain specifically.

---

## 7. UI Surface

### 7.1 Mail settings card

Location: Control panel → Settings → Mail (new card, below Notifications)

Card sections:

**Mail mode selector** (radio/segmented control):
- `Off` — suppress all outbound mail (current default; safe for sites not yet configured)
- `Relay` — forward through SMTP relay
- `Log` — capture to Maildir for debugging (advanced)

**SMTP relay configuration** (visible only when mode = Relay):

| Field | Input | Notes |
|-------|-------|-------|
| Host | text | e.g. `smtp.resend.com` |
| Port | number | default 587 |
| Username | text | provider API key or username |
| Password | password | write-only; shows `●●●●● (saved)` when hasPassword=true |
| From address | email | e.g. `noreply@example.com` — must match DKIM domain |
| From name | text | e.g. `My Site` |
| TLS | toggle | default on |
| Auth | toggle | default on |

**Scope selector** (global vs per-site):
- Global config applies to all sites on the VPS (host-level shared relay).
- Per-site config overrides the global for that site only.
- Same UX as the existing Backup and Notifications cards.

**Action buttons:**
- Save — calls `smtpConfigSet`; shows spinner + success/error toast.
- Send test email — modal prompt for test recipient address → calls `smtpTest`; shows redacted transcript in a code block.

**Deliverability checklist** (expandable):
- Shows SPF / DKIM / DMARC status for the `From address` domain.
- Links to provider setup docs.
- Warning banner when mode = Relay and `WP_ENVIRONMENT_TYPE=staging` (§3.12).

### 7.2 Staging-site warning

When `SMTP_MODE=relay` is active on a staging site and `VIBE_WP_DISABLE_OUTBOUND_MAIL` is not explicitly `0`, the card shows:

> "Mail relay is enabled, but staging guard is suppressing outbound mail. Set `VIBE_WP_DISABLE_OUTBOUND_MAIL=0` in the staging env to allow test sends from staging."

---

## 8. Scope / Out of Scope

### In scope

- `msmtp` install in Dockerfile (both apt and apk paths).
- `sendmail_path` in `php.ini.template`.
- msmtprc template + entrypoint rendering.
- `vibe-wp-smtp.php` MU plugin (×2 locations).
- `bin/smtp-config-apply` and `bin/smtp-test` shell ops.
- `VIBE_OPS` entries + `vibe-panel-run` allowlist additions.
- `smtp-config.ts` core-bridge module + SQLite schema table `smtp_config`.
- `smtpConfigGet`, `smtpConfigSet`, `smtpTest` procedures in `settings.ts`.
- Panel Mail card UI.
- Deliverability DNS checklist (passive, informational).
- `env/prod.env.example` additions for `SMTP_*` vars.

### Out of scope (explicit)

- Bundled host-level Postfix container (Option B, §4.3) — deferred.
- Provider-specific OAuth integrations (Resend API key management, SES IAM) — generic SMTP only in v1.
- Inbound mail / catch-all / mailbox management — not a WordPress hosting concern.
- DKIM signing at the stack level (delegated to the transactional provider).
- Per-recipient suppression lists — provider's responsibility.
- Bounce handling / webhook — provider's responsibility.
- WooCommerce transactional email templating — stays in WP plugins.
- `log` mode Maildir viewer in the panel — UI deferred; the log file is accessible via SSH.
- Automated PTR record setup — requires VPS provider API integration out of scope.

---

## 9. Phased Build Outline

All phases follow the "TDD → VPS validate → panel surface" pattern.

### Phase 1 — Image-level (no panel, no UI)

1. Add `msmtp` + `msmtp-mta` to Dockerfile (apt + apk paths). Build and confirm `/usr/bin/msmtp --version` exits 0.
2. Add `msmtprc.template` to `docker/wordpress/`.
3. Add `SMTP_MODE/HOST/PORT/USER/PASSWORD/FROM/FROM_NAME/TLS/AUTH` env defaults to `entrypoint.sh`.
4. Add `msmtprc` render block to `entrypoint.sh` (relay/log/off cases).
5. Add `PHP_SENDMAIL_PATH` default + `envsubst` variable + `php.ini.template` line.
6. Write `vibe-wp-smtp.php` MU plugin (×2 locations).
7. **Test (unit):** `bun test` on a mock that confirms `SMTP_FROM` filter registration.
8. **Test (VPS):** `make up ENV=prod`; set `SMTP_MODE=relay`, valid Resend credentials in `.env`; `wp eval 'wp_mail("test@example.com","test","body");'`; confirm delivery.

### Phase 2 — Shell ops

1. Write `bin/smtp-config-apply` (mirror `notify-config-apply`).
2. Write `bin/smtp-test`.
3. Add `smtp-config-apply` and `smtp-test` to `OP_ALLOWLIST` in `bin/vibe-panel-run`.
4. **Test (unit):** shell bats tests for `smtp-config-apply` — upsert, preserve-existing-password, atomic rename.
5. **Test (VPS):** `SMTP_MODE=relay SMTP_HOST=... SMTP_PASSWORD=... bin/vibe prod smtp-config-apply` → confirm `SMTP_*` in prod.env; `SMTP_TEST_TO=... bin/vibe prod smtp-test` → confirm delivery.

### Phase 3 — Core bridge + API

1. Write SQLite migration: `smtp_config` table (siteId PK, smtpMode, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, smtpFromName, smtpTls, smtpAuth; nullable columns).
2. Write `smtp-config-pure.ts` (merge logic, `toEnv()`, unit-testable).
3. Write `smtp-config.ts` (DB + runVibe wiring).
4. Add `smtpConfigGet`, `smtpConfigSet`, `smtpTest` to `settings.ts`.
5. Add `smtpConfigApply` + `smtpTest` to `VIBE_OPS` in `exec.ts`.
6. **Test (unit):** `bun test src/core-bridge/smtp-config-pure.test.ts` — merge logic, `toEnv()`, mask function.
7. **Test (integration):** API procedure unit tests with mocked `runVibe`.

### Phase 4 — Panel UI

1. Build Mail settings card component.
2. Wire `smtpConfigGet` on load; `smtpConfigSet` on save.
3. Wire `smtpTest` modal.
4. Add deliverability DNS checklist (passive DNS-over-HTTPS fetch, no new op needed).
5. Add staging guard warning.
6. **Test (VPS):** end-to-end via the panel: set credentials → Save → Send test → confirm delivery → check deliverability checklist reflects DNS state.

### Phase 5 — Env example + docs

1. Add `SMTP_*` block to `env/prod.env.example` (commented out, with explanatory comments).
2. Update installer planner to optionally prompt for SMTP config during initial install (low-priority, can be deferred).

---

## 10. Open Decisions for the Owner

These require an explicit choice before or during implementation. They do not block Phase 1–2 but must be resolved before Phase 3 (API) is merged.

### OD-1 — Shared relay default: steer to provider vs. bundled Postfix?

**Option A** (recommended in §4.4): Ship provider-managed SMTP only. The panel's Mail card asks the owner to supply SMTP credentials from Resend/Postmark/SES/Mailgun. No extra container.

**Option B**: Build a bundled Postfix null-client container as the default for the host-level relay, with the provider as the upstream smarthost. Sites point at `SMTP_HOST=postfix` internally.

**Recommendation:** Ship Option A. If the owner later wants Option B, it can be added as a compose overlay without changing the msmtp/php.ini/mu-plugin layer — those components are provider-agnostic.

**Decision needed by:** Before Phase 3 (the global config row's schema and the panel copy depend on this).

### OD-2 — Which providers to surface as "guided setup" in the UI?

The panel could offer:
1. **Generic SMTP** — just the host/port/user/password fields, no provider-specific guidance.
2. **Guided tiles** — a provider picker (Resend, Postmark, SES, Mailgun) with pre-filled host/port and a link to that provider's DKIM setup docs.

Option 2 is better UX but requires maintaining per-provider copy. Option 1 is minimal and correct.

**Recommendation:** Ship Option 1 (generic SMTP) in v1. Add provider tiles as a UI-only polish pass in a follow-on.

### OD-3 — `log` mode implementation

When `SMTP_MODE=log`, two approaches:
1. **`/usr/bin/msmtp --logfile` only** — configure a no-op msmtp account that logs but does not connect to any server. Simpler, uses the same binary.
2. **Tiny shell wrapper** (`vibe-wp-mail-log`) — captures stdin (the raw RFC 5322 message) and writes it to a Maildir. No external TCP connection at all. Better for debugging "what would have been sent."

Both work. Option 2 is more useful for debugging (full message body preserved). Option 1 reuses msmtp config rendering logic.

**Decision needed by:** Phase 1 (the entrypoint `log` case is a branch that must be filled in).

### OD-4 — Deliverability checklist: client-side DNS-over-HTTPS vs. new shell op?

Option A: Panel frontend fetches `https://cloudflare-dns.com/dns-query?name=<domain>&type=TXT` (DNS-over-HTTPS) directly from the browser. No new shell op, no VPS DNS dependency.

Option B: New read-only shell op (`smtp-dns-check`) that runs `dig +short TXT _dmarc.<domain>` etc. on the VPS. More accurate (uses VPS's resolver), but adds a new op surface to the allowlist.

**Recommendation:** Option A (client-side DNS-over-HTTPS). The VPS resolver may be misconfigured; the panel's browser context is the one the owner already uses to check DNS.

---

## 11. Testing & Validation

### Unit tests

| Test file | What it covers |
|-----------|---------------|
| `smtp-config-pure.test.ts` | `mergeSmtpConfig()` (global + per-site merge precedence), `toEnv()` (correct `SMTP_*` keys), `maskSmtpRow()` (password absent from output) |
| `smtp-config-apply.bats` | Upsert new key, replace existing key, preserve-existing-password (empty `SMTP_PASSWORD` in env does not blank the file), atomic rename, 0600 mode preserved |
| `vibe-wp-smtp.test.php` (or WP mock) | Filter registration when `SMTP_FROM` set; no filter registered when `SMTP_FROM` empty |

### Integration tests

- `smtpConfigSet` procedure: mock `runVibe`, assert `smtpConfigApply` called with `SMTP_PASSWORD` in env (not in argv), assert `smtpPassword` not in response.
- `smtpTest` procedure: mock `runVibe` returning a transcript containing a dummy password string; assert the response transcript does NOT contain the password.

### VPS validation (required before merge)

1. `make up ENV=prod` with `SMTP_MODE=off` → `wp eval 'var_dump(wp_mail(...));'` → must return false (suppressed by `VIBE_WP_DISABLE_OUTBOUND_MAIL=0` default is actually `off` mode → `/bin/true` as sendmail_path → PHP `mail()` returns false). Confirm no crash.
2. `make up ENV=prod` with `SMTP_MODE=relay` + valid Resend SMTP credentials → `wp eval 'wp_mail("owner@example.com","Test","Body");'` → confirm email delivered to inbox within 60 seconds.
3. Confirm `SMTP_PASSWORD` does not appear in `docker logs` output for the wordpress container.
4. Confirm `/etc/msmtprc` inside container is 0640 root:www-data and not world-readable.
5. Panel flow end-to-end: set credentials via panel → Save (no error) → Send test → transcript visible in panel → email received.
6. Confirm `smtpConfigGet` response contains `hasPassword: true` and no password value.

---

## 12. References

- `docker/wordpress/Dockerfile` — current package install pattern (apt + apk branches).
- `docker/wordpress/entrypoint.sh` — `envsubst` + config rendering pattern.
- `docker/wordpress/php.ini.template` — `sendmail_path` is currently absent (to add).
- `content/mu-plugins/vibe-wp-environment.php` and `docker/wordpress/mu-plugins/vibe-wp-environment.php` — the `pre_wp_mail` suppression hook (staging guard, mirrored ×2).
- `bin/notify-config-apply` — the exact atomic-rename env-file writer to mirror for `smtp-config-apply`.
- `control-panel/packages/api/src/core-bridge/notify-config.ts` — the DB + runVibe wiring pattern to mirror for `smtp-config.ts`.
- `control-panel/packages/api/src/core-bridge/exec.ts` — `VIBE_OPS` const, `runVibe()`, privilege boundary pattern.
- `bin/vibe-panel-run` — `OP_ALLOWLIST` and security validation; must be extended.
- `env/prod.env.example` — template for new `SMTP_*` additions.
- msmtp upstream: https://marlam.de/msmtp/
- Resend SMTP docs: https://resend.com/docs/send-with-smtp
- Postmark SMTP docs: https://postmarkapp.com/developer/user-guide/send-email-with-smtp
