# Feature #3: Companion "Insights" Plugin (data backbone) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the control panel a structured, strictly-validated view into each WordPress site — a mu-plugin writes `wp-content/.vibe/insights.json` (WP/PHP/DB versions, full plugin+theme inventory with versions+update+active state, Site Health, security signals, cache status) on WP-cron; the panel reads it via a new host-side `insights` op, parses it through a strict Zod schema, and renders a read-only **Inventory** page with a live **Refresh now**. This is the data backbone features #4 (plugin mgmt) and #5 (perf tuning) consume.

**Architecture:** A WordPress mu-plugin (`vibe-wp-insights.php`, mirrored ×2 per the repo rule) collects site facts on a 15-min WP-cron event and atomically writes a size-capped JSON drop-file to the host-mounted `wp-content/.vibe/`. The panel reads it with a read-only `insights` op (a host-side `cat` — the file is on the host mount, no container needed) and validates it with a strict Zod schema (untrusted-data discipline: a compromised plugin could write the file, so every read is parsed + size-capped, and insights NEVER authorize anything). Refresh triggers the collector via the existing in-container `wp` op, widened by exactly ONE exact-match form at the root boundary.

**Tech Stack:** PHP (WordPress mu-plugin, core APIs only — no new deps), POSIX `sh` (`bin/vibe`, `bin/vibe-panel-run`), Bun/Hono/oRPC + Zod (api), Drizzle/SQLite (none needed this scope), React/TanStack (web), Vitest.

## Global Constraints

Bind **every** task. From the spec (`docs/superpowers/specs/2026-06-23-feature-3-insights-plugin-design.md`) + the owner's locked decisions (2026-06-24) + the feature-#2 host-boundary lesson.

