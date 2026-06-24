# Feature #4 — Plugin/Update Management + Safe-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the control panel per-item plugin/theme management (activate/deactivate/update/delete/auto-update), a core-update path, scheduled auto-updates, and a safe-update job (pre-update backup → update → smoke+TTFB → auto-rollback), by widening the root `wp` allowlist behind a structured, defense-in-depth validator and a centralized role map.

**Architecture:** The panel's per-item actions map to new `VIBE_OPS` `wp` forms that pass a single validated slug as an argument. The root wrapper `bin/vibe-panel-run` replaces its 4-exact-string `validate_wp_args` with a structured verb×slug validator that still accepts all 4 existing forms byte-for-byte. Role tiers come from one `WP_ACTION_TIERS` map. Reads reuse the already-shipped `inventoryRouter.siteInventory` (#3). Safe-update is a compound job built on `launchJob` that chains the existing `backup`/`update`/`smoke`/`restore` ops.

**Tech Stack:** Bun + TypeScript, oRPC routers, Zod, vitest (`vitest run`), Drizzle/SQLite (no new tables here), POSIX `sh` for `bin/` + the wrapper, Biome/Ultracite for lint.

## Global Constraints

- **Root-boundary discipline (non-negotiable):** every new panel→host capability = a new `bin/vibe` op + a `VIBE_OPS` entry in `exec.ts` + an allowlist token in `bin/vibe-panel-run` with argument re-validation at the root boundary. Distrust the panel.
- **Preserve all 4 existing `wp` forms byte-for-byte:** `core update`, `plugin update --all`, `plugin list --update=available --format=json`, `cron event run vibe_insights_collect_cron`. Dropping any regresses `updatesApply`/`updatesAvailable`/`insightsRefresh`.
- **No `install`, `eval`, `eval-file`, `db`, `shell`, `config`, `search-replace`** — permanently off the wp allowlist.
- **Slug regex (wrapper AND panel):** `^[a-z0-9][a-z0-9-]{0,62}$` (1–63 chars, lowercase alnum + hyphen, no leading hyphen).
- **Version flag regex:** value of `--version=` must match `^[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9.]+)?$`.
- **Role tiers (from `WP_ACTION_TIERS`):** operator = activate/deactivate/update (plugin/theme/core)/auto-update toggle/safe-update/schedule; admin = delete + standalone restore. Roles are hierarchical (viewer<operator<admin) via the existing `requireRole`.
- **TTFB threshold:** 3000 ms default, overridable per site via `VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS`.
- **Schedule cadence options:** `off` | `weekly` | `daily` only.
- **Bulk safe-update:** sequential, one pre-run backup for the batch, stop on first failure.
- **English** for all code, comments, commit messages, UI copy. TS files follow existing Biome/Ultracite rules; run `bun run check` + `bun run check-types` before each commit in `control-panel/`.
- **MU plugin duplication rule** does not apply here — feature #4 adds no mu-plugin (it consumes #3's).
- **Security review is a merge gate** (Task 3) and must run on the deployed wrapper before any panel mutation reaches production.

### Deviations from the spec (surface reductions, all consistent with spec intent)

1. **Reads reuse `inventoryRouter.siteInventory`** (already shipped + wired) instead of a new `readInsights` helper or `pluginsList`/`themesList`. The spec assumed #3's read side was unmerged; it is merged. Zero new read surface.
2. **No `core version` verb/op.** The core update card reads the current/new version from `siteInventory().wp_core`; `wp core version` is unnecessary, so it is NOT added to the wrapper allowlist or `VIBE_OPS` (smaller root surface).
3. **`SiteInsights` plugin/theme shape on `main`** is `{ slug, name, version, update_available, new_version, auto_update, status }` (no `plugin_uri`/`author`/`network_active`/`_vuln_join_keys`). UI uses exactly these fields.

---

## File Structure

**Root / wrapper (POSIX sh):**
- Modify `bin/vibe-panel-run` — replace `validate_wp_args`; add `validate_wp_slug`, `validate_wp_version_flag`; add a `VIBE_PANEL_RUN_LIB` source-guard around the bottom dispatch (testability); add `auto-update-schedule-apply` to `OP_ALLOWLIST`; allow its keyword arg.
- Create `bin/auto-update-schedule-apply` — install/remove a systemd timer (modeled on `bin/backup-schedule-apply`).
- Modify `bin/vibe` — add the `auto-update-schedule-apply` dispatch case.

**Panel API (`control-panel/packages/api/src/`):**
- Create `core-bridge/wp-actions.ts` — `WP_ACTION_TIERS`, `tierFor`, `procedureFor`, `SLUG_RE`, `assertSlug`.
- Create `core-bridge/wp-actions.test.ts` — pure tests for the map + slug.
- Create `core-bridge/wrapper-wp-args.test.ts` — vitest shelling into the wrapper's `validate_wp_args`.
- Create `core-bridge/safe-update.ts` — the compound safe-update `{proc, lines}` builder + `startSafeUpdate`.
- Create `core-bridge/safe-update.test.ts` — unit tests with mocked deps.
- Create `routers/plugins.ts` — per-item plugin ops + auto-update toggle + schedule + safe-update.
- Create `routers/plugins.test.ts`.
- Create `routers/themes.ts` — per-item theme ops + auto-update toggle.
- Create `routers/themes.test.ts`.
- Modify `core-bridge/exec.ts` — add per-item `wp*` `VIBE_OPS` + `autoUpdateScheduleApply`.
- Modify `core-bridge/exec.test.ts` — argv-shape tests for the new ops.
- Modify `routers/index.ts` — register `pluginsRouter`, `themesRouter`.

**Panel web (`control-panel/web/src/`):** (mirror existing per-site page + live-operation patterns)
- Create `components/plugins/plugins-table.tsx`, `components/plugins/themes-table.tsx`, `components/plugins/core-update-card.tsx`, `components/plugins/safe-update-button.tsx`.
- Create/extend the per-site "Plugins" route under `routes/_auth/sites/$siteId/`.

---

## Phase 1 — Wrapper allowlist (critical path + security gate)

### Task 1: Make the wrapper unit-testable + lock the current behavior

**Files:**
- Modify: `bin/vibe-panel-run` (wrap bottom dispatch in a source-guard)
- Test: `control-panel/packages/api/src/core-bridge/wrapper-wp-args.test.ts`

**Interfaces:**
- Produces: a sourceable `validate_wp_args` shell function reachable via `VIBE_PANEL_RUN_LIB=1 . bin/vibe-panel-run`; a vitest helper `runValidateWp(...args): number` (0 = accepted, 1 = rejected).

- [ ] **Step 1: Write the failing test** (locks the 4 existing forms; uses the not-yet-added source-guard)

`control-panel/packages/api/src/core-bridge/wrapper-wp-args.test.ts`:
```ts
import { describe, expect, it } from "vitest";

// Repo-root wrapper, five levels up from this file's dir.
const WRAPPER = new URL(
  "../../../../../bin/vibe-panel-run",
  import.meta.url
).pathname;

/** Source the wrapper as a library and invoke validate_wp_args with raw argv.
 *  Returns the exit code: 0 = accepted (returned), 1 = rejected (die). */
function runValidateWp(...args: string[]): number {
  const script = 'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; shift; validate_wp_args "$@"';
  const proc = Bun.spawnSync(["sh", "-c", script, "sh", WRAPPER, ...args]);
  return proc.exitCode ?? -1;
}

describe("validate_wp_args — existing forms preserved", () => {
  it.each([
    ["core", "update"],
    ["plugin", "update", "--all"],
    ["plugin", "list", "--update=available", "--format=json"],
    ["cron", "event", "run", "vibe_insights_collect_cron"],
  ])("accepts %s", (...args) => {
    expect(runValidateWp(...args)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wrapper-wp-args.test.ts`
Expected: FAIL — sourcing currently runs the dispatch (`die "missing subcommand"`), so exit code is 1/99, not 0.

