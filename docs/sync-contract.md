# Vibe WP Sync Contract

Status: pre-Tauri contract, 2026-06-26.

The current stack has working staging primitives and a read-only panel sync plan.
Desktop/local sync must not reuse opaque text streams directly. Every sync
direction needs a reviewable plan, fresh validation at apply time, and structured
output.

## Current Safe Primitives

- `bin/stage-refresh` copies production to staging by taking a production backup,
  restoring it into staging with `--old-url` / `--new-url`, marking it as staging,
  and running smoke.
- `bin/stage-promote-files` promotes only managed WordPress files:
  `plugins`, `themes`, and `mu-plugins`. It does not copy the database or
  uploads. After import it normalizes those managed directories to
  `www-data:www-data`, directories `755`, and files `644` before restart/smoke.
- The web panel uses `stagingPushToLive`, which takes a local production snapshot,
  promotes staging files with the script backup suppressed, verifies production,
  and auto-restores the snapshot on promote or verification failure.
- The panel API exposes `stagingSyncPlan`, a read-only plan for
  `refreshFromProd` and `pushFilesToLive`. It reads only non-secret env identity
  keys through `bin/vibe env`, reports the source/target environments, required
  backup timing, selected scope, URL rewrite intent, apply role, and blocking
  identity conflicts.
- The raw `stagingPromote` API route is disabled. Use `stagingPushToLive`.

## VPS Proof - 2026-06-26

- `refresh-from-prod --yes` took a production backup, restored it into staging,
  rewrote production URLs to staging URLs, and passed staging smoke.
- Direct `promote-files-to-prod --yes` took a production safety backup, promoted
  managed files, and passed production smoke.
- Panel `stagingPushToLive` first failed on a forced ownership/permission issue,
  then auto-restored the captured production snapshot and passed post-restore
  smoke.
- After fixing managed-file ownership normalization, panel `stagingPushToLive`
  succeeded with one production snapshot, promote `--no-backup`, production
  smoke, and an 81 ms homepage TTFB check.
- Authenticated browser proof covered the staging route from sign-in through the
  destructive publish confirmation, operations tray, active operation dialog,
  realtime step rail, and terminal `[done] Push to live succeeded` line with no
  browser console, page, or request failures. Production runtime doctor and
  production/staging smoke passed afterward.

## Required Plan Shape

Future desktop/local sync entry points should expose the same JSON-style plan
before apply:

```json
{
  "direction": "refreshFromProd",
  "source": { "env": "prod", "url": "https://example.com", "project": "vibe-wp-site-prod" },
  "target": { "env": "stage", "url": "https://stage.example.com", "project": "vibe-wp-site-stage" },
  "scope": ["database", "uploads", "plugins", "themes", "mu-plugins"],
  "urlRewrite": { "required": true, "from": "https://example.com", "to": "https://stage.example.com" },
  "backup": { "env": "prod", "required": true, "timing": "before-change" },
  "conflicts": [],
  "apply": { "procedure": "stagingRefresh", "requiresRole": "operator" }
}
```

## Apply Rules

- Apply must require a completed plan id or equivalent plan payload that is
  revalidated immediately before changes.
- Apply must take a backup before changing the target unless the target is a
  disposable local runtime.
- URL rewrites must reject equal source/target URLs and must never run without
  both URLs.
- Secret material is never part of a plan, diff, or stream: env files, DB
  passwords, Redis passwords, salts, SMTP/R2 keys, tokens, and API keys are out
  of scope.
- Destructive apply needs typed confirmation in GUI and `--yes` only for
  reviewed/headless automation.
- Output should be JSON or NDJSON with redacted log lines, not free-form text as
  the only contract.

## Conflict Checks

Minimum conflicts before any desktop/local pull or push:

- Source and target URL, env, or Compose project are identical.
- Staging is missing for staging-based sync.
- Another job is running for the same site.
- Required backup cannot be created or verified.
- Production changed after the last staging refresh.
- Staging is older than the configured freshness window.
- Plugin/theme inventories differ in a way the selected direction does not cover.
- Database/content drift exists but the selected direction only copies files.

## Pre-Tauri Gaps

- `stagingSyncPlan` exists for staging refresh and managed-file push, but no
  persisted plan id or desktop/local plan endpoint exists yet.
- URL rewrite counts/previews are not surfaced before apply.
- Freshness/drift checks are not persisted across refresh and push.
- Local pull/push is not built; the new local workflow foundation only covers
  inventory/create/reset/delete blueprint state.