- **Scope (owner): data backbone only.** NO vuln feed, NO security-score widget, NO `_vuln_join_keys` block this pass (deferred to a focused follow-on with the external-feed decision). In scope: collector mu-plugin, drop-file, `insights` + `insightsRefresh` ops, Zod parser, Inventory read-only UI, live Refresh.
- **Live Refresh (owner).** A "Refresh now" triggers the collector via the existing `wp` op. Widen `validate_wp_args` by EXACTLY ONE exact-match form: `cron event run vibe_insights_collect_cron`. No new bin/vibe case for refresh (it reuses the existing `wp)` dispatch). No other wp surface.
- **Untrusted-data discipline (load-bearing).** The drop-file is written by PHP inside the WP container — treat it as untrusted. (1) Every read goes through `parseInsights()` (strict Zod) — never skip it. (2) Size cap enforced in BOTH places: mu-plugin caps at 512 KB before writing; panel rejects > 512 KB before `JSON.parse`. (3) Insights NEVER authorize an action or drive a mutation — display only. (4) The mu-plugin MUST NOT write any secret (DB creds, WP salts, R2 keys, wp-config constants beyond the listed signals).
- **mu-plugin ×2 mirror (CLAUDE.md rule).** `content/mu-plugins/vibe-wp-insights.php` AND `docker/wordpress/mu-plugins/vibe-wp-insights.php` must be **byte-identical**. A Vitest guard (`md5(a) === md5(b)`) enforces it at CI. Add `!content/mu-plugins/vibe-wp-insights.php` to `.gitignore` (the dir is allowlisted per-file; lines 31-34).
- **Host-boundary checklist (feature-#2 lesson — VPS-validate each).** (1) New `bin/vibe` dispatch case for `insights` (the read). (2) `insights` in `OP_ALLOWLIST`; the new wp form in `validate_wp_args`. (3) No secret injection → NO `panel_env_keep` change needed (confirm: the ops carry no `SMTP_*`-style env). (4) The `insights` read runs on the HOST (`cat` of the host-mounted file) — correct, the file is host-accessible; the refresh runs IN the container (existing `wp` op) — correct, wp-cli is container-only. (5) No render-at-start config → no recreate needed. (6) `redact()` still applies to the op output at the exec boundary; the file must contain no secrets by design.
- **File perms.** `wp-content/.vibe/` dir 0750, `insights.json` 0640, owned by www-data (the container user). Atomic write (temp + rename).
- **Schema versioning.** `schema_version: 1` literal. The panel rejects unknown versions (degrade gracefully — show "update the Insights plugin", not a crash).
- **Freshness UX.** The panel shows "collected N min ago"; if `generated_at` is > 24h old, show a staleness warning.
- **Mirror existing patterns.** Op = mirror the read-only `securityStatus`/`scheduleStatus` ops. Parser = mirror `parseSecurityStatus` (throw on malformed; the router maps missing-file→null). Router = mirror `updates.ts`. UI route + query + nav = mirror the `logs.tsx` per-site page + `app-sidebar.tsx` `SITE_LINKS`.
- **RBAC.** `siteInventory` (read) + `refreshInventory` (trigger) are `operatorProcedure` (read-only/low-risk; viewers excluded from the trigger). No admin gate needed (no secrets).
- **Tests.** api uses **Vitest**. Run `cd control-panel && bun run check-types && bun run check && bun run test` before considering an api/web task done. PHP validated via `php -l` + the VPS round.

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `content/mu-plugins/vibe-wp-insights.php` + `docker/wordpress/mu-plugins/vibe-wp-insights.php` | collector + atomic write + cron registration (byte-identical) | **New ×2** |
| `.gitignore` | allowlist the new tracked mu-plugin | Modify |
| `bin/vibe` | `insights)` case → `cat content/.vibe/insights.json` | Modify |
| `bin/vibe-panel-run` | `insights` in OP_ALLOWLIST + new wp form in `validate_wp_args` | Modify |
| `control-panel/packages/api/src/core-bridge/exec.ts` | `insights` + `insightsRefresh` in VIBE_OPS | Modify |
| `control-panel/packages/api/src/core-bridge/exec.test.ts` | VIBE_OPS key snapshot | Modify |
| `control-panel/packages/api/src/contract.ts` | `SiteInsights` + sub-types | Modify |
| `control-panel/packages/api/src/core-bridge/parse-insights.ts` | Zod schema + `parseInsights` (size cap) | **New** |
| `control-panel/packages/api/src/core-bridge/parse-insights.test.ts` | parser tests | **New** |
| `control-panel/packages/api/src/core-bridge/mu-plugin-mirror.test.ts` | md5 guard for the ×2 mirror | **New** |
| `control-panel/packages/api/src/routers/inventory.ts` | `siteInventory` + `refreshInventory` | **New** |
| `control-panel/packages/api/src/routers/index.ts` | register `inventoryRouter` | Modify |
| `control-panel/web/src/data/queries.ts` | `inventoryQuery` | Modify |
| `control-panel/web/src/routes/_auth/sites/$siteId/inventory.tsx` | Inventory page | **New** |
| `control-panel/web/src/components/app-sidebar.tsx` | "Inventory" nav entry | Modify |

---

## Task 1: The collector mu-plugin (×2 mirror) + gitignore + mirror guard

**Files:**
- Create: `content/mu-plugins/vibe-wp-insights.php` + `docker/wordpress/mu-plugins/vibe-wp-insights.php` (byte-identical)
- Modify: `.gitignore`
- Create: `control-panel/packages/api/src/core-bridge/mu-plugin-mirror.test.ts`

**Interfaces — Produces:** a WP-cron-driven collector that atomically writes `wp-content/.vibe/insights.json` matching the schema in Task 3 (`schema_version:1`).

- [ ] **Step 1: Write `vibe-wp-insights.php`** (the single source of truth — the mu-plugin is NOT under the installer's 220-line cap). Structure: header + `ABSPATH` guard + `declare(strict_types=1)`; a `VIBE_INSIGHTS_DISABLED` constant escape hatch; collector functions; atomic write; cron registration. Read `content/mu-plugins/vibe-wp-redis.php` for the idiomatic header/guard. Implement:

```php
<?php
/**
 * Plugin Name: Vibe WP Insights
 * Description: Collects a strict, non-secret site inventory to wp-content/.vibe/insights.json for the Vibe control panel.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
if (defined('VIBE_INSIGHTS_DISABLED') && VIBE_INSIGHTS_DISABLED) {
    return;
}

const VIBE_INSIGHTS_SCHEMA = 1;
const VIBE_INSIGHTS_MAX_BYTES = 524288; // 512 KB hard cap (mirrored panel-side)
const VIBE_INSIGHTS_HOOK = 'vibe_insights_collect_cron';

function vibe_insights_output_dir(): string {
    $dir = WP_CONTENT_DIR . '/.vibe';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @chmod($dir, 0750);
    }
    return $dir;
}

/** Assemble the inventory array. Every value is non-secret + display-only. */
function vibe_insights_collect(): array {
    return array(
        'schema_version' => VIBE_INSIGHTS_SCHEMA,
        'generated_at'   => gmdate('c'),
        'site_url'       => (string) home_url(),
        'wp_core'        => vibe_insights_wp_core(),
        'php_version'    => PHP_VERSION,
        'db'             => vibe_insights_db(),
        'plugins'        => vibe_insights_plugins(),
        'themes'         => vibe_insights_themes(),
        'users'          => vibe_insights_users(),
        'site_health'    => vibe_insights_site_health(),
        'signals'        => vibe_insights_signals(),
        'object_cache'   => vibe_insights_object_cache(),
        'fastcgi_cache'  => vibe_insights_fastcgi_cache(),
    );
}
```

  Then implement each collector with these exact WP sources (defensive — wrap risky ones in try/catch or function_exists; never let one failing collector abort the write):
  - `vibe_insights_wp_core()` → `['version' => get_bloginfo('version'), 'update_available' => bool, 'new_version' => string|null]`. Use `get_core_updates()` (load `wp-admin/includes/update.php`); `update_available` = there is an update with `response === 'upgrade'`.
  - `vibe_insights_db()` → `['size_bytes' => int, 'engine' => 'MariaDB'|'MySQL', 'server_version' => $wpdb->db_version()-derived]`. Size via `$wpdb->get_var("SELECT SUM(data_length + index_length) FROM information_schema.TABLES WHERE table_schema = DATABASE()")` (cast to int, default 0). Server version via `$wpdb->get_var('SELECT VERSION()')`; engine = `MariaDB` if the string contains "MariaDB" else `MySQL`.
  - `vibe_insights_plugins()` → array of `['slug','name','version','status','update_available','new_version','auto_update']`. Load `wp-admin/includes/plugin.php`; `get_plugins()` (key = plugin file e.g. `woocommerce/woocommerce.php`); slug = `dirname(key)` (or basename without `.php` for single-file); status = `is_plugin_active(key) ? 'active' : 'inactive'` (use `'must-use'` for mu, `'dropin'` for dropins if you also include those — optional); updates via `get_plugin_updates()` (load `wp-admin/includes/update.php`); `auto_update` = `in_array(key, (array) get_option('auto_update_plugins', array()), true) ? true : null`.
  - `vibe_insights_themes()` → array of `['slug','name','version','status','update_available','new_version','auto_update']`. `wp_get_themes()`; active via `get_stylesheet()`/`get_template()` (status `active`/`parent`/`inactive`); updates via `get_theme_updates()`; `auto_update` from `get_option('auto_update_themes', array())`.
  - `vibe_insights_users()` → `['count' => int, 'admin_count' => int, 'last_login' => null]`. `count_users()` for total + `administrator` role count. `last_login` = `null` (not core-tracked).
  - `vibe_insights_site_health()` → `['collected_at' => gmdate('c'), 'critical' => [...], 'recommended' => [...]]`. Best-effort: load `wp-admin/includes/class-wp-site-health.php` + `update.php`; run ONLY the `direct` tests (`WP_Site_Health::get_instance()->get_tests()['direct']`), call each test callback, bucket by `status` (`critical` → critical, `recommended` → recommended), each item `['label','description'(strip_tags),'test']`. Wrap the whole thing in try/catch → default empty arrays on any failure (admin context isn't always available in cron). Cap critical ≤ 50, recommended ≤ 100.
  - `vibe_insights_signals()` → `['xmlrpc_enabled' => (bool) apply_filters('xmlrpc_enabled', true), 'file_edit_enabled' => !(defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT), 'debug_on' => (defined('WP_DEBUG') && WP_DEBUG), 'debug_log_on' => (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG), 'debug_display_on' => (defined('WP_DEBUG_DISPLAY') && WP_DEBUG_DISPLAY), 'script_debug_on' => (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG), 'auto_update_core' => (...'minor'|'major'|'off' from WP_AUTO_UPDATE_CORE constant: true→'minor', 'minor'→'minor', false→'off', otherwise 'major'), 'cron_disabled' => (defined('DISABLE_WP_CRON') && DISABLE_WP_CRON)]`.
  - `vibe_insights_object_cache()` → `['enabled' => wp_using_ext_object_cache(), 'type' => (file_exists(WP_CONTENT_DIR.'/object-cache.php') ? 'redis' : 'none'), 'dropin_present' => file_exists(WP_CONTENT_DIR.'/object-cache.php')]`. (Type detection is best-effort; "redis" is the stack default.)
  - `vibe_insights_fastcgi_cache()` → `['enabled' => in_array(strtolower((string) getenv('NGINX_FASTCGI_CACHE')), array('1','true','on','yes'), true)]`.

- [ ] **Step 2: Atomic write + cron registration** (verbatim):

```php
function vibe_insights_write(): void {
    try {
        $data = vibe_insights_collect();
        $json = wp_json_encode($data, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }
        if (strlen($json) > VIBE_INSIGHTS_MAX_BYTES) {
            // Drop the heaviest arrays to fit, then re-encode.
            $data['plugins'] = array();
            $data['themes']  = array();
            $data['site_health'] = array('collected_at' => gmdate('c'), 'critical' => array(), 'recommended' => array());
            $data['_truncated'] = true;
            $json = wp_json_encode($data, JSON_UNESCAPED_SLASHES);
            if ($json === false || strlen($json) > VIBE_INSIGHTS_MAX_BYTES) {
                return;
            }
        }
        $dir    = vibe_insights_output_dir();
        $target = $dir . '/insights.json';
        $tmp    = $dir . '/.insights.tmp.' . getmypid();
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            return;
        }
        @chmod($tmp, 0640);
        @rename($tmp, $target); // atomic on the same filesystem
    } catch (\Throwable $e) {
        // Never let collection break the site; the panel shows staleness instead.
    }
}

add_filter('cron_schedules', static function (array $s): array {
    $s['vibe_15min'] = array('interval' => 900, 'display' => 'Every 15 minutes (Vibe Insights)');
    return $s;
});

add_action(VIBE_INSIGHTS_HOOK, 'vibe_insights_write');

add_action('init', static function (): void {
    if (!wp_next_scheduled(VIBE_INSIGHTS_HOOK)) {
        wp_schedule_event(time() + 60, 'vibe_15min', VIBE_INSIGHTS_HOOK);
    }
});
```

- [ ] **Step 3: `php -l`** both files after creating; copy `content/...` to `docker/wordpress/...` byte-identically. `php -l content/mu-plugins/vibe-wp-insights.php` (and the docker copy) → "No syntax errors". `diff content/mu-plugins/vibe-wp-insights.php docker/wordpress/mu-plugins/vibe-wp-insights.php && echo identical`.

- [ ] **Step 4: gitignore allowlist** — add `!content/mu-plugins/vibe-wp-insights.php` after line 34 (the smtp entry).

- [ ] **Step 5: The mirror guard test** — `mu-plugin-mirror.test.ts` (Vitest), resolves the repo root and asserts the two copies are byte-identical (mirror how `env-keep-sync.test.ts` reads repo files via `fileURLToPath`/`resolve`):

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../.."); // -> /Users/.../vibe-wp (verify depth)
const md5 = (p: string) => createHash("md5").update(readFileSync(resolve(repoRoot, p))).digest("hex");

describe("mu-plugin mirror invariant", () => {
  it("vibe-wp-insights.php is byte-identical in both locations", () => {
    expect(md5("content/mu-plugins/vibe-wp-insights.php")).toBe(
      md5("docker/wordpress/mu-plugins/vibe-wp-insights.php")
    );
  });
});
```
Run `cd control-panel/packages/api && bunx vitest run src/core-bridge/mu-plugin-mirror.test.ts` → PASS (adjust `repoRoot` depth until the files resolve).

- [ ] **Step 6: Commit** — `git add content/mu-plugins/vibe-wp-insights.php docker/wordpress/mu-plugins/vibe-wp-insights.php .gitignore control-panel/packages/api/src/core-bridge/mu-plugin-mirror.test.ts && git commit -m "feat(insights): WP collector mu-plugin (x2 mirror) + drop-file + mirror guard"`

---

## Task 2: Host ops — `insights` (read) + `insightsRefresh` (trigger)

**Files:** Modify `bin/vibe`, `bin/vibe-panel-run`, `control-panel/packages/api/src/core-bridge/exec.ts`, `exec.test.ts`.

**Interfaces — Produces:** `runVibe(..., "insights")` → drop-file JSON on stdout (exit 1 if absent); `runVibe(..., "insightsRefresh")` → triggers the collector in-container.

- [ ] **Step 1: `bin/vibe` — add the `insights)` case.** Place it near the other read-only cases (e.g. after `schedule-status)` or `logs-recent)`). bin/vibe `cd`s to `VIBE_ROOT` (the site dir), so the host-mounted content path is `content/.vibe/insights.json`:

```sh
  insights)
    # Read-only: cat the host-mounted drop-file written by the WP collector.
    # No container needed — content/ is the host bind mount.
    if [ ! -f "content/.vibe/insights.json" ]; then
      echo '{"error":"not_collected"}' >&2
      exit 1
    fi
    cat "content/.vibe/insights.json"
    ;;