- [ ] **Step 3: Add the source-guard** around the bottom dispatch in `bin/vibe-panel-run`

Wrap the final dispatch block (the `sub="${1:-}" … esac`, currently lines ~357–405) so it only runs when executed directly, not when sourced as a lib:
```sh
# When sourced as a library (tests), expose the functions but do NOT dispatch.
if [ "${VIBE_PANEL_RUN_LIB:-}" != "1" ]; then
sub="${1:-}"
[ -n "$sub" ] || die "missing subcommand"
shift || true

case "$sub" in
  # … existing vibe / installer / siteinfo / *) cases UNCHANGED …
esac
fi
```
(Indentation inside the `if` may stay as-is; only the wrapping `if … fi` is added.)

- [ ] **Step 4: Run it — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wrapper-wp-args.test.ts`
Expected: PASS (4 accepted forms).

- [ ] **Step 5: Commit**

```bash
git add bin/vibe-panel-run control-panel/packages/api/src/core-bridge/wrapper-wp-args.test.ts
git commit -m "test(panel): make vibe-panel-run sourceable; lock the 4 existing wp forms"
```

---

### Task 2: Structured `validate_wp_args` (the widening)

**Files:**
- Modify: `bin/vibe-panel-run` (`validate_wp_args`; add `validate_wp_slug`, `validate_wp_version_flag`)
- Test: `control-panel/packages/api/src/core-bridge/wrapper-wp-args.test.ts` (extend)

**Interfaces:**
- Produces: wrapper acceptance of `plugin {activate,deactivate,update,delete} <slug>`, `plugin auto-updates {enable,disable} <slug>` *and* `<slug> {enable,disable}` order, `theme {activate,update,delete} <slug>`, `theme auto-updates …`, `core update [--version=X]`, `plugin/theme update <slug> [--version=X]`; rejection of every injection vector.

> **Slug/subverb arg order.** The shipped `auto-updates` `VIBE_OPS` bake the subverb into argv (`["wp","plugin","auto-updates","enable"]`) and pass the slug as the trailing arg, so the wrapper receives `plugin auto-updates enable <slug>` (subverb THEN slug). Accept that exact order. (The spec pseudocode showed slug-then-subverb; argv order wins — this validator matches argv.)

- [ ] **Step 1: Write the failing tests** (append to `wrapper-wp-args.test.ts`)

```ts
describe("validate_wp_args — new per-item forms accepted", () => {
  it.each([
    ["plugin", "activate", "contact-form-7"],
    ["plugin", "deactivate", "woocommerce"],
    ["plugin", "update", "akismet"],
    ["plugin", "delete", "hello-dolly"],
    ["plugin", "update", "akismet", "--version=5.3.1"],
    ["plugin", "auto-updates", "enable", "redis-cache"],
    ["plugin", "auto-updates", "disable", "redis-cache"],
    ["theme", "activate", "twentytwentyfour"],
    ["theme", "update", "astra"],
    ["theme", "delete", "storefront"],
    ["theme", "auto-updates", "enable", "astra"],
    ["core", "update", "--version=6.8.1"],
  ])("accepts %s", (...args) => {
    expect(runValidateWp(...args)).toBe(0);
  });
});

describe("validate_wp_args — injection + policy rejected", () => {
  it.each([
    // install is gone
    [["plugin", "install", "query-monitor"]],
    [["theme", "install", "hello-elementor"]],
    [["plugin", "install", "https://evil.com/backdoor.zip"]],
    // metacharacters / traversal in slug
    [["plugin", "activate", "contact-form-7; rm -rf /"]],
    [["plugin", "update", "woo$(whoami)merce"]],
    [["plugin", "delete", "woo|evil"]],
    [["plugin", "delete", "../../../etc/passwd"]],
    // path-traversal flags
    [["plugin", "update", "akismet", "--path=/tmp/evil"]],
    [["plugin", "activate", "akismet", "--url=https://evil.com"]],
    [["plugin", "update", "akismet", "--require=/tmp/evil.php"]],
    // blocked verbs
    [["eval", "system('id')"]],
    [["eval-file", "/tmp/evil.php"]],
    [["db", "query", "DROP TABLE wp_users"]],
    [["shell"]],
    [["config", "set", "DB_PASSWORD", "evil"]],
    [["search-replace", "old", "new"]],
    // namespace / verb injection
    [["INVALID", "activate", "slug"]],
    [["plugin", "INVALID", "slug"]],
    [["cron", "event", "run", "other_hook"]],
    // version-flag injection
    [["plugin", "update", "akismet", "--version=1.0; rm -rf /"]],
    [["core", "update", "--version=6.8.1 && evil"]],
    // multi-slug / arity
    [["plugin", "activate", "slug1", "slug2"]],
    [["plugin", "update", "slug1", "slug2", "slug3"]],
    // 64-char slug, empty slug, missing slug
    [["plugin", "activate", "a".repeat(64)]],
    [["plugin", "activate", ""]],
    [["plugin", "update"]],
  ])("rejects %j", ([args]) => {
    expect(runValidateWp(...(args as string[]))).toBe(1);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wrapper-wp-args.test.ts`
Expected: FAIL — the current 4-exact-string `validate_wp_args` rejects every new positive case.

- [ ] **Step 3: Replace `validate_wp_args` and add helpers** in `bin/vibe-panel-run`

Replace the existing `validate_wp_args()` (lines ~199–214) with:
```sh
# `wp` is special: re-validate the subcommand at the root boundary. Accepts the
# pre-existing fixed forms byte-for-byte PLUS the feature #4 per-item forms.
# NEVER reachable: eval/eval-file/db/shell/config/search-replace/install/etc.
validate_wp_slug() {
  slug="$1"
  case "$slug" in
    *://*) die "wp slug must not be a URL" ;;
    ''|-*) die "wp slug empty or leading-hyphen: $slug" ;;
    *[!a-z0-9-]*) die "wp slug fails regex: $slug" ;;
  esac
  [ "${#slug}" -le 63 ] || die "wp slug too long: $slug"
}

validate_wp_version_flag() {
  case "$1" in
    --version=*) val="${1#--version=}" ;;
    *) die "only --version= flag allowed here: $1" ;;
  esac
  # semver-ish: 1.2 | 1.2.3 | 1.2.3-beta.1 ; reject anything with extra chars.
  case "$val" in
    *[!0-9.a-zA-Z-]*) die "--version= value has illegal chars: $val" ;;
    [0-9]*.[0-9]*) : ;;
    *) die "--version= value is not a version: $val" ;;
  esac
}

validate_wp_args() {
  # Fast-path: the four pre-existing FIXED forms keep working byte-for-byte.
  joined="$*"
  case "$joined" in
    "core update") return 0 ;;
    "plugin update --all") return 0 ;;
    "plugin list --update=available --format=json") return 0 ;;
    "cron event run vibe_insights_collect_cron") return 0 ;;
  esac
  # Structured per-item forms (feature #4). `cron` is NOT a general namespace:
  # only the one fixed cron form above is allowed; anything else dies below.
  namespace="${1:-}"; verb="${2:-}"
  case "$namespace" in
    plugin|theme|core) : ;;
    *) die "wp namespace not allowed: $namespace" ;;
  esac
  case "$namespace $verb" in
    "plugin activate"|"plugin deactivate"|"plugin update"|"plugin delete"|\
    "plugin auto-updates"|\
    "theme activate"|"theme update"|"theme delete"|"theme auto-updates"|\
    "core update") : ;;
    *) die "wp subcommand not allowed: wp $namespace $verb" ;;
  esac
  # core update [--version=X] — no slug.
  if [ "$namespace $verb" = "core update" ]; then
    [ "$#" -le 3 ] || die "wp core update takes at most one --version= flag"
    [ "$#" -eq 3 ] && validate_wp_version_flag "$3"
    return 0
  fi
  # auto-updates: `<ns> auto-updates <enable|disable> <slug>` (subverb THEN slug).
  if [ "$verb" = "auto-updates" ]; then
    subverb="${3:-}"; slug="${4:-}"
    case "$subverb" in enable|disable) : ;; *) die "auto-updates needs enable|disable" ;; esac
    validate_wp_slug "$slug"
    [ "$#" -eq 4 ] || die "wp auto-updates takes exactly 4 args"
    return 0
  fi
  # activate/deactivate/update/delete <slug> [--version=X (update only)]
  slug="${3:-}"
  validate_wp_slug "$slug"
  if [ "$#" -eq 4 ]; then
    [ "$verb" = "update" ] || die "$namespace $verb takes no flags"
    validate_wp_version_flag "$4"
  elif [ "$#" -gt 4 ]; then
    die "too many arguments for wp $namespace $verb"
  fi
  return 0
}
```

Also update the dispatch comment for the `wp)` case (line ~374) from "only the 4 exact panel wp forms" to "the 4 fixed forms + per-item plugin/theme/core forms (structured, slug-validated)".

- [ ] **Step 4: Run — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wrapper-wp-args.test.ts`
Expected: PASS — all positive + negative cases.

