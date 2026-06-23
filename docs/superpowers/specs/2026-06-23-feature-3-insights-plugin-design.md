# Feature #3 — Vibe WP Companion "Insights" Plugin: Design Spec

**Status:** Draft · **Effort:** M · **Date:** 2026-06-23
**Branch:** `control-panel-backend-install` (add `insights` work here or branch from it)

---

## 1. Context — the panel is blind to WordPress today

The control panel's only windows into each WordPress site are:

| Source | What it reads | Where |
|--------|--------------|-------|
| `bin/vibe-panel-run siteinfo` | 7 non-secret env fields (domain, ports, slug, staging flag) | `vibe-panel-run` lines 298-329 |
| `wpPluginUpdates` op | `wp plugin list --update=available --format=json` → integer count | `exec.ts` line 109-112; `updates.ts` |
| `wpCoreUpdate` / `wpPluginUpdateAll` | mutating ops, streaming | `exec.ts` lines 104-112 |
| `env` op (9 keys) | non-secret env values only | `vibe-panel-run` line 230 |

The `wp` sub-command is restricted at the root boundary to **exactly three forms** (`core update`, `plugin update --all`, `plugin list --update=available --format=json`) — this is enforced in `validate_wp_args` at lines 198-209 of `vibe-panel-run`. Everything else (plugin status, theme inventory, site health, PHP version, DB size, user counts, debug flags) is invisible.

Features #4 (plugin/update management), #5 (performance tuning), Extra C (security score), and Extra E (vulnerability radar) all need this data. This spec designs the plumbing that feeds them.

---

## 2. Decisions (settled)

### 2.1 Drop-file over REST (recommended)

Two architectures were evaluated:

**A. Drop-file** — the mu-plugin writes `wp-content/.vibe/insights.json` on a WP-cron hook. The panel reads it via a new `insights` op (a `cat`) through the existing `vibe-panel-run` boundary.

**B. Internal REST endpoint** — the mu-plugin registers `GET /wp-json/vibe/v1/insights`; the panel calls it over Docker's internal network (`http://nginx:8080`) using a per-site rotating secret in the Authorization header.

**Decision: Drop-file (A) is the default.** Rationale:

| Concern | Drop-file | REST variant |
|---------|-----------|-------------|
| Auth surface | None — same filesystem gate as all other ops | Per-site rotating secret must be generated, stored, rotated, checked |
| Exposure | File readable only via root-gated wrapper | Nginx port (even internal) is a new attack vector |
| Rate-limit DoS | Impossible — reads a file | Possible; requires throttle middleware |
| Freshness | Cron-driven (configurable cadence) + on-demand invalidation | On-demand, always current |
| Complexity | Minimal — atomic write + cat read | Token generation + constant-time compare + route registration |
| Alignment with existing patterns | Matches how `perf-report`, `security-status`, `monitor` work | New pattern requiring new infrastructure |

REST is documented below (§2.2) for completeness. It may be layered on top if sub-minute freshness is needed for a specific feature.

### 2.2 REST variant (optional / future)

If on-demand freshness is required, a `GET /wp-json/vibe/v1/insights` endpoint can be added alongside the drop-file:

- The mu-plugin calls `add_action('rest_api_init', ...)` and registers the route.
- Authentication: the endpoint reads `VIBE_INSIGHTS_TOKEN` from the environment (set at container build time via Docker env, one token per site, never in git). The request must include `Authorization: Bearer <token>`. Use `hash_equals()` (constant-time compare) — never `===`.
- The panel calls it via `http://nginx:8080` (Docker internal network, reusing the loopback pattern from `vibe-wp-loopback.php`). The `Host:` header is set to the public domain.
- A `VIBE_INSIGHTS_TOKEN` op would be added to `ENV_KEY_ALLOWLIST` in `vibe-panel-run` (currently 9 keys at line 230), and a new read-only `insights-rest` op would call `wp eval-file` to emit the token — but this requires expanding `validate_wp_args`, so it is **deferred**.
- Rate-limit: `wp_cache` on a short TTL to avoid hammering WP on every panel load.

**When to use REST:** only if the UI needs sub-cron freshness (e.g., a "Refresh now" button that must reflect an update just applied). Even then, the drop-file is still written as the durable record.