```

- [ ] **Step 2: `bin/vibe-panel-run` — allowlist.** (a) Add the token `insights` to the `OP_ALLOWLIST` string (line ~155) AND to the mirrored comment block listing the ops. (b) Add the 4th exact wp form to `validate_wp_args` (before the `*)` line):

```sh
    "cron event run vibe_insights_collect_cron") return 0 ;;
```
The `insights` op takes no args, so it correctly falls through to the default `validate_arg` loop (empty arg set). `sh -n bin/vibe-panel-run && echo ok`.

- [ ] **Step 3: `exec.ts` VIBE_OPS** — add after the existing wp ops:

```ts
		insights: { argv: ["insights"], stream: false },
		insightsRefresh: {
			argv: ["wp", "cron", "event", "run", "vibe_insights_collect_cron"],
			stream: false,
		},
```

- [ ] **Step 4: `exec.test.ts`** — if a test snapshots the sorted VIBE_OPS keys (the logs/smtp builds hit this), add `insights` + `insightsRefresh` to that list. Run `cd control-panel/packages/api && bunx vitest run src/core-bridge/exec.test.ts` → PASS.

- [ ] **Step 5: Verify** — `sh -n bin/vibe && sh -n bin/vibe-panel-run && echo "shell ok"`; `cd control-panel && bun run check-types | tail -1`.

- [ ] **Step 6: Commit** — `git add bin/vibe bin/vibe-panel-run control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts && git commit -m "feat(insights): insights (read) + insightsRefresh (trigger) host ops + boundary allowlist"`

---

## Task 3: Contract types + Zod parser (`parse-insights.ts`)

**Files:** Modify `contract.ts`; create `parse-insights.ts` + `parse-insights.test.ts`.

**Interfaces — Produces:** `SiteInsights` type; `parseInsights(stdout: string): SiteInsights` (size-cap + strict Zod; throws on malformed/oversized/unknown-version).

- [ ] **Step 1: Add `SiteInsights` + sub-types to `contract.ts`** mirroring the schema (camelCase TS surface is fine, but to avoid a mapping layer, keep the snake_case field names matching the JSON so the parser's `z.infer` IS the contract type). Export:

```ts
export interface InsightsPlugin {
	slug: string;
	name: string;
	version: string;
	status: "active" | "inactive" | "must-use" | "dropin";
	update_available: boolean;
	new_version: string | null;
	auto_update: boolean | null;
}
export interface InsightsTheme {
	slug: string;
	name: string;
	version: string;
	status: "active" | "parent" | "inactive";
	update_available: boolean;
	new_version: string | null;
	auto_update: boolean | null;
}
export interface InsightsHealthIssue { label: string; description: string; test: string; }
export interface SiteInsights {
	schema_version: 1;
	generated_at: string;
	site_url: string;
	wp_core: { version: string; update_available: boolean; new_version: string | null };
	php_version: string;
	db: { size_bytes: number; engine: string; server_version: string };
	plugins: InsightsPlugin[];
	themes: InsightsTheme[];
	users: { count: number; admin_count: number; last_login: string | null };
	site_health: { collected_at: string; critical: InsightsHealthIssue[]; recommended: InsightsHealthIssue[] };
	signals: {
		xmlrpc_enabled: boolean; file_edit_enabled: boolean; debug_on: boolean;
		debug_log_on: boolean; debug_display_on: boolean; script_debug_on: boolean;
		auto_update_core: "minor" | "major" | "off"; cron_disabled: boolean;
	};
	object_cache: { enabled: boolean; type: "redis" | "memcached" | "apcu" | "none"; dropin_present: boolean };
	fastcgi_cache: { enabled: boolean };
}
```

- [ ] **Step 2: Write the failing test** — `parse-insights.test.ts`. Include a full valid fixture (a const object), plus the failure cases:

```ts
import { describe, expect, it } from "vitest";
import { parseInsights } from "./parse-insights";