- [ ] **Step 5: Lint the shell + commit**

```bash
sh -n bin/vibe-panel-run   # syntax check; expect no output
git add bin/vibe-panel-run control-panel/packages/api/src/core-bridge/wrapper-wp-args.test.ts
git commit -m "feat(panel): structured wp allowlist in vibe-panel-run (per-item plugin/theme/core)"
```

---

### Task 3: Independent wrapper security review (GATE)

**Files:** none (review only). This task does not write code; it produces a written verdict.

- [ ] **Step 1: Dispatch a fresh code-reviewer subagent** scoped to `bin/vibe-panel-run` `validate_wp_args` + helpers, with this checklist (from spec §5.3):
  1. Every branch of `validate_wp_args` — can any reach `exec` with an unvalidated free-form string?
  2. Is `validate_wp_slug` called on ALL slug-bearing paths?
  3. Does the URL/leading-hyphen/charset guard fire before the slug is ever used?
  4. Is `install` (and eval/db/shell/config/search-replace) unreachable?
  5. Re-run the §10.1 injection vectors mentally against the code.
  6. Any `OP_ALLOWLIST` / `FLAG_ALLOWLIST` widening with unintended surface? (Task 9 adds `auto-update-schedule-apply` — review that too if already present.)
- [ ] **Step 2:** If the reviewer flags a real issue, fix it inline, re-run Task 2's test, re-review. Only proceed past this gate on a clean verdict.
- [ ] **Step 3:** Record the verdict in the PR description / commit trailer (`Security-Review: <name/agent> — <date>`).

---

## Phase 2 — `VIBE_OPS` + slug validation (panel side)

### Task 4: Add per-item `wp*` ops to `VIBE_OPS`

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts` (extend `VIBE_OPS`)
- Test: `control-panel/packages/api/src/core-bridge/exec.test.ts` (append)

**Interfaces:**
- Produces `VibeOp` keys: `wpPluginActivate`, `wpPluginDeactivate`, `wpPluginUpdate`, `wpPluginDelete`, `wpPluginAutoUpdatesEnable`, `wpPluginAutoUpdatesDisable`, `wpThemeActivate`, `wpThemeUpdate`, `wpThemeDelete`, `wpThemeAutoUpdatesEnable`, `wpThemeAutoUpdatesDisable`. Each `takesArg: true`; mutating ones `stream: true`, auto-update toggles `stream: false`.

- [ ] **Step 1: Write the failing test** (append to `exec.test.ts`)

```ts
import { buildVibeArgv } from "./exec";