### 2.3 The mu-plugin-duplication hazard (load-bearing rule)

`CLAUDE.md` states: *"MU plugins are duplicated. `content/mu-plugins/vibe-wp-*.php` and `docker/wordpress/mu-plugins/vibe-wp-*.php` mirror each other. Edit both when changing one."*

This spec creates `vibe-wp-insights.php`. Any agent editing the file **must** update both:
- `content/mu-plugins/vibe-wp-insights.php` (host-mounted, live content)
- `docker/wordpress/mu-plugins/vibe-wp-insights.php` (image seed, rsync'd on first boot)

Failure to update both results in the image seed overwriting the live plugin on the next container rebuild.

---

## 3. The data contract

This is the load-bearing section. Everything in §4–9 is scaffolding around this shape.

### 3.1 `insights.json` — top-level shape

```jsonc
{
  "schema_version": 1,            // bump on breaking changes; panel rejects unknown versions
  "generated_at": "2026-06-23T14:02:00Z",  // ISO-8601 UTC; panel shows staleness warning if > 24h
  "site_url": "https://example.com",        // wp_get_home_url(); panel cross-checks vs siteinfo
  "wp_core": {
    "version": "6.8.0",
    "update_available": true,
    "new_version": "6.8.1"        // null when no update
  },
  "php_version": "8.3.6",         // PHP_VERSION constant
  "db": {
    "size_bytes": 52428800,       // SELECT SUM(data_length + index_length) from information_schema
    "engine": "MariaDB",          // via SELECT VERSION()
    "server_version": "11.4.2-MariaDB"
  },
  "plugins": [
    {
      "slug": "woocommerce",
      "name": "WooCommerce",
      "version": "9.1.2",
      "status": "active",         // "active" | "inactive" | "must-use" | "dropin"
      "update_available": true,
      "new_version": "9.2.0",     // null when no update
      "auto_update": true,        // null = WP default (not explicitly set)
      "plugin_uri": "https://woocommerce.com",
      "author": "Automattic",
      "network_active": false      // multisite
    }
  ],
  "themes": [
    {
      "slug": "twentytwentyfour",
      "name": "Twenty Twenty-Four",
      "version": "1.3",
      "status": "active",         // "active" | "parent" | "inactive"
      "update_available": false,
      "new_version": null,
      "auto_update": null
    }
  ],
  "users": {
    "count": 42,
    "admin_count": 2,
    "last_login": null            // null — not tracked by WP core; placeholder for future plugin
  },
  "site_health": {
    "collected_at": "2026-06-23T14:02:00Z",
    "critical": [
      {
        "label": "One or more required files are missing",
        "description": "...",     // stripped of HTML tags
        "test": "plugin_theme_auto_updates"  // WP internal test ID
      }
    ],
    "recommended": [
      {
        "label": "Your website does not use HTTPS",
        "description": "...",
        "test": "https_status"
      }
    ]
  },
  "signals": {
    "xmlrpc_enabled": false,
    "file_edit_enabled": false,   // DISALLOW_FILE_EDIT constant
    "debug_on": false,            // WP_DEBUG
    "debug_log_on": false,        // WP_DEBUG_LOG
    "debug_display_on": false,    // WP_DEBUG_DISPLAY
    "script_debug_on": false,     // SCRIPT_DEBUG
    "auto_update_core": "minor",  // "minor" | "major" | "off" — WP_AUTO_UPDATE_CORE
    "cron_disabled": false        // DISABLE_WP_CRON
  },
  "object_cache": {
    "enabled": true,
    "type": "redis",              // "redis" | "memcached" | "apcu" | "none"
    "dropin_present": true        // wp-content/object-cache.php exists
  },
  "fastcgi_cache": {
    "enabled": true               // detected via X-Cache header or NGINX_FASTCGI_CACHE env
  },
  "_vuln_join_keys": {
    // These are the join handles the panel uses to cross-reference the vuln feed.
    // The panel NEVER trusts this block for authorization — display only.
    "plugins": [
      { "slug": "woocommerce", "version": "9.1.2" }
    ],
    "themes": [
      { "slug": "twentytwentyfour", "version": "1.3" }
    ],
    "wp_core": { "version": "6.8.0" }
  }
}
```

**Size contract:** the mu-plugin caps the file at 512 KB before writing. The panel parser rejects files > 512 KB (defense-in-depth against a poisoned large payload).

### 3.2 Zod schema (TypeScript, panel-side)

```typescript
// control-panel/packages/api/src/core-bridge/parse-insights.ts

import { z } from "zod";

const UpdateableItem = z.object({
  slug: z.string().max(200),
  name: z.string().max(500),
  version: z.string().max(50),
  update_available: z.boolean(),
  new_version: z.string().max(50).nullable(),
  auto_update: z.boolean().nullable(),
});

const PluginRecord = UpdateableItem.extend({
  status: z.enum(["active", "inactive", "must-use", "dropin"]),
  plugin_uri: z.string().url().optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  network_active: z.boolean().optional(),
});

const ThemeRecord = UpdateableItem.extend({
  status: z.enum(["active", "parent", "inactive"]),
});

const HealthIssue = z.object({
  label: z.string().max(500),
  description: z.string().max(2000),
  test: z.string().max(200),
});

const InsightsSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  site_url: z.string().url().max(500),
  wp_core: z.object({
    version: z.string().max(20),
    update_available: z.boolean(),
    new_version: z.string().max(20).nullable(),
  }),
  php_version: z.string().max(30),
  db: z.object({
    size_bytes: z.number().int().nonnegative(),
    engine: z.string().max(50),
    server_version: z.string().max(100),
  }),
  plugins: z.array(PluginRecord).max(500),
  themes: z.array(ThemeRecord).max(100),
  users: z.object({
    count: z.number().int().nonnegative(),
    admin_count: z.number().int().nonnegative(),
    last_login: z.string().datetime().nullable(),
  }),
  site_health: z.object({
    collected_at: z.string().datetime(),
    critical: z.array(HealthIssue).max(50),
    recommended: z.array(HealthIssue).max(100),
  }),
  signals: z.object({
    xmlrpc_enabled: z.boolean(),
    file_edit_enabled: z.boolean(),
    debug_on: z.boolean(),
    debug_log_on: z.boolean(),
    debug_display_on: z.boolean(),
    script_debug_on: z.boolean(),
    auto_update_core: z.enum(["minor", "major", "off"]),
    cron_disabled: z.boolean(),
  }),
  object_cache: z.object({
    enabled: z.boolean(),
    type: z.enum(["redis", "memcached", "apcu", "none"]),
    dropin_present: z.boolean(),
  }),
  fastcgi_cache: z.object({
    enabled: z.boolean(),
  }),
  _vuln_join_keys: z.object({
    plugins: z.array(z.object({
      slug: z.string().max(200),
      version: z.string().max(50),
    })).max(500),
    themes: z.array(z.object({
      slug: z.string().max(200),
      version: z.string().max(50),
    })).max(100),
    wp_core: z.object({ version: z.string().max(20) }),
  }),
});

export type Insights = z.infer<typeof InsightsSchema>;

export function parseInsights(raw: unknown): Insights {
  return InsightsSchema.parse(raw);
}
```

**Schema versioning:** when a breaking field is added, bump `schema_version` to `2` and add `z.union([z.literal(1), z.literal(2)])` with a discriminated branch. The panel must degrade gracefully (show stale data + "upgrade plugin" nudge) when it encounters an unknown version rather than crashing.

---

## 4. Architecture & components

### 4.1 The mu-plugin (`vibe-wp-insights.php`)

**Files (both must be kept in sync):**
- `content/mu-plugins/vibe-wp-insights.php`
- `docker/wordpress/mu-plugins/vibe-wp-insights.php`

**Structure:**

```
vibe_insights_collect()          // main collector; returns array
  vibe_insights_wp_core()        // wp_version + update_available
  vibe_insights_php()            // PHP_VERSION
  vibe_insights_db()             // DB size + version via $wpdb
  vibe_insights_plugins()        // get_plugins() + plugin_updates + auto_update option
  vibe_insights_themes()         // wp_get_themes() + theme updates + auto_update option
  vibe_insights_users()          // count_users() + WP_User_Query for admins
  vibe_insights_site_health()    // WP_Site_Health::get_instance()->get_test_results()
  vibe_insights_signals()        // constants + options
  vibe_insights_object_cache()   // wp_using_ext_object_cache() + dropin check
  vibe_insights_fastcgi_cache()  // NGINX_FASTCGI_CACHE env or X-Cache probe

vibe_insights_write()            // atomic write: encode → size-cap → temp file → rename
vibe_insights_output_dir()       // wp-content/.vibe/ (creates with mkdir 0750 if absent)
vibe_insights_output_path()      // wp-content/.vibe/insights.json

add_action('vibe_insights_collect_cron', 'vibe_insights_write')
add_action('wp_loaded', 'vibe_insights_schedule_cron')  // register if not scheduled
add_action('rest_api_init', 'vibe_insights_register_rest')  // optional REST variant
```

**Atomic write pattern:**

```php
function vibe_insights_write(): void {
    $data   = vibe_insights_collect();
    $json   = wp_json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > 512 * 1024) {
        // Truncate plugins/themes arrays to fit; log a warning
        // … truncation logic …
    }
    $dir    = vibe_insights_output_dir();
    $target = $dir . '/insights.json';
    $tmp    = $dir . '/.insights.tmp.' . getmypid();
    file_put_contents($tmp, $json, LOCK_EX);
    chmod($tmp, 0640);
    rename($tmp, $target);  // atomic on Linux (same filesystem)
}
```

**Cron registration:**

```php
add_filter('cron_schedules', function($schedules) {
    $schedules['vibe_15min'] = ['interval' => 900, 'display' => 'Every 15 minutes'];
    return $schedules;
});
// Registered once; removed on plugin deactivation (though mu-plugins can't be deactivated —
// use a define constant VIBE_INSIGHTS_DISABLED to skip collection).
```

**Line-count discipline:** WP collector functions are verbose. Split into:
- `vibe-wp-insights.php` — registration + write (≤120 lines)
- `vibe-wp-insights-collect.php` — all `vibe_insights_*` collector functions (≤220 lines, the per-file limit)
- `vibe-wp-insights-rest.php` — optional REST route + auth (≤80 lines)

Both source files must be mirrored in both mu-plugin directories.

### 4.2 New `insights` vibe op

**`bin/vibe`** — add case:

```sh
insights)
  # Read-only: cat the drop-file. No WP process needed.
  file="${VIBE_CONTENT_DIR:-content}/wp-content/.vibe/insights.json"
  [ -f "$file" ] || { echo '{"error":"not_found"}'; exit 1; }
  cat "$file"
  ;;
```

`VIBE_CONTENT_DIR` defaults to `content/` (the host-mounted volume). The path resolves relative to the site's `$SITE_DIR`.

**`vibe-panel-run`** — add `insights` to `OP_ALLOWLIST` (line 155). It takes no arguments, so `validate_arg` loop runs over an empty set. Add alongside other read-only ops (`smoke`, `doctor-runtime`, etc.).

**`exec.ts` `VIBE_OPS`** — add:

```typescript
insights: { argv: ["insights"], stream: false },
```

### 4.3 Panel-side parser + router

**`control-panel/packages/api/src/core-bridge/parse-insights.ts`** — new file with the Zod schema from §3.2 and `parseInsights(raw)`.

**`control-panel/packages/api/src/routers/insights.ts`** — new tRPC router:

```typescript
export const insightsRouter = router({
  get: protectedProcedure
    .input(z.object({ siteId: z.string() }))
    .query(async ({ input, ctx }) => {
      const site = await getSite(ctx.db, input.siteId);
      const { stdout, code } = await runVibe(site.installDir, "prod", "insights", {
        timeoutMs: 10_000,
      });
      if (code !== 0) return null;  // file absent = not yet collected
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        return null;
      }
      return parseInsights(parsed);  // throws ZodError on bad shape → 400
    }),

  refresh: operatorProcedure
    .input(z.object({ siteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const site = await getSite(ctx.db, input.siteId);
      // Trigger WP-CLI to run the cron event immediately (uses existing wpCLI surface
      // only after validate_wp_args is extended — see §10.1).
      // Alternative: add a new `insights-refresh` op that runs
      // `wp eval 'vibe_insights_write();'` via a dedicated wp eval-file wrapper.
      // Deferred until §10 decision is made.
      void site; void ctx;
      return { queued: true };
    }),
});
```

### 4.4 Inventory + Health UI page

New panel page: **"Inventory"** (under each site's nav). See §7 for wireframe. Consumes `insightsRouter.get`.

### 4.5 Cross-cutting rule

Insights data is **untrusted display input**. It MUST NOT be used to:
- authorize any action (use `protectedProcedure` / `operatorProcedure` independently)
- make security decisions (use the real host state via other ops)
- drive automatic mutations (all mutations require explicit user action in #4)

---

## 5. The vulnerability / EOL feed

### 5.1 Design principle: no per-site outbound from WordPress

WordPress must not phone home to any vuln feed. Reasons:
1. Exfil surface: a vuln feed request leaks the exact plugin+version inventory to a third party.
2. Rate limits: 100 sites × N plugins × cron cadence = noisy traffic.
3. Consistency: the panel already runs on the host and can aggregate.

### 5.2 Feed options

| Feed | Format | License | Update cadence | Notes |
|------|--------|---------|----------------|-------|
| **WPScan Vulnerability Database** | JSON REST API (api.wpscan.com) | Free tier (25 req/day); paid tier for CI | Daily+ | Best coverage; requires API key; `slug` + `version` lookup |
| **Patchstack Open** | PSVD JSON export (GitHub) | Open-source | Daily | No API key; bulk download; lower coverage than WPScan |
| **wordpress.org plugin API** | REST (`api.wordpress.org/plugins/info/1.2/?action=plugin_information`) | Public | Near-real-time | Covers abandoned/closed plugins; no vuln details |
| **WPVulnDB / Wordfence Intel** | REST + bulk export | Commercial | Real-time | Enterprise pricing |

**Recommendation for Phase 1:** Patchstack Open PSVD (no API key, bulk JSON, mirror to Cloudflare KV or a local file). For Phase 2, add WPScan API behind a server-side proxy (the panel makes one request per refresh, not per site).

### 5.3 Join logic (panel-side)

```typescript
// Pseudo-code; runs in the tRPC insights.get resolver or a derived query
function joinVulns(insights: Insights, feed: VulnFeed): EnrichedPlugin[] {
  return insights.plugins.map(plugin => ({
    ...plugin,
    vulns: feed.lookupPlugin(plugin.slug, plugin.version),
    is_abandoned: feed.isAbandoned(plugin.slug),
    eol_php: feed.isEolPhp(insights.php_version),
  }));
}
```

The feed is fetched and cached **host-side** (panel server), refreshed on a separate daily cron. It is never passed through `bin/vibe` or the mu-plugin.

### 5.4 DB schema for vuln cache

Add to `control-panel/packages/db/src/schema/` a new `vulnCache.ts`:

```typescript
export const vulnCache = sqliteTable("vuln_cache", {
  id: text("id").primaryKey(),          // "plugin:<slug>" | "theme:<slug>" | "wp:<version>"
  data: text("data").notNull(),          // JSON blob from the feed
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  source: text("source").notNull(),      // "patchstack" | "wpscan" | "wporg"
});
```

---

## 6. Security model

### 6.1 Untrusted-data discipline

The insights file is written by PHP running inside the WordPress container. A compromised plugin or theme could write arbitrary JSON to `wp-content/.vibe/insights.json`. Therefore:

1. **Strict Zod parse on every read** — `parseInsights()` is not optional; skip it and you accept arbitrary data into the panel UI.
2. **Size cap enforced in two places** — mu-plugin caps at 512 KB before writing; panel rejects > 512 KB before parsing (defense-in-depth).
3. **Insights NEVER used for authorization** — e.g., `signals.file_edit_enabled = false` is informational only; the panel does not skip the `harden` confirmation based on it.
4. **Vuln data is display-only** — showing a "vulnerable" badge does not automatically trigger an update; the operator must explicitly invoke #4's update flow.
5. **No secret data in the file** — the mu-plugin MUST NOT write DB credentials, WP salts, R2 keys, or any value from `wp-config.php` constants other than the explicitly listed signals.

### 6.2 File permissions

```
wp-content/.vibe/          — directory, 0750, owned by www-data (WP container user)
wp-content/.vibe/insights.json  — 0640, owned by www-data
```

The panel reads via `bin/vibe insights` → `vibe-panel-run` → root-owned boundary → `cat`. The `vibe-panel` user never touches the file directly.

### 6.3 REST variant security (if used)

- `VIBE_INSIGHTS_TOKEN` — 32-byte random hex, generated at install time, stored in site env file (0600), passed to the container as an env var. Never committed.
- `hash_equals()` for comparison (prevents timing oracle).
- Only reachable via Docker internal network (`nginx:8080`); the nginx config MUST block `/wp-json/vibe/` on the public interface (add to `docker/nginx/conf.d/vibe.conf.template`).
- A compromised panel server can read the token via the `env` op — but it is restricted to the non-secret allowlist (line 230 of `vibe-panel-run`). Adding `VIBE_INSIGHTS_TOKEN` to that allowlist would be a security regression; use the drop-file instead.

### 6.4 The mu-plugin-duplication hazard (enforcement)

Add a test in the panel's test suite that asserts `md5(content/mu-plugins/vibe-wp-insights.php) === md5(docker/wordpress/mu-plugins/vibe-wp-insights.php)`. This catches the "edited one, forgot the other" failure at CI time.

---

## 7. UI surface

### 7.1 "Inventory" page (per-site nav tab)

```
┌─────────────────────────────────────────────────────┐
│  Site: example.com   [Inventory]                     │
├─────────────────────────────────────────────────────┤
│  WordPress 6.8.0  ⚠ Update to 6.8.1                 │
│  PHP 8.3.6  ·  MariaDB 11.4.2  ·  DB: 50 MB         │
│  Last collected: 2 minutes ago  [↻ Refresh]          │
├──────────────┬──────────────────────────────────────┤
│  PLUGINS (8) │  THEMES (3)                          │
│  3 updates   │  0 updates                           │
│  1 vuln ⚠    │                                      │
├──────────────┴──────────────────────────────────────┤
│  ● WooCommerce 9.1.2  →9.2.0  [Update]  ⚠ CVE-…    │
│  ● Yoast SEO 23.0    up to date  ✓                  │
│  … paginated list …                                  │
├─────────────────────────────────────────────────────┤
│  SITE HEALTH                                         │
│  ● Critical (1): One or more required files missing  │
│  ○ Recommended (4): HTTPS, auto-updates, …          │
└─────────────────────────────────────────────────────┘
```

- "Update" buttons are owned by Feature #4 (this page shows them, but #4 wires them).
- Vuln badges (⚠ CVE) are joined from the host-side feed (§5.3).
- "Refresh" calls `insightsRouter.refresh` (§4.3), then re-polls `insightsRouter.get` until `generated_at` advances.

### 7.2 Security score widget (Extra C)

A collapsible card on the Inventory page or the site overview:

```
Security posture: 74/100  (Good)
━━━━━━━━━━━━━━━░░░░░░
● XMLRPC disabled            ✓
● File editor disabled       ✓
● Debug logging off          ✓
● No critical health issues  ✓
● 1 vulnerable plugin        ✗  → See WooCommerce
```

Score algorithm lives in the panel (not the plugin) so it can evolve without a WP deploy.

---

## 8. Scope / out-of-scope for Feature #3

**In scope (Feature #3):**
- `vibe-wp-insights.php` + `vibe-wp-insights-collect.php` (mu-plugin, ×2 mirrors)
- `wp-content/.vibe/insights.json` format + version contract
- `insights` op in `bin/vibe`, `vibe-panel-run`, `exec.ts`, `VIBE_OPS`
- `parse-insights.ts` (Zod schema + parser)
- `routers/insights.ts` (read-only `get` procedure)
- Inventory + Health UI page (read-only view)
- Vuln feed cache schema + daily fetch job
- Tests (§11)

**Out of scope (Feature #3 — owned by downstream features):**
- One-click plugin updates / bulk updates → **Feature #4**
- Auto-update toggle per plugin → **Feature #4**
- Performance tuning actions (object cache config, FastCGI cache config) → **Feature #5**
- Security hardening actions → **Extra C** / `harden` op (already exists)
- Vulnerability remediation → **Extra E**
- `insightsRouter.refresh` (on-demand WP-cron trigger) — deferred pending §10.1 decision

---

## 9. Phased build outline

### Phase 1 — Collector + drop-file (VPS-validated)

1. Write `vibe-wp-insights.php` + `vibe-wp-insights-collect.php` (mirrored ×2).
2. Add `insights` op to `bin/vibe`, `OP_ALLOWLIST` in `vibe-panel-run`, and `VIBE_OPS` in `exec.ts`.
3. Write `parse-insights.ts` Zod schema + unit tests (mock JSON fixtures).
4. Write `parseInsights()` integration test: feed bad JSON, oversized JSON, wrong `schema_version` — all must throw.
5. VPS smoke test: SSH in, trigger cron manually (`wp cron event run vibe_insights_collect_cron`), `cat wp-content/.vibe/insights.json`, pipe through the Zod schema.

### Phase 2 — tRPC router + panel wiring

1. Add `routers/insights.ts` (`get` procedure).
2. Wire into the app router + add to panel sidebar nav.
3. Add `Inventory` page (React component) with plugin/theme table + site health section.
4. Unit test: `insightsRouter.get` with a mocked `runVibe` that returns fixture JSON.
5. VPS test: open panel, navigate to Inventory, verify data matches `cat` output.

### Phase 3 — Vuln feed

1. Add `vulnCache` DB schema + migration.
2. Add daily Patchstack feed fetch (panel-side cron, similar to `monitorScheduleApply`).
3. Add join logic in `insightsRouter.get`.
4. Add vuln badge UI to Inventory page.
5. Unit test: feed mock with a known CVE, assert badge renders.

### Phase 4 — Security score widget (Extra C hooks in here)

1. Implement score algorithm in panel (no WP changes).
2. Wire score to Inventory page sidebar / site overview card.

---

## 10. Open decisions for the owner

### 10.1 On-demand refresh: extend `validate_wp_args` or add a dedicated op?

The `insightsRouter.refresh` mutation needs to trigger WP-cron immediately. Two paths:

**A.** Extend `validate_wp_args` in `vibe-panel-run` to also allow `wp cron event run vibe_insights_collect_cron` — expands the validated WP surface at the root boundary.

**B.** Add a new `insights-refresh` shell op in `bin/vibe` that runs `wp eval-file /opt/vibe/insights-trigger.php` (a minimal fixed script) — avoids expanding `validate_wp_args` but requires managing the trigger script file and adding `insights-refresh` to `OP_ALLOWLIST`.

**C.** Skip on-demand refresh entirely; accept 15-minute staleness; add a "Collected N min ago" label. Simplest.

**Recommendation:** Start with C; add A if users report staleness is a pain point.

### 10.2 Cron cadence

Default proposed: every 15 minutes (`vibe_15min` schedule). Trade-offs:

- 15 min: fresh enough for the panel; `WP_Site_Health` tests take ~2s on each run.
- 5 min: more overhead; `WP_Site_Health::get_test_results()` is expensive (runs loopback HTTP tests).
- 1 hour: very low overhead; stale for active sites.

**Question for the owner:** Is 15-minute staleness acceptable, or should `site_health` be collected less frequently than the rest (e.g., full refresh every 15 min, health re-run only hourly)?

### 10.3 Which vuln feed?

| Option | Cost | Coverage | Operational complexity |
|--------|------|----------|----------------------|
| Patchstack Open | Free | Good (PSVD) | Mirror to Cloudflare KV or local file; update daily via panel cron |
| WPScan API | Free tier: 25 req/day | Excellent | API key required; 1 lookup per site per day hits limit quickly at scale |
| WPScan API (paid) | ~$30/mo | Excellent | API key + billing; easiest at scale |
| wordpress.org | Free | Closed/abandoned plugin detection only; no CVE details | None |

**Recommendation:** Start with Patchstack Open (free, bulk JSON, no rate limit). Add WPScan API key as an optional upgrade in the panel settings.

### 10.4 Drop-file vs REST as the long-term default

The spec recommends the drop-file permanently. Confirm this is acceptable even if a future feature (e.g., a "live" dashboard with <1min refresh) is planned. If real-time is on the roadmap, the REST variant should be built in Phase 2 rather than bolted on later.

### 10.5 `_vuln_join_keys` in the drop-file

The `_vuln_join_keys` block duplicates slug+version data already in `plugins[]` and `themes[]`. It exists to make the join fast without re-scanning the arrays. Is the duplication acceptable, or should the panel build the join keys from `plugins[]` directly and drop the redundant block?

**Recommendation:** Drop `_vuln_join_keys` and build keys from `plugins[]` in the panel. Simpler contract.

---

## 11. Testing & validation

### Unit tests (`control-panel/packages/api/src/`)

| Test | File | Assertion |
|------|------|-----------|
| Valid fixture parses | `parse-insights.test.ts` | `parseInsights(fixture)` returns typed object |
| Wrong `schema_version` throws | `parse-insights.test.ts` | `ZodError` |
| Oversized JSON rejected | `parse-insights.test.ts` | Error before Zod parse |
| Malicious string in `name` field | `parse-insights.test.ts` | Parses OK (XSS is a UI concern, not schema) |
| `insightsRouter.get` returns null on missing file | `routers/insights.test.ts` | `runVibe` mock returns exit code 1 |
| `insightsRouter.get` parses and returns | `routers/insights.test.ts` | Fixture JSON → typed response |
| `insightsRouter.get` rejects oversized | `routers/insights.test.ts` | Returns 400 |

### PHP unit tests (future)

- `vibe_insights_collect()` returns array matching expected schema shape (mock `$wpdb`, `get_plugins()`, etc.)
- `vibe_insights_write()` creates file at expected path with 0640 permissions
- Atomic write: old file present → no window where file is absent

### Integration / VPS validation (checklist)

```sh
# 1. Deploy mu-plugin (rebuild container or rsync to content/mu-plugins/)
# 2. Trigger cron manually
wp --path=/var/www/html cron event run vibe_insights_collect_cron
# 3. Confirm file exists and is valid
ls -la /var/www/html/wp-content/.vibe/insights.json
cat /var/www/html/wp-content/.vibe/insights.json | jq '.schema_version'
# 4. Confirm panel op works
sudo -n vibe-panel-run vibe /opt/mysite prod insights
# 5. Confirm oversized payload is rejected (create 600 KB test file)
# 6. Confirm schema_version mismatch is caught in panel logs
# 7. Confirm mirrored mu-plugin matches content/ copy
md5sum content/mu-plugins/vibe-wp-insights.php docker/wordpress/mu-plugins/vibe-wp-insights.php
```

---

## 12. References

- `content/mu-plugins/vibe-wp-loopback.php` — internal URL routing pattern (reused by REST variant)
- `content/mu-plugins/vibe-wp-environment.php` — mu-plugin structure + env-var reading pattern
- `content/mu-plugins/vibe-wp-redis.php` — mu-plugin structure, `add_action` at load time
- `docker/wordpress/mu-plugins/` — image-seed mirrors (must stay in sync)
- `control-panel/packages/api/src/core-bridge/exec.ts` — `VIBE_OPS` allowlist + `runVibe`
- `control-panel/packages/api/src/routers/updates.ts` — existing WP-reading procedures (3 forms)
- `control-panel/packages/api/src/core-bridge/parse.ts` — Zod-validated parser pattern to follow
- `bin/vibe-panel-run` — `validate_wp_args` (lines 198-209), `OP_ALLOWLIST` (line 155), `ENV_KEY_ALLOWLIST` (line 230)
- `bin/vibe` — op dispatch + `wp` and `compose` sub-commands
- `control-panel/packages/db/src/schema/` — existing Drizzle schema files (model for `vulnCache.ts`)
- Patchstack PSVD: https://github.com/patchstack/patchstack-security-vulnerability-database
- WPScan API: https://wpscan.com/api
- WP Site Health API: https://developer.wordpress.org/reference/classes/wp_site_health/
- `CLAUDE.md` — mu-plugin duplication rule, line-count limit (220 lines per file)