const VALID = JSON.stringify({
  schema_version: 1, generated_at: "2026-06-24T10:00:00Z", site_url: "https://x.test",
  wp_core: { version: "7.0", update_available: false, new_version: null }, php_version: "8.5.0",
  db: { size_bytes: 1024, engine: "MariaDB", server_version: "11.4.2-MariaDB" },
  plugins: [{ slug: "woo", name: "Woo", version: "9.1", status: "active", update_available: true, new_version: "9.2", auto_update: null }],
  themes: [{ slug: "tt4", name: "TT4", version: "1.3", status: "active", update_available: false, new_version: null, auto_update: null }],
  users: { count: 2, admin_count: 1, last_login: null },
  site_health: { collected_at: "2026-06-24T10:00:00Z", critical: [], recommended: [] },
  signals: { xmlrpc_enabled: false, file_edit_enabled: false, debug_on: false, debug_log_on: false, debug_display_on: false, script_debug_on: false, auto_update_core: "minor", cron_disabled: false },
  object_cache: { enabled: true, type: "redis", dropin_present: true },
  fastcgi_cache: { enabled: true },
});

describe("parseInsights", () => {
  it("parses a valid drop-file", () => {
    const r = parseInsights(VALID);
    expect(r.wp_core.version).toBe("7.0");
    expect(r.plugins[0]?.slug).toBe("woo");
  });
  it("throws on unknown schema_version", () =>
    expect(() => parseInsights(JSON.stringify({ ...JSON.parse(VALID), schema_version: 99 }))).toThrow());
  it("throws on malformed JSON", () => expect(() => parseInsights("{not json")).toThrow());
  it("throws on missing required field", () =>
    expect(() => parseInsights(JSON.stringify({ ...JSON.parse(VALID), plugins: undefined }))).toThrow());
  it("throws on oversized payload (>512KB) before parsing", () =>
    expect(() => parseInsights(" ".repeat(520 * 1024) + VALID)).toThrow(/too large|512/i));
  it("accepts a malicious string in name (XSS is a UI concern, not schema)", () =>
    expect(parseInsights(JSON.stringify({ ...JSON.parse(VALID), plugins: [{ ...JSON.parse(VALID).plugins[0], name: "<script>x</script>" }] })).plugins[0]?.name).toContain("script"));
});
```

- [ ] **Step 3: Run → FAIL**, then implement `parse-insights.ts`:

```ts
import { z } from "zod";
import type { SiteInsights } from "../contract";