describe("per-item wp ops", () => {
  it("builds plugin activate argv with the slug appended", () => {
    expect(
      buildVibeArgv("/opt/site", "prod", "wpPluginActivate", ["akismet"])
    ).toEqual(["/opt/site/bin/vibe", "prod", "wp", "plugin", "activate", "akismet"]);
  });
  it("builds plugin auto-updates enable argv with the slug as trailing arg", () => {
    expect(
      buildVibeArgv("/opt/site", "prod", "wpPluginAutoUpdatesEnable", ["redis-cache"])
    ).toEqual([
      "/opt/site/bin/vibe", "prod", "wp", "plugin", "auto-updates", "enable", "redis-cache",
    ]);
  });
  it("refuses a flag-like slug (no leading dash reaches the wrapper)", () => {
    expect(() =>
      buildVibeArgv("/opt/site", "prod", "wpPluginUpdate", ["--path=/evil"])
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/exec.test.ts`
Expected: FAIL — `wpPluginActivate` is not a `VibeOp`.

- [ ] **Step 3: Add the ops** to `VIBE_OPS` in `exec.ts` (after `insightsRefresh`)

```ts
	// --- Feature #4: per-item plugin/theme management (slug as args[0]) ---
	wpPluginActivate: { argv: ["wp", "plugin", "activate"], stream: true, takesArg: true },
	wpPluginDeactivate: { argv: ["wp", "plugin", "deactivate"], stream: true, takesArg: true },
	wpPluginUpdate: { argv: ["wp", "plugin", "update"], stream: true, takesArg: true },
	wpPluginDelete: { argv: ["wp", "plugin", "delete"], stream: true, takesArg: true },
	wpPluginAutoUpdatesEnable: {
		argv: ["wp", "plugin", "auto-updates", "enable"], stream: false, takesArg: true,
	},
	wpPluginAutoUpdatesDisable: {
		argv: ["wp", "plugin", "auto-updates", "disable"], stream: false, takesArg: true,
	},
	wpThemeActivate: { argv: ["wp", "theme", "activate"], stream: true, takesArg: true },
	wpThemeUpdate: { argv: ["wp", "theme", "update"], stream: true, takesArg: true },
	wpThemeDelete: { argv: ["wp", "theme", "delete"], stream: true, takesArg: true },
	wpThemeAutoUpdatesEnable: {
		argv: ["wp", "theme", "auto-updates", "enable"], stream: false, takesArg: true,
	},
	wpThemeAutoUpdatesDisable: {
		argv: ["wp", "theme", "auto-updates", "disable"], stream: false, takesArg: true,
	},
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/exec.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts
git commit -m "feat(api): per-item wp plugin/theme ops in VIBE_OPS"
```

---

## Phase 3 — Tier map + routers

### Task 5: `wp-actions.ts` — centralized tier map + slug guard

**Files:**
- Create: `control-panel/packages/api/src/core-bridge/wp-actions.ts`
- Test: `control-panel/packages/api/src/core-bridge/wp-actions.test.ts`

**Interfaces:**
- Produces: `WP_ACTION_TIERS` (record), `type WpAction`, `tierFor(action): "operator"|"admin"`, `SLUG_RE`, `assertSlug(slug, label): void` (throws on bad slug), and `procedureFor(action)` returning `operatorProcedure | adminProcedure`.

- [ ] **Step 1: Write the failing test**

`wp-actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { assertSlug, SLUG_RE, tierFor, WP_ACTION_TIERS } from "./wp-actions";

describe("WP_ACTION_TIERS", () => {
  it("delete is admin, everything else operator", () => {
    expect(tierFor("plugin.delete")).toBe("admin");
    expect(tierFor("theme.delete")).toBe("admin");
    expect(tierFor("plugin.activate")).toBe("operator");
    expect(tierFor("core.update")).toBe("operator");
    expect(tierFor("safeUpdate")).toBe("operator");
    expect(tierFor("schedule.autoUpdate")).toBe("operator");
  });
  it("every action key maps to a known tier", () => {
    for (const t of Object.values(WP_ACTION_TIERS)) {
      expect(["operator", "admin"]).toContain(t);
    }
  });
});

describe("assertSlug", () => {
  it.each(["akismet", "contact-form-7", "a", "a".repeat(63)])("accepts %s", (s) => {
    expect(() => assertSlug(s, "plugin")).not.toThrow();
    expect(SLUG_RE.test(s)).toBe(true);
  });
  it.each([
    "", "-leading", "UPPER", "has space", "a".repeat(64),
    "../x", "evil;rm", "https://x", "woo|evil",
  ])("rejects %j", (s) => {
    expect(() => assertSlug(s, "plugin")).toThrow();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wp-actions.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `wp-actions.ts`**

```ts
import { adminProcedure, operatorProcedure } from "../procedures";

export type Role = "operator" | "admin";

/** Single source of truth for the minimum role each mutating wp action needs.
 *  Adjusting a tier or adding an action is a one-line, reviewable change. */
export const WP_ACTION_TIERS = {
  "plugin.activate": "operator",
  "plugin.deactivate": "operator",
  "plugin.update": "operator",
  "plugin.autoUpdate": "operator",
  "plugin.delete": "admin",
  "theme.activate": "operator",
  "theme.update": "operator",
  "theme.autoUpdate": "operator",
  "theme.delete": "admin",
  "core.update": "operator",
  "safeUpdate": "operator",
  "schedule.autoUpdate": "operator",
} as const satisfies Record<string, Role>;

export type WpAction = keyof typeof WP_ACTION_TIERS;

export function tierFor(action: WpAction): Role {
  return WP_ACTION_TIERS[action];
}

/** Pick the oRPC procedure matching an action's tier (roles are hierarchical). */
export function procedureFor(action: WpAction) {
  return tierFor(action) === "admin" ? adminProcedure : operatorProcedure;
}

/** Slug regex shared with the root wrapper (defense-in-depth). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function assertSlug(slug: string, label: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid ${label} slug: ${slug}`);
  }
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/wp-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/core-bridge/wp-actions.ts control-panel/packages/api/src/core-bridge/wp-actions.test.ts
git commit -m "feat(api): WP_ACTION_TIERS role map + assertSlug guard"
```

---

### Task 6: `routers/plugins.ts` — per-item plugin mutations

**Files:**
- Create: `control-panel/packages/api/src/routers/plugins.ts`
- Test: `control-panel/packages/api/src/routers/plugins.test.ts`

**Interfaces:**
- Consumes: `procedureFor`, `assertSlug` (Task 5); `startJob` (jobs.ts); the per-item `VibeOp`s (Task 4).
- Produces router procedures `pluginActivate`, `pluginDeactivate`, `pluginUpdate`, `pluginDelete`, `pluginAutoUpdate` — each input `{ siteId, slug }` (plus `{ enabled }` for autoUpdate), returning `startJob`'s `{ jobId }` (or `{ ok }` for the non-streaming toggle).

- [ ] **Step 1: Write the failing test** (mirrors how jobs.test.ts injects deps; here we assert the op + args + tier via a `startJob` spy)

`plugins.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

// Mock startJob so we can assert the op/args without a DB or spawn.
const startJob = vi.fn(async () => ({ jobId: "job-1" }));
vi.mock("../core-bridge/jobs", () => ({ startJob }));

import { pluginsRouter } from "./plugins";

const ctx = { session: { user: { id: "u1", role: "operator" } } } as never;

describe("pluginsRouter mutations", () => {
  it("pluginUpdate starts a wpPluginUpdate job with the slug", async () => {
    startJob.mockClear();
    await pluginsRouter.pluginUpdate["~orpc"].handler({
      input: { siteId: "s1", slug: "akismet" }, context: ctx,
    });
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({ op: "wpPluginUpdate", args: ["akismet"], siteId: "s1" })
    );
  });
  it("pluginActivate rejects an invalid slug before spawning", async () => {
    startJob.mockClear();
    await expect(
      pluginsRouter.pluginActivate["~orpc"].handler({
        input: { siteId: "s1", slug: "evil; rm -rf /" }, context: ctx,
      })
    ).rejects.toThrow(/Invalid/);
    expect(startJob).not.toHaveBeenCalled();
  });
});
```

> **Confirmed invocation pattern** (from `routers/setup.test.ts`): `router.procedure["~orpc"].handler({ context, input })`. Note this calls the handler **directly, bypassing the procedure's role middleware** — so these tests verify op/args/slug-guard, NOT role enforcement. Tier correctness is covered separately by `wp-actions.test.ts` (Task 5) and the existing `requireRole` middleware; do not write a router test that expects `["~orpc"].handler` to reject an operator.

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/plugins.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `routers/plugins.ts`**

```ts
import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { assertSlug, procedureFor } from "../core-bridge/wp-actions";

const SlugInput = z.object({ siteId: z.string(), slug: z.string() });

export const pluginsRouter = {
  pluginActivate: procedureFor("plugin.activate")
    .input(SlugInput)
    .handler(({ input, context }) => {
      assertSlug(input.slug, "plugin");
      return startJob({
        op: "wpPluginActivate", siteId: input.siteId, env: "prod",
        kind: "wpPluginActivate", args: [input.slug],
        userId: context.session.user.id, action: "pluginActivate",
      });
    }),

  pluginDeactivate: procedureFor("plugin.deactivate")
    .input(SlugInput)
    .handler(({ input, context }) => {
      assertSlug(input.slug, "plugin");
      return startJob({
        op: "wpPluginDeactivate", siteId: input.siteId, env: "prod",
        kind: "wpPluginDeactivate", args: [input.slug],
        userId: context.session.user.id, action: "pluginDeactivate",
      });
    }),

  pluginUpdate: procedureFor("plugin.update")
    .input(SlugInput)
    .handler(({ input, context }) => {
      assertSlug(input.slug, "plugin");
      return startJob({
        op: "wpPluginUpdate", siteId: input.siteId, env: "prod",
        kind: "wpPluginUpdate", args: [input.slug],
        userId: context.session.user.id, action: "pluginUpdate",
      });
    }),

  pluginDelete: procedureFor("plugin.delete")
    .input(SlugInput)
    .handler(({ input, context }) => {
      assertSlug(input.slug, "plugin");
      return startJob({
        op: "wpPluginDelete", siteId: input.siteId, env: "prod",
        kind: "wpPluginDelete", args: [input.slug],
        userId: context.session.user.id, action: "pluginDelete",
      });
    }),

  pluginAutoUpdate: procedureFor("plugin.autoUpdate")
    .input(SlugInput.extend({ enabled: z.boolean() }))
    .handler(({ input, context }) => {
      assertSlug(input.slug, "plugin");
      return startJob({
        op: input.enabled ? "wpPluginAutoUpdatesEnable" : "wpPluginAutoUpdatesDisable",
        siteId: input.siteId, env: "prod", kind: "wpPluginAutoUpdate",
        args: [input.slug], userId: context.session.user.id, action: "pluginAutoUpdate",
      });
    }),
};
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/plugins.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/routers/plugins.ts control-panel/packages/api/src/routers/plugins.test.ts
git commit -m "feat(api): plugins router — per-item activate/deactivate/update/delete/auto-update"
```

---

### Task 7: `routers/themes.ts` — theme parity

**Files:**
- Create: `control-panel/packages/api/src/routers/themes.ts`
- Test: `control-panel/packages/api/src/routers/themes.test.ts`

**Interfaces:**
- Produces `themeActivate`, `themeUpdate`, `themeDelete`, `themeAutoUpdate` (input `{ siteId, slug }`, plus `{ enabled }` for autoUpdate). No `deactivate` (WP has no theme deactivate).

- [ ] **Step 1: Write the failing test** (`themes.test.ts`, mirror Task 6)

```ts
import { describe, expect, it, vi } from "vitest";
const startJob = vi.fn(async () => ({ jobId: "job-1" }));
vi.mock("../core-bridge/jobs", () => ({ startJob }));
import { themesRouter } from "./themes";
const ctx = { session: { user: { id: "u1", role: "operator" } } } as never;

describe("themesRouter", () => {
  it("themeActivate starts wpThemeActivate with the slug", async () => {
    startJob.mockClear();
    await themesRouter.themeActivate["~orpc"].handler({
      input: { siteId: "s1", slug: "astra" }, context: ctx,
    });
    expect(startJob).toHaveBeenCalledWith(
      expect.objectContaining({ op: "wpThemeActivate", args: ["astra"] })
    );
  });
  it("themeDelete rejects a bad slug", async () => {
    startJob.mockClear();
    await expect(
      themesRouter.themeDelete["~orpc"].handler({
        input: { siteId: "s1", slug: "../evil" }, context: ctx,
      })
    ).rejects.toThrow(/Invalid/);
  });
});
```
(Same `["~orpc"].handler` pattern + middleware-bypass note as Task 6, Step 1.)

- [ ] **Step 2: Run — verify it fails.** Run: `cd control-panel/packages/api && bunx vitest run src/routers/themes.test.ts` → FAIL.

- [ ] **Step 3: Implement `routers/themes.ts`** (mirror plugins; ops `wpTheme*`, actions `theme.*`)

```ts
import { z } from "zod";
import { startJob } from "../core-bridge/jobs";
import { assertSlug, procedureFor } from "../core-bridge/wp-actions";

const SlugInput = z.object({ siteId: z.string(), slug: z.string() });

export const themesRouter = {
  themeActivate: procedureFor("theme.activate").input(SlugInput).handler(({ input, context }) => {
    assertSlug(input.slug, "theme");
    return startJob({ op: "wpThemeActivate", siteId: input.siteId, env: "prod",
      kind: "wpThemeActivate", args: [input.slug], userId: context.session.user.id, action: "themeActivate" });
  }),
  themeUpdate: procedureFor("theme.update").input(SlugInput).handler(({ input, context }) => {
    assertSlug(input.slug, "theme");
    return startJob({ op: "wpThemeUpdate", siteId: input.siteId, env: "prod",
      kind: "wpThemeUpdate", args: [input.slug], userId: context.session.user.id, action: "themeUpdate" });
  }),
  themeDelete: procedureFor("theme.delete").input(SlugInput).handler(({ input, context }) => {
    assertSlug(input.slug, "theme");
    return startJob({ op: "wpThemeDelete", siteId: input.siteId, env: "prod",
      kind: "wpThemeDelete", args: [input.slug], userId: context.session.user.id, action: "themeDelete" });
  }),
  themeAutoUpdate: procedureFor("theme.autoUpdate").input(SlugInput.extend({ enabled: z.boolean() }))
    .handler(({ input, context }) => {
      assertSlug(input.slug, "theme");
      return startJob({ op: input.enabled ? "wpThemeAutoUpdatesEnable" : "wpThemeAutoUpdatesDisable",
        siteId: input.siteId, env: "prod", kind: "wpThemeAutoUpdate", args: [input.slug],
        userId: context.session.user.id, action: "themeAutoUpdate" });
    }),
};
```

- [ ] **Step 4: Run — verify it passes.** → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/routers/themes.ts control-panel/packages/api/src/routers/themes.test.ts
git commit -m "feat(api): themes router — activate/update/delete/auto-update parity"
```

---

### Task 8: Register the routers

**Files:**
- Modify: `control-panel/packages/api/src/routers/index.ts`

**Interfaces:**
- Consumes: `pluginsRouter`, `themesRouter`. Produces: their procedures on `appRouter` (web client gains `client.pluginUpdate` etc.).

- [ ] **Step 1: Edit `routers/index.ts`** — add imports + spreads:

```ts
import { pluginsRouter } from "./plugins";
import { themesRouter } from "./themes";
// …inside appRouter, alongside ...updatesRouter / ...inventoryRouter:
	...pluginsRouter,
	...themesRouter,
```

- [ ] **Step 2: Typecheck + full test + build**

Run: `cd control-panel && bun run check-types && bun run test && bun run build`
Expected: PASS (no name collisions across routers).

- [ ] **Step 3: Commit**

```bash
git add control-panel/packages/api/src/routers/index.ts
git commit -m "feat(api): register plugins + themes routers on appRouter"
```

---

## Phase 4 — Scheduled auto-updates

### Task 9: `bin/auto-update-schedule-apply` + wrapper/op wiring

**Files:**
- Create: `bin/auto-update-schedule-apply`
- Modify: `bin/vibe` (dispatch case), `bin/vibe-panel-run` (`OP_ALLOWLIST` + arg keyword)

**Interfaces:**
- Produces: `./bin/vibe <env> auto-update-schedule-apply <off|weekly|daily>` installing/removing a systemd timer `vibe-wp-autoupdate-<slug>-<env>.timer` that runs `./bin/vibe <env> wp plugin update --all`.

- [ ] **Step 1: Read the model script.** Open `bin/backup-schedule-apply` and `bin/vibe`'s dispatch for `backup-schedule-apply`; copy its structure (systemd unit writing, `off` removes the timer, root/systemctl guards, the `slug`/`env` derivation).

- [ ] **Step 2: Write `bin/auto-update-schedule-apply`** mirroring `backup-schedule-apply`, changing:
  - cadence keyword set to `off|weekly|daily` (reject anything else with a usage error);
  - `OnCalendar=` → `weekly` and `daily` (e.g. `OnCalendar=weekly` / `OnCalendar=daily`), with `Persistent=true`;
  - unit name `vibe-wp-autoupdate-<slug>-<env>`;
  - `ExecStart=` runs `<siteDir>/bin/vibe <env> wp plugin update --all`.
  Keep it POSIX `sh`, `set -eu`, and the same root/permission preconditions as the backup variant.

- [ ] **Step 3: Add the `bin/vibe` dispatch case** next to `backup-schedule-apply`:

```sh
  auto-update-schedule-apply)
    exec "$VIBE_DIR/bin/auto-update-schedule-apply" "$ENV" "$@"
    ;;
```
(Match the exact dispatch form `backup-schedule-apply` uses in `bin/vibe`; copy it.)

- [ ] **Step 4: Widen the wrapper** in `bin/vibe-panel-run`:
  - add `auto-update-schedule-apply` to `OP_ALLOWLIST` (the space-separated string at line ~155) and to the comment list above it;
  - it takes one keyword arg — `validate_arg` already rejects metacharacters/flags; add a dedicated guard so only `off|weekly|daily` pass. In the dispatch `case "$op"` (line ~373), add:
    ```sh
      auto-update-schedule-apply)
        [ "$#" -eq 1 ] || die "auto-update-schedule-apply takes one keyword"
        case "$1" in off|weekly|daily) : ;; *) die "schedule must be off|weekly|daily" ;; esac
        ;;
    ```

- [ ] **Step 5: Verify shell syntax + manual smoke**

```bash
sh -n bin/auto-update-schedule-apply bin/vibe bin/vibe-panel-run
# Source-guard test still green:
cd control-panel/packages/api && bunx vitest run src/core-bridge/wrapper-wp-args.test.ts
```
Expected: no syntax errors; wrapper tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/auto-update-schedule-apply bin/vibe bin/vibe-panel-run
git commit -m "feat(panel): auto-update-schedule-apply op + systemd timer (off|weekly|daily)"
```

---

### Task 10: `autoUpdateScheduleApply` op + schedule procedure

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts` (op), `routers/plugins.ts` (procedure)
- Test: `exec.test.ts`, `plugins.test.ts` (append)

**Interfaces:**
- Produces: `VibeOp` `autoUpdateScheduleApply` (`takesArg`, non-stream); `pluginsRouter.setAutoUpdateSchedule` input `{ siteId, cadence: "off"|"weekly"|"daily" }` → `{ ok }`.

- [ ] **Step 1: Write failing tests**

exec.test.ts (append):
```ts
it("builds the auto-update-schedule-apply argv with the cadence", () => {
  expect(
    buildVibeArgv("/opt/site", "prod", "autoUpdateScheduleApply", ["weekly"])
  ).toEqual(["/opt/site/bin/vibe", "prod", "auto-update-schedule-apply", "weekly"]);
});
```
plugins.test.ts (append) — assert it calls `runVibe` with the op + cadence. Mock `runVibe`:
```ts
const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
vi.mock("../core-bridge/exec", async (orig) => ({ ...(await orig()), runVibe }));
// …then call pluginsRouter.setAutoUpdateSchedule handler with cadence "daily"
// and expect runVibe called with op "autoUpdateScheduleApply", args ["daily"].
```

- [ ] **Step 2: Run — verify fails.** → FAIL.

- [ ] **Step 3: Add the op** to `VIBE_OPS`:
```ts
	autoUpdateScheduleApply: { argv: ["auto-update-schedule-apply"], stream: false, takesArg: true },
```
Add `setAutoUpdateSchedule` to `pluginsRouter`:
```ts
  setAutoUpdateSchedule: procedureFor("schedule.autoUpdate")
    .input(z.object({ siteId: z.string(), cadence: z.enum(["off", "weekly", "daily"]) }))
    .handler(async ({ input }) => {
      const { findSite } = await import("../core-bridge/sites");
      const { runVibe } = await import("../core-bridge/exec");
      const site = await findSite(input.siteId);
      if (!site) return { ok: false };
      const { code } = await runVibe(site.installDir, "prod", "autoUpdateScheduleApply", {
        args: [input.cadence], timeoutMs: 30_000,
      });
      return { ok: code === 0 };
    }),
```
(If the existing routers import `findSite`/`runVibe` at top-of-file rather than dynamically, match that style; dynamic import shown to keep the mock simple — align with the surrounding code.)

- [ ] **Step 4: Run — verify passes.** → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts control-panel/packages/api/src/routers/plugins.ts control-panel/packages/api/src/routers/plugins.test.ts
git commit -m "feat(api): setAutoUpdateSchedule (off|weekly|daily) via auto-update-schedule-apply op"
```

---

## Phase 5 — Safe-update compound job

### Task 11: `core-bridge/safe-update.ts` — backup → update → verify → auto-rollback

**Files:**
- Create: `control-panel/packages/api/src/core-bridge/safe-update.ts`
- Test: `control-panel/packages/api/src/core-bridge/safe-update.test.ts`

**Interfaces:**
- Consumes: `runVibe`, `streamVibe` (exec.ts); `launchJob`, `JobDeps`, `getRealDeps` (jobs.ts); `LineStream`.
- Produces: `buildSafeUpdateStream(deps, params): { proc, lines }` where `lines` is an async generator emitting labelled progress lines and orchestrating the sequence; and `startSafeUpdate(input, deps?): Promise<{ jobId }>` that wraps it in `launchJob`.
- `params`: `{ workDir, env, target }` where `target` is `{ kind: "plugin"|"theme", slug }` | `{ kind: "core" }` | `{ kind: "allPlugins" }`.
- TTFB threshold read from `process.env.VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS ?? 3000`.

> **Design.** `launchJob(meta, produce, deps)` accepts any `produce: () => { proc, lines }`. Safe-update supplies a custom one: `lines` is an async generator that (1) runs `backup` via the deps' `streamVibe`, echoing its lines and capturing `Backup written to <path>`; (2) runs the update op via `streamVibe`, echoing lines; (3) runs `smoke` via `runVibe` and an inline `fetch` TTFB check; (4) on any verify failure, runs `restore <path>` via `streamVibe`, then re-`smoke`. `proc.kill()` flips a shared `canceled` flag and kills the current child. Each external op goes through the SAME ops the standalone routers use — the auto-rollback restore is an internal step, never the admin `backupsRestore` procedure.

- [ ] **Step 1: Write the failing test** (inject fake `runVibe`/`streamVibe`; assert the rollback path)

`safe-update.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { buildSafeUpdateStream } from "./safe-update";

function fakeStream(lines: string[], code: number) {
  return {
    proc: { exited: Promise.resolve(code), kill: () => {} },
    lines: (async function* () { for (const l of lines) yield l; })(),
  };
}
async function collect(gen: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []; for await (const l of gen) out.push(l); return out;
}

describe("safe-update", () => {
  it("happy path: backup → update → smoke ok → no restore", async () => {
    const streamVibe = vi.fn((_d, _e, op) => {
      if (op === "backupLocal" || op === "backup")
        return fakeStream(["Backup written to backups/prod/20260624T0000Z"], 0);
      return fakeStream(["Success: updated"], 0); // update op
    });
    const runVibe = vi.fn(async (_d, _e, op) =>
      op === "smoke" ? { stdout: "ok", stderr: "", code: 0 } : { stdout: "", stderr: "", code: 0 }
    );
    const fetchFn = vi.fn(async () => ({ ok: true })) as never;
    const { lines } = buildSafeUpdateStream(
      { streamVibe, runVibe, fetchFn, siteUrl: "https://x", ttfbMs: 3000, r2: false },
      { workDir: "/opt/s", env: "prod", target: { kind: "plugin", slug: "akismet" } }
    );
    const out = await collect(lines);
    expect(out.join("\n")).toMatch(/\[done\] .*succeeded/i);
    expect(runVibe).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "restore", expect.anything());
    expect(streamVibe).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "restore", expect.anything());
  });

  it("rollback: smoke fails → restore the captured snapshot", async () => {
    const calls: string[] = [];
    const streamVibe = vi.fn((_d, _e, op) => {
      calls.push(op);
      if (op === "backupLocal" || op === "backup")
        return fakeStream(["Backup written to backups/prod/SNAP"], 0);
      if (op === "restore") return fakeStream(["Restore complete from backups/prod/SNAP."], 0);
      return fakeStream(["updating…"], 0);
    });
    let smokeCall = 0;
    const runVibe = vi.fn(async (_d, _e, op) => {
      if (op === "smoke") { smokeCall++; return { stdout: "", stderr: "", code: smokeCall === 1 ? 1 : 0 }; }
      return { stdout: "", stderr: "", code: 0 };
    });
    const fetchFn = vi.fn(async () => ({ ok: true })) as never;
    const { lines } = buildSafeUpdateStream(
      { streamVibe, runVibe, fetchFn, siteUrl: "https://x", ttfbMs: 3000, r2: false },
      { workDir: "/opt/s", env: "prod", target: { kind: "core" } }
    );
    const out = await collect(lines);
    expect(calls).toContain("restore"); // restored the captured snapshot
    expect(out.join("\n")).toMatch(/\[restore\]/);
    expect(out.join("\n")).toMatch(/\[done\] .*rolled back/i);
  });
});
```

- [ ] **Step 2: Run — verify it fails.** Run: `cd control-panel/packages/api && bunx vitest run src/core-bridge/safe-update.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `safe-update.ts`**

```ts
import { type VibeEnv, type VibeOp } from "./exec";

export type SafeTarget =
  | { kind: "plugin" | "theme"; slug: string }
  | { kind: "core" }
  | { kind: "allPlugins" };

interface StreamLike { proc: { exited: Promise<number>; kill: () => void }; lines: AsyncIterable<string>; }

export interface SafeUpdateDeps {
  streamVibe: (d: string, e: VibeEnv, op: VibeOp, o?: { args?: string[] }) => StreamLike;
  runVibe: (d: string, e: VibeEnv, op: VibeOp, o?: { args?: string[]; timeoutMs?: number }) =>
    Promise<{ stdout: string; stderr: string; code: number }>;
  fetchFn: typeof fetch;
  siteUrl: string;
  ttfbMs: number;
  r2: boolean; // whether R2 backup is configured (else backupLocal)
}

export interface SafeUpdateParams { workDir: string; env: VibeEnv; target: SafeTarget; }

function updateOp(t: SafeTarget): { op: VibeOp; args?: string[] } {
  if (t.kind === "core") return { op: "wpCoreUpdate" };
  if (t.kind === "allPlugins") return { op: "wpPluginUpdateAll" };
  if (t.kind === "plugin") return { op: "wpPluginUpdate", args: [t.slug] };
  return { op: "wpThemeUpdate", args: [t.slug] };
}

function describeTarget(t: SafeTarget): string {
  if (t.kind === "core") return "WordPress core";
  if (t.kind === "allPlugins") return "all plugins";
  return `${t.kind} ${t.slug}`;
}

export function buildSafeUpdateStream(deps: SafeUpdateDeps, params: SafeUpdateParams): StreamLike {
  let canceled = false;
  let exitResolve!: (code: number) => void;
  const exited = new Promise<number>((res) => { exitResolve = res; });
  let currentKill: (() => void) | null = null;
  const kill = () => { canceled = true; currentKill?.(); };

  async function* run(): AsyncIterable<string> {
    const { workDir, env, target } = params;
    let snapshot: string | null = null;
    try {
      // 1. Pre-update backup
      yield "[backup] Taking pre-update snapshot…";
      const backupOp: VibeOp = deps.r2 ? "backup" : "backupLocal";
      const bk = deps.streamVibe(workDir, env, backupOp);
      currentKill = bk.proc.kill;
      for await (const line of bk.lines) {
        const m = line.match(/Backup written to (\S+)/);
        if (m) snapshot = m[1];
        yield `[backup] ${line}`;
      }
      if ((await bk.proc.exited) !== 0 || !snapshot) {
        yield "[done] Could not take a pre-update backup — aborting (nothing changed).";
        exitResolve(1); return;
      }
      if (canceled) { exitResolve(1); return; }

      // 2. Apply update
      const { op, args } = updateOp(target);
      yield `[update] Updating ${describeTarget(target)}…`;
      const up = deps.streamVibe(workDir, env, op, args ? { args } : undefined);
      currentKill = up.proc.kill;
      for await (const line of up.lines) yield `[update] ${line}`;
      if ((await up.proc.exited) !== 0) {
        yield "[done] Update failed; nothing was applied (no restore needed).";
        exitResolve(1); return;
      }
      if (canceled) { exitResolve(1); return; }

      // 3. Verify: smoke + TTFB
      yield "[smoke] Running smoke tests…";
      const smoke = await deps.runVibe(workDir, env, "smoke", { timeoutMs: 120_000 });
      let ok = smoke.code === 0;
      yield `[smoke] ${ok ? "ok" : "failed"} (exit ${smoke.code})`;
      if (ok) {
        const start = Date.now();
        try {
          const res = await deps.fetchFn(`${deps.siteUrl}/`);
          const ttfb = Date.now() - start;
          ok = (res as { ok: boolean }).ok && ttfb <= deps.ttfbMs;
          yield `[ttfb] Homepage ${ttfb}ms ${ok ? "✓" : `> ${deps.ttfbMs}ms ✗`}`;
        } catch (e) {
          ok = false;
          yield `[ttfb] request failed: ${String(e)}`;
        }
      }

      // 4. Success or auto-rollback
      if (ok) {
        yield `[done] Update succeeded. Snapshot retained: ${snapshot}`;
        exitResolve(0); return;
      }
      yield `[restore] Verification failed — auto-restoring from ${snapshot}…`;
      const rs = deps.streamVibe(workDir, env, "restore", { args: [snapshot] });
      currentKill = rs.proc.kill;
      for await (const line of rs.lines) yield `[restore] ${line}`;
      await rs.proc.exited;
      const post = await deps.runVibe(workDir, env, "smoke", { timeoutMs: 120_000 });
      yield `[smoke] Post-restore smoke: ${post.code === 0 ? "passed" : "FAILED — investigate"}`;
      yield "[done] Update rolled back. Check error logs.";
      exitResolve(1);
    } catch (e) {
      yield `[done] Safe-update aborted: ${String(e)}`;
      exitResolve(1);
    }
  }

  return { proc: { exited, kill }, lines: run() };
}
```

> **`startSafeUpdate` wrapper** (added in the same file): resolves real deps (`getRealDeps` for `findSite`/`persist`/`audit`, plus `streamVibe`/`runVibe` from exec), reads the site's R2 flag + `siteUrl` (from `siteInventory`/env), and calls `launchJob({ kind: "safeUpdate", … }, () => buildSafeUpdateStream(…), jobDeps)`. Show this in Step 3 too:

```ts
import { getRealDeps, launchJob } from "./jobs";
import { runVibe, streamVibe } from "./exec";

export async function startSafeUpdate(input: {
  siteId: string; env: VibeEnv; target: SafeTarget; userId: string; siteUrl: string; r2: boolean;
}): Promise<{ jobId: string }> {
  const d = await getRealDeps();
  const site = await d.findSite(input.siteId);
  if (!site) throw new Error("Unknown site");
  const ttfbMs = Number(process.env.VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS ?? 3000);
  return launchJob(
    { action: "safeUpdate", kind: "safeUpdate", siteId: input.siteId, userId: input.userId },
    () => buildSafeUpdateStream(
      { streamVibe, runVibe, fetchFn: fetch, siteUrl: input.siteUrl, ttfbMs, r2: input.r2 },
      { workDir: site.installDir, env: input.env, target: input.target }
    ),
    d
  );
}
```

- [ ] **Step 4: Run — verify it passes.** Run the test from Step 2 → PASS (both happy + rollback).

- [ ] **Step 5: Typecheck + commit**

```bash
cd control-panel && bun run check-types
git add control-panel/packages/api/src/core-bridge/safe-update.ts control-panel/packages/api/src/core-bridge/safe-update.test.ts
git commit -m "feat(api): safe-update compound job (backup → update → smoke+TTFB → auto-rollback)"
```

---

### Task 12: `safeUpdate` procedure + bulk sequencing

**Files:**
- Modify: `routers/plugins.ts` (+`safeUpdate`, `safeUpdateAll`), `plugins.test.ts`

**Interfaces:**
- Produces: `pluginsRouter.safeUpdate` input `{ siteId, target: {kind,slug?} }` → `{ jobId }` (operator). `safeUpdateAll` input `{ siteId }` runs `target: { kind: "allPlugins" }` (the bin op `wp plugin update --all` already updates sequentially server-side; one batch backup wraps it).

> **R2 + siteUrl resolution.** Read `r2` and `siteUrl` once before calling `startSafeUpdate`: `siteUrl` from `siteInventory(...).site_url` (or the site's prod `WP_HOME` via the existing `env` op), `r2` from whether the site's backup destination is configured (mirror how `backupsRun` decides local vs both — if there is no panel-side R2 flag, default `r2: false` so safe-update uses `backupLocal`, which is env-immune and always safe).

- [ ] **Step 1: Write failing test** (append `plugins.test.ts`): mock `startSafeUpdate` (`vi.mock("../core-bridge/safe-update", …)`), call the `safeUpdate` handler with `{ siteId, target: { kind: "plugin", slug: "akismet" } }`, expect `startSafeUpdate` called with that target + `userId`.

- [ ] **Step 2: Run — verify fails.** → FAIL.

- [ ] **Step 3: Implement** in `plugins.ts`:

```ts
import { startSafeUpdate } from "../core-bridge/safe-update";

  safeUpdate: procedureFor("safeUpdate")
    .input(z.object({
      siteId: z.string(),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("plugin"), slug: z.string() }),
        z.object({ kind: z.literal("theme"), slug: z.string() }),
        z.object({ kind: z.literal("core") }),
      ]),
    }))
    .handler(async ({ input, context }) => {
      if ("slug" in input.target) assertSlug(input.target.slug, input.target.kind);
      const { siteUrl, r2 } = await resolveSafeUpdateContext(input.siteId);
      return startSafeUpdate({
        siteId: input.siteId, env: "prod", target: input.target,
        userId: context.session.user.id, siteUrl, r2,
      });
    }),

  safeUpdateAll: procedureFor("safeUpdate")
    .input(z.object({ siteId: z.string() }))
    .handler(async ({ input, context }) => {
      const { siteUrl, r2 } = await resolveSafeUpdateContext(input.siteId);
      return startSafeUpdate({
        siteId: input.siteId, env: "prod", target: { kind: "allPlugins" },
        userId: context.session.user.id, siteUrl, r2,
      });
    }),
```
Add the `resolveSafeUpdateContext(siteId)` helper in the same file (or `core-bridge/safe-update.ts`) using the existing `findSite` + `siteInventory`/`env` op as described in the note. Keep it ≤ a few lines; default `r2:false` if unknown.

- [ ] **Step 4: Run — verify passes.** → PASS.

- [ ] **Step 5: Typecheck + full test + commit**

```bash
cd control-panel && bun run check-types && bun run test
git add control-panel/packages/api/src/routers/plugins.ts control-panel/packages/api/src/routers/plugins.test.ts
git commit -m "feat(api): safeUpdate + safeUpdateAll procedures (operator, sequential bulk)"
```

---

## Phase 6 — UI (mirror existing per-site + live-operation patterns)

> **Before starting Phase 6:** read an existing per-site page under `control-panel/web/src/routes/_auth/sites/$siteId/` (e.g. the Settings or Updates page), the live-operation component (`web/src/lib/live/` + `live-operation.tsx`), and how a router mutation is called from the web (the oRPC/TanStack Query client). Mirror those exactly — the snippets below show the data wiring, not the house styling.

### Task 13: Plugins table

**Files:**
- Create: `control-panel/web/src/components/plugins/plugins-table.tsx`
- Modify: per-site route to mount it (new "Plugins" tab/section)

**Interfaces:**
- Consumes: `client.siteInventory({ siteId })` → `SiteInsights` (use `.plugins`); mutations `client.pluginActivate/Deactivate/Update/Delete/pluginAutoUpdate({ siteId, slug, … })`; `client.safeUpdate({ siteId, target })`.

- [ ] **Step 1:** Build a table from `siteInventory().plugins`. Columns: Name (+slug muted), Status badge (`active`/`inactive`/`must-use`/`dropin`), Version (show `version → new_version` amber when `update_available`), Auto-update toggle (calls `pluginAutoUpdate`, `null` renders as "WP default (off)"), Actions menu (Activate/Deactivate/Update/Update safely/Delete). Suppress Activate/Deactivate for `must-use`/`dropin`. Show Delete only to admins (gate on the session role from the existing auth context; the server enforces it regardless).
- [ ] **Step 2:** Above the table: "Update all (safely)" primary (→ `safeUpdateAll`) and "Update all" secondary (→ existing `updatesApply({what:"plugins"})`). No "Add plugin" button (install dropped). Add a one-line helper: "Install new plugins from wp-admin → Plugins → Add New."
- [ ] **Step 3:** Streaming actions (update/delete/safe-update) open the existing live-operation view via the returned `{ jobId }`. Non-streaming (auto-update toggle) shows an inline pending/þ state and refetches `siteInventory` on success.
- [ ] **Step 4:** `cd control-panel && bun run check && bun run check-types && bun run build` → PASS.
- [ ] **Step 5: Commit** `feat(web): plugins management table (inventory-driven, per-row actions)`.

### Task 14: Themes table

**Files:** Create `control-panel/web/src/components/plugins/themes-table.tsx`; mount alongside plugins.

- [ ] **Step 1:** Mirror Task 13 from `siteInventory().themes`. No Deactivate. `activate` only on inactive themes (one active at a time). Delete admin-only and suppressed for the active theme.
- [ ] **Step 2:** Wire `themeActivate/Update/Delete/themeAutoUpdate` + `safeUpdate({target:{kind:"theme",slug}})`.
- [ ] **Step 3:** `cd control-panel && bun run check && bun run check-types && bun run build` → PASS.
- [ ] **Step 4: Commit** `feat(web): themes management table (parity, no deactivate)`.

### Task 15: Core update card + auto-update schedule control

**Files:** Create `control-panel/web/src/components/plugins/core-update-card.tsx`; mount on the Plugins page.

- [ ] **Step 1:** From `siteInventory().wp_core`: show current version; if `update_available`, show `→ new_version` and two buttons — "Update" (`updatesApply({what:"core"})`) and "Update safely" (`safeUpdate({target:{kind:"core"}})`, the recommended default). Both open the live-operation view.
- [ ] **Step 2:** "Scheduled plugin auto-updates" selector (Off / Weekly / Daily) → `setAutoUpdateSchedule({ siteId, cadence })`; reflect the current value (best-effort: from a future `schedule-status` field or local state after save).
- [ ] **Step 3:** Core auto-update display: show `siteInventory().signals.auto_update_core` (minor/major/off) read-only for now (writing `WP_AUTO_UPDATE_CORE` via `site-config-apply` is a follow-up; do not block this task on it).
- [ ] **Step 4:** `cd control-panel && bun run check && bun run check-types && bun run build` → PASS.
- [ ] **Step 5: Commit** `feat(web): core update card + scheduled auto-update control`.

---

## Phase 7 — VPS validation

### Task 16: End-to-end validation on the disposable VPS

**Files:** none (validation only). Deploy the branch + a live site, then run the checklist. Record results in the PR.

- [ ] Deploy the branch to the test VPS; ensure a live site with the #3 insights mu-plugin active and a fresh `insights.json`.
- [ ] `wp plugin activate` / `deactivate` round-trip on a real plugin (via the panel).
- [ ] `wp plugin update` on a single plugin with an available update.
- [ ] `wp plugin delete` on an inactive plugin (admin account).
- [ ] `wp theme activate` + `update`.
- [ ] Auto-update toggle: enable → confirm on the host `wp plugin auto-updates status`; disable → revert.
- [ ] `setAutoUpdateSchedule weekly` → `systemctl list-timers | grep vibe-wp-autoupdate`.
- [ ] Safe-update success: fresh backup listed, update applied, smoke passes, snapshot retained.
- [ ] Safe-update rollback: temporarily break smoke (e.g. point homepage at a broken state), trigger safe-update, confirm auto-restore + post-restore smoke pass.
- [ ] Role checks: an operator account can update (plugin/theme/core) + safe-update; the operator account is rejected from delete + standalone restore.
- [ ] Run the §10.1 injection vectors against the live wrapper binary; confirm `wp plugin install …`, metacharacter slugs, `--path=`, and blocked verbs all die.
- [ ] Confirm the 4 legacy forms still work live (update count, update-all, core update, insights refresh).
- [ ] **Commit** any fixes found; record `VPS-Validated: <date>` in the PR. The wrapper security review (Task 3) must be green before merge.

---

## Self-Review (run before execution)

**Spec coverage:** allowlist widening (T2), VIBE_OPS (T4), panel slug validation (T5), per-item plugin ops (T6), theme parity (T7), auto-update toggles (T6/T7), scheduled auto-updates (T9/T10), safe-update job (T11/T12), plugins/themes UI (T13/T14), core update card (T15), security review gate (T3), injection suite (T2 + T16). Core auto-update *write* (`WP_AUTO_UPDATE_CORE`) is intentionally display-only here (noted T15.3) — a small follow-up, not a gap in the core feature.

**Type consistency:** `VibeOp` keys in T4 match the ops referenced in T6/T7/T11. `WP_ACTION_TIERS` keys (`plugin.activate`, …, `core.update`, `safeUpdate`, `schedule.autoUpdate`) in T5 match every `procedureFor(...)` call in T6/T7/T10/T12. `startJob` input shape matches `StartJobInput` (jobs.ts). `buildSafeUpdateStream` deps/return match `launchJob`'s `produce` contract.

**Placeholder scan:** none. The oRPC handler-invocation form (`["~orpc"].handler({ context, input })`) is confirmed against `routers/setup.test.ts`. Two items are deliberately deferred-with-rationale, not placeholders: `WP_AUTO_UPDATE_CORE` write (display-only here, T15.3) and the exact `r2`/`siteUrl` resolution (T12 note — mirror `backupsRun`, default `r2:false` → `backupLocal`). Phase 6 UI snippets intentionally show data wiring (the exact tRPC calls) and direct the implementer to mirror the existing per-site/live-operation components for styling — read those first (called out at the Phase 6 header).
