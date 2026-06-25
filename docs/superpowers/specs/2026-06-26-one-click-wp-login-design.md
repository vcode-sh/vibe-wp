# One-click "Log in to WordPress" — design

**Goal:** From the control panel, an admin clicks "Log in as <user>" on a site's
Users card and lands in that user's `wp-admin` session in a new tab — no password
typed. Closes the last real gap vs Plesk WP-Toolkit (after Phase 1 user/password
management).

## Threat model + token design

A one-click login is a credential-minting operation, so the token is the whole
security surface. Design choices:

- **256-bit token, generated in the PANEL** (`crypto.randomBytes(32)` → 64 hex).
  The plaintext token never leaves the panel process except in the returned URL
  (HTTPS → browser). The host op only ever sees `sha256(token)`.
- **Hashed at rest, single-use, short TTL.** The op stores a WordPress transient
  `vibe_sso_<sha256(token)> = <user_id>` with a 60-second TTL. Redeem deletes it
  (single-use). A DB/transient leak yields only the hash — useless without the
  preimage. Brute force is infeasible (256-bit) within the 60s window.
- **Admin-tier only** (`user.loginLink` in WP_ACTION_TIERS). Same off-argv/off-log
  discipline as Phase 1: the (non-secret-but-sensitive) hash travels on STDIN, the
  user id on argv (numeric, validated). The plaintext token is never logged,
  never stored, never sent to the host.
- **Redeem is cache-safe + leaves no residue.** The redeem URL carries a query
  string (`?vibe_sso=…`), which the nginx FastCGI cache already bypasses, so it
  always hits PHP. The mu-plugin consumes the token, sets the auth cookie, and
  302-redirects to `admin_url()` — the token drops out of the address bar
  immediately. Lookup is by transient key (hash), so there is no comparison
  timing oracle. Resolution is strictly by numeric id (never a login wp-cli could
  reinterpret as an id/email — the Phase 1 lesson).

## Components

- **mu-plugin `vibe-wp-sso.php`** (image seed `docker/wordpress/mu-plugins/` +
  repo mirror `content/mu-plugins/`). Hooks `init` priority 1. On a request with
  `?vibe_sso=<64 hex>`: validate shape → `hash('sha256', $token)` →
  `get_transient('vibe_sso_'.$hash)` → `delete_transient` (single-use) →
  `get_user_by('id', $uid)` → `wp_set_current_user` + `wp_set_auth_cookie($uid,
  false)` → `wp_safe_redirect(admin_url())`. Any failure: generic redirect to
  `wp_login_url()` (no oracle on why).
- **`bin/vibe wp-login-link <id>`** — id on argv (digits), `sha256` hash on STDIN
  (64 hex, validated before use → safe to interpolate). Confirms the user id
  exists (`wp user get <id>` resolves by id), then `wp eval set_transient(...)`.
  Echoes a non-secret confirmation (login + id), never the token/hash.
- **`bin/vibe-panel-run`** — allowlist `wp-login-link`; one arg; `validate_wp_user_id`.
- **panel** — `VIBE_OPS.wpLoginLink` (argv `["wp-login-link"]`, `takesArg`, STDIN
  hash); `core-bridge/wp-users.ts` `mintLoginLink(siteId, userId): {url}` builds
  `https://<site.domain>/?vibe_sso=<token>`; router `wpLoginLink` adminProcedure;
  GUI per-row "Log in as" button on the Users card opens the URL in a new tab
  (opened synchronously on click to dodge popup blockers, then redirected).
- **`bin/panel sync_site_mu_plugins`** — on `panel update`, deliver the repo's
  `content/mu-plugins/vibe-wp-*.php` into each managed site's bind-mounted
  `content/mu-plugins/` (world-readable). Without it the mu-plugin would only
  reach newly-provisioned sites; this makes mu-plugin updates reach existing
  sites too (reusable for all platform mu-plugins, not just SSO).

## Validation

Adversarial refute-review of the token design + a VPS end-to-end: mint a link for
test1's `owner`, follow it in a fresh cookie jar → lands authenticated in
wp-admin; reuse the same token → rejected (single-use); wait >60s → rejected
(TTL); off-ps + off-journal scans for the token = 0; tampered/short token →
generic login redirect.