const MAX_BYTES = 512 * 1024;

const UpdateableItem = {
	slug: z.string().max(200),
	name: z.string().max(500),
	version: z.string().max(50),
	update_available: z.boolean(),
	new_version: z.string().max(50).nullable(),
	auto_update: z.boolean().nullable(),
};
const PluginRecord = z.object({ ...UpdateableItem, status: z.enum(["active", "inactive", "must-use", "dropin"]) });
const ThemeRecord = z.object({ ...UpdateableItem, status: z.enum(["active", "parent", "inactive"]) });
const HealthIssue = z.object({ label: z.string().max(500), description: z.string().max(2000), test: z.string().max(200) });

const InsightsSchema = z.object({
	schema_version: z.literal(1),
	generated_at: z.string().max(40),
	site_url: z.string().max(500),
	wp_core: z.object({ version: z.string().max(20), update_available: z.boolean(), new_version: z.string().max(20).nullable() }),
	php_version: z.string().max(30),
	db: z.object({ size_bytes: z.number().int().nonnegative(), engine: z.string().max(50), server_version: z.string().max(100) }),
	plugins: z.array(PluginRecord).max(500),
	themes: z.array(ThemeRecord).max(100),
	users: z.object({ count: z.number().int().nonnegative(), admin_count: z.number().int().nonnegative(), last_login: z.string().nullable() }),
	site_health: z.object({ collected_at: z.string().max(40), critical: z.array(HealthIssue).max(50), recommended: z.array(HealthIssue).max(100) }),
	signals: z.object({
		xmlrpc_enabled: z.boolean(), file_edit_enabled: z.boolean(), debug_on: z.boolean(),
		debug_log_on: z.boolean(), debug_display_on: z.boolean(), script_debug_on: z.boolean(),
		auto_update_core: z.enum(["minor", "major", "off"]), cron_disabled: z.boolean(),
	}),
	object_cache: z.object({ enabled: z.boolean(), type: z.enum(["redis", "memcached", "apcu", "none"]), dropin_present: z.boolean() }),
	fastcgi_cache: z.object({ enabled: z.boolean() }),
});

