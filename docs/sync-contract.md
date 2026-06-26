# Vibe WP Sync Contract

Status: current pre-Tauri contract, 2026-06-26.

This document describes the sync behavior that exists now and the contract any
future desktop/local sync must follow. It intentionally does not define Tauri UI.

## Current Safe Primitives

- `bin/stage-refresh` refreshes staging from production. It takes a production
  backup, restores that backup into staging with `--old-url` / `--new-url`,
  marks staging as staging/noindex, and runs smoke.
- `bin/stage-promote-files` promotes only managed WordPress files:
  `plugins`, `themes`, and `mu-plugins`. It does not copy database content or
  uploads. It normalizes managed file ownership/permissions before restart/smoke.
- The panel `stagingPushToLive` job wraps managed-file promotion in a production
  snapshot, promote with script backup suppressed, production verification, and
  automatic restore on promote or verification failure.
- The raw `stagingPromote` API route is disabled and fails closed.

## Current Panel Plan/Apply Flow

- `stagingSyncPlan` is read-only. It returns:
  - direction: `refreshFromProd` or `pushFilesToLive`
  - source/target env, URL, and Compose project
  - scope
  - required production backup timing
  - blocking identity conflicts
  - apply procedure and required role
  - deterministic plan id
  - `createdAt`, `expiresAt`, and freshness metadata
  - URL rewrite preview
  - exact URL rewrite occurrence count when the host dry-run count succeeds
- `stagingSyncApplyPlan` is the only plan-backed apply endpoint. It requires an
  issued, non-expired plan id, recomputes the plan immediately, rejects stale or
  changed plans, enforces operator/admin role requirements, then starts only the
  existing safe refresh or safe push-to-live job.
- URL occurrence counts come from `bin/vibe <env> url-rewrite-count <OLD> <NEW>`,
  which runs WP-CLI `search-replace` with `--dry-run`, the same table/precision
  shape as restore, and prints only the numeric count. The op is allowlisted in
  `core-bridge/exec.ts` and revalidated in `bin/vibe-panel-run`.

## VPS Proof - 2026-06-26

- `refresh-from-prod --yes` took a production backup, restored it into staging,
  rewrote URLs, and passed staging smoke.
- Direct `promote-files-to-prod --yes` took a production safety backup, promoted
  managed files, and passed production smoke.
- Panel `stagingPushToLive` failed on a forced ownership/permission issue,
  auto-restored the captured production snapshot, and passed post-restore smoke.
- After fixing ownership normalization, panel `stagingPushToLive` succeeded with
  one production snapshot, promote `--no-backup`, production smoke, and homepage
  TTFB verification.
- Authenticated browser proof covered sign-in, site discovery, staging
  navigation, destructive confirmation, operations tray/dialog, realtime steps,
  and terminal completion.

## Required Future Local/Desktop Contract

Every future local pull/push direction must expose a structured plan before
apply and revalidate before changing anything:

```json
{
  "direction": "refreshFromProd",
  "source": { "env": "prod", "url": "https://example.com", "project": "vibe-wp-site-prod" },
  "target": { "env": "stage", "url": "https://stage.example.com", "project": "vibe-wp-site-stage" },
  "scope": ["database", "uploads", "plugins", "themes", "mu-plugins"],
  "urlRewrite": {
    "required": true,
    "from": "https://example.com",
    "to": "https://stage.example.com",
    "estimatedOccurrences": 42
  },
  "backup": { "env": "prod", "required": true, "timing": "before-change" },
  "conflicts": [],
  "apply": { "procedure": "stagingRefresh", "requiresRole": "operator" }
}
```

Apply rules:

- Apply requires the current plan id or an equivalent full plan payload.
- Apply recomputes source/target identity and rejects drift before changes.
- Apply takes a backup before changing a non-disposable target.
- URL rewrites reject equal source/target URLs and never run without both URLs.
- Secret material is never part of a plan, diff, log stream, or support bundle.
- Destructive apply needs GUI confirmation or reviewed/headless `--yes`.
- Streams should be JSON/NDJSON or structured job events, with redacted log
  lines only as supporting detail.

## Conflict Checks

Minimum conflicts before any future desktop/local pull or push:

- Source and target URL, env, or Compose project are identical.
- Required staging/local target is missing.
- Another job is running for the same site.
- Required backup cannot be created or verified.
- Production changed after the last staging/local refresh.
- Target is older than the configured freshness window.
- Plugin/theme inventories differ outside the selected direction's scope.
- Database/content drift exists but the selected direction only copies files.

## Not Built

- Local pull/push sync.
- Desktop/Tauri sync UI.
- Multi-server sync.