/** Strict parse of the untrusted drop-file. Throws on oversize/malformed/unknown-shape. */
export function parseInsights(stdout: string): SiteInsights {
	if (stdout.length > MAX_BYTES) {
		throw new Error(`insights payload too large (> ${MAX_BYTES} bytes)`);
	}
	return InsightsSchema.parse(JSON.parse(stdout.trim())) as SiteInsights;
}
```
(The `as SiteInsights` is safe because the schema mirrors the contract type field-for-field. Verify they match.)

- [ ] **Step 4: Run → PASS**; `cd control-panel && bun run check-types | tail -1`.

- [ ] **Step 5: Commit** — `git add control-panel/packages/api/src/contract.ts control-panel/packages/api/src/core-bridge/parse-insights.ts control-panel/packages/api/src/core-bridge/parse-insights.test.ts && git commit -m "feat(insights): SiteInsights contract + strict size-capped Zod parser"`

---

## Task 4: Router — `siteInventory` + `refreshInventory`

**Files:** Create `routers/inventory.ts`; modify `routers/index.ts`.

**Interfaces:**
- Consumes: `runVibe(..., "insights"|"insightsRefresh")` (Task 2), `parseInsights` (Task 3), `findSite`, `operatorProcedure`.
- Produces: `siteInventory` (returns `SiteInsights | null`), `refreshInventory` (returns `{ ok: boolean }`).

- [ ] **Step 1: Create `inventory.ts`** (mirror `updates.ts`):

```ts
import { z } from "zod";

import type { SiteInsights } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseInsights } from "../core-bridge/parse-insights";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure } from "../procedures";

export const inventoryRouter = {
	siteInventory: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SiteInsights | null> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return null;
			}
			const { stdout, code } = await runVibe(site.installDir, "prod", "insights", {
				timeoutMs: 10_000,
			});
			if (code !== 0) {
				return null; // not collected yet (file absent)
			}
			return parseInsights(stdout); // throws on malformed → surfaced as a 500/parse error
		}),

	refreshInventory: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ ok: boolean }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { ok: false };
			}
			const { code } = await runVibe(site.installDir, "prod", "insightsRefresh", {
				timeoutMs: 60_000,
			});
			return { ok: code === 0 };
		}),
};
```

- [ ] **Step 2: Register** — in `routers/index.ts` import `inventoryRouter` and spread it into `appRouter` (after `updatesRouter`, mirroring the others).

- [ ] **Step 3: Typecheck + full api suite** — `cd control-panel && bun run check-types && cd packages/api && bunx vitest run` → green.

- [ ] **Step 4: Commit** — `git add control-panel/packages/api/src/routers/inventory.ts control-panel/packages/api/src/routers/index.ts && git commit -m "feat(insights): inventory router (siteInventory + refreshInventory)"`

---

## Task 5: Web — Inventory page + query + nav

**Files:** Modify `data/queries.ts`, `components/app-sidebar.tsx`; create `routes/_auth/sites/$siteId/inventory.tsx`.

- [ ] **Step 1: `data/queries.ts`** — add (mirror `logsQuery`/`healthQuery`):

```ts
export const inventoryQuery = (siteId: string) =>
	orpc.siteInventory.queryOptions({ input: { siteId } });
```

- [ ] **Step 2: `app-sidebar.tsx`** — add an "Inventory" entry to `SITE_LINKS` (after "Logs"), importing a lucide icon (e.g. `PackageOpen`): `{ label: "Inventory", to: "/sites/$siteId/inventory", icon: PackageOpen }`. Match the existing entries' exact shape.

- [ ] **Step 3: Create `inventory.tsx`** — read `logs.tsx` first for the route + `QueryBoundary` + `TopBar`/`PageHeader` patterns. Build a read-only page:
  - `createFileRoute("/_auth/sites/$siteId/inventory")`.
  - `useQuery(inventoryQuery(siteId))` inside a `<QueryBoundary>`.
  - When `data === null`: an empty state — "No inventory collected yet" + a **Refresh now** button (calls `orpc.refreshInventory.mutationOptions()`, then invalidates the query after a short delay / re-polls). 
  - When data present: a header (`WordPress <wp_core.version>` + "Update to X" if `update_available`; `PHP <php_version> · <db.engine> <db.server_version> · DB <size>`; "Collected N min ago" from `generated_at`, with a staleness warning if > 24h) + a **Refresh now** button (mutation → invalidate/re-poll until `generated_at` advances).
  - A **Plugins** table: name, version, → new_version (if update), status badge (active/inactive), auto-update indicator. Read-only (NO update buttons — those are feature #4). 
  - A **Themes** table (same shape).
  - A **Site Health** section: critical (red) + recommended (amber) issue labels.
  - A **Security signals** mini-list: xmlrpc/file-edit/debug/cron flags with ✓/✗ (display only).
  Use existing UI primitives (Badge, Button, table/card components the other pages use — grep `logs.tsx`/`overview.tsx` for the imports). Keep it focused; split a `<PluginTable>` subcomponent if the file grows large.

- [ ] **Step 4: Quality gate** — `cd control-panel && bun run check-types && bun run check && bun run build`. Fix lint; match import/format style (run `bunx biome check --write` on the new/edited files if it reports fixable issues, then re-check).

- [ ] **Step 5: Commit** — `git add control-panel/web/src/data/queries.ts control-panel/web/src/components/app-sidebar.tsx control-panel/web/src/routes/_auth/sites/\$siteId/inventory.tsx && git commit -m "feat(insights): Inventory page + nav + refresh"`

---

## Task 6: VPS validation (budgeted, per the feature-#2 lesson)

Controller-run on the test VPS after all tasks review-clean. Deploy the branch (`git -C /opt/vibe-wp-src fetch + checkout`, `bin/panel update`), create a prod test site (which builds the WP image with the new mu-plugin) + **install WordPress** (`wp core install` — needed so the collector + Site Health run), then verify:

- [ ] mu-plugin loaded: `wp --path=/var/www/html plugin list --status=must-use` (or `eval 'var_dump(function_exists("vibe_insights_collect"));'`) shows it active.
- [ ] **Trigger the collector:** `wp --path=/var/www/html cron event run vibe_insights_collect_cron` → exit 0.
- [ ] **Drop-file exists + valid:** `ls -l content/.vibe/insights.json` shows `0640 www-data`; `cat content/.vibe/insights.json | python3 -m json.tool` parses; `schema_version == 1`; it contains real plugin/theme/wp_core data and **NO secrets** (grep the file for the DB password / WP salts → 0 matches).
- [ ] **Host op:** `./bin/vibe prod insights | python3 -m json.tool` returns the file; on a site with no file yet, exit 1 + `{"error":"not_collected"}`.
- [ ] **Wrapper:** a direct `sudo -n vibe-panel-run vibe <siteDir> prod insights` (as the panel does) returns the JSON; an out-of-allowlist wp form (e.g. `wp cron event run something_else`) is rejected by `validate_wp_args`.
- [ ] **Panel API:** sign in (operator/owner), `siteInventory` returns the parsed inventory (matches the `cat`); `refreshInventory` → `{ok:true}` and a subsequent `siteInventory` shows an advanced `generated_at`.
- [ ] **Size cap:** write a 600 KB bogus `content/.vibe/insights.json`; confirm `siteInventory` rejects it (parse error, not a crash) — and that the mu-plugin's own write caps at 512 KB.
- [ ] **Mirror:** `md5sum content/mu-plugins/vibe-wp-insights.php docker/wordpress/mu-plugins/vibe-wp-insights.php` → equal.
- [ ] **UI:** open the panel Inventory page → data renders; Refresh works.
- [ ] Tear down the test site; leave the VPS clean.

---

## Self-Review (plan author)

**Spec coverage:** §2.1 drop-file→T1/T2; §3.1/§3.2 schema→T3 (minus `_vuln_join_keys` per owner); §4.1 collector→T1; §4.2 op→T2; §4.3 parser+router→T3/T4; §4.4 UI→T5; §6.1 untrusted discipline→T3 (strict parse + size cap) + constraints; §6.2 perms→T1; §6.4 mirror guard→T1; §9 phases→T1-T5; §10.1 refresh→live (owner) via one exact wp form; §10.2 cadence→15min; §10.5 `_vuln_join_keys`→dropped (owner). §11 tests→T1/T3 + the VPS round.

**Decisions baked in:** data-backbone scope (no vuln feed/score); live Refresh via one exact-match wp form (tightest widening); 15-min cron; drop-file permanent; mirror guard test.

**Host-boundary checklist (feature-#2 lesson):** new `bin/vibe` case for `insights` ✓ (the read); `insights` in OP_ALLOWLIST + the wp form in validate_wp_args ✓; NO env injection → NO env_keep change (confirmed: ops carry no secrets); `insights` read on host (host-mounted file) ✓ / refresh in container (existing wp op) ✓; no render-at-start → no recreate ✓; drop-file carries no secrets by design + redact() at the boundary ✓. The VPS round (T6) validates each.

**Type consistency:** `SiteInsights` (contract) mirrors the Zod schema field-for-field (snake_case throughout to avoid a mapping layer); `parseInsights` returns it; the router + UI consume it. `insights`/`insightsRefresh` op names match across exec.ts, the wrapper allowlist (`insights` token + the wp form), and the router.

**No placeholders:** complete code for the host op, the parser, the router, the write/cron logic, and the mirror guard; the verbose WP collectors are specified field-by-field with their exact WP API source (the implementer transcribes known core APIs; the VPS round is the correctness gate, as the spec intends for PHP).
