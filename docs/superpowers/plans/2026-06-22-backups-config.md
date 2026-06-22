# Backups Configuration & Destinations — Implementation Plan

> **For agentic workers:** built phase-by-phase via dispatched agents (sequenced — phases share `backups.ts`/`exec.ts`/db). Each phase gates (`check-types`/`check`/`test`/`build`) + commits.

**Goal:** Configure off-site (R2) backups from the panel UI (global creds + per-site folder, stored in `panel.db`), choose a backup's destination (local / local+off-site) from the "Back up now" control, and show honest backup listing data (real size, location, verified).

**Why:** Today R2 is configured only by hand-editing each site's `env/prod.env` (which broke test2 — a dead MinIO endpoint); the "Back up now" button has no destination choice; and the Backups list shows fake `0 MB` / always-`local` / always-`✓`.

**Tech:** Bun · oRPC · Drizzle/libsql (`panel.db`) · React/TanStack · shadcn/ui · the exec chokepoint.

## Global constraints
- TABS; TS/TSX ≤220 lines; no `any`; shadcn/semantic tokens only; exec layer is the only host-spawn site (R2 config is injected as env into `bin/vibe`, never interpolated into argv).
- **Secrets:** the R2 secret lives in `panel.db` (already `chmod 600`, holds auth hashes). It is **write-only** over the API — read procedures return a `hasSecret` boolean, never the secret value. Never logged (redaction covers env-echo).
- Gate each phase: `bun run check-types` && `bun run check` && `bun run test` && `bun run build`.

## Data model (panel.db)
New schema `packages/db/src/schema/backups.ts`, table `backup_config` keyed by `siteId` (TEXT PK). The literal **`"__global__"`** row holds the shared default creds; per-site rows hold per-site bits and may override. Columns (all nullable except `siteId`):
`provider` · `endpoint` · `accessKeyId` · `secret` · `bucket` · `prefix` · `enabled` (int 0/1) · `retention` (int).
- **Resolver** `resolveBackupConfig(siteId)`: read the `__global__` row and the site row; the effective config = site value ?? global value, field by field; `prefix` defaults to `<global-prefix?>/<site-domain>` (site domain from `findSite`); `enabled` from the site row.
- Effective config → env map: `VIBE_BACKUP_R2_ENABLED/BUCKET/PREFIX` + `RCLONE_CONFIG_R2_TYPE=s3`/`PROVIDER`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`ENDPOINT`.

## Phases

### Phase 1 — backend foundation
- `schema/backups.ts` (`backupConfig` table) + wire into `db/index.ts`; `bun run db:push`.
- `core-bridge/backup-config.ts`: `getBackupConfig(siteId)` (raw rows), `setBackupConfig(siteId, patch)` (upsert; secret only overwritten when a non-empty value is supplied), `resolveBackupConfig(siteId)` (merge → effective), `backupConfigEnv(siteId)` (effective → env map). Pure-ish; unit-test the merge + env mapping with injected rows.
- `core-bridge/exec.ts`: add `env?: Record<string, string>` to `runVibe`/`streamVibe` opts → `Bun.spawn(argv, { …, env: { ...process.env, ...opts.env } })`. (Unchanged when no env.)
- `core-bridge/jobs.ts`: `StartJobInput` gains optional `env?: Record<string,string>`; pass to `streamVibe`.
- `routers/settings.ts`: `backupConfigGet({siteId})` (admin; returns site+global with secret masked → `hasSecret: boolean`), `backupConfigSet({siteId, ...fields})` (admin; upsert), `backupConfigTest({siteId})` (admin; runs `rclone lsd` via a new allowlisted op with the resolved env, returns `{ ok, message }`). Wire into `routers/index.ts`.
- `backups.ts`: `backupsRun` resolves `backupConfigEnv(siteId)` and passes it via `startJob({…, env})`; `backupsList` passes the env to `runVibe`.

### Phase 2 — Settings UI (R2 config)
- On `/settings`: a **global** R2 card (provider/endpoint/accessKey/secret[masked]/bucket; Save) + a **per-site** section (pick site or current-site context: enabled toggle, folder/prefix defaulting to site domain, retention; Save) + a **Test connection** button per scope. Secret field shows "•••• set" when `hasSecret`, replaceable. Uses `backupConfigGet/Set/Test`.

### Phase 3 — honest backups listing
- Backend: the backups listing emits real **size** (per-dir bytes — `du -sb` or summing, surfaced through a richer listing op or computed in `backupsList`) and the panel cross-references the **R2 remote** (`rclone lsf` via the resolved env) to mark `local`/`offsite`/`both`; **verified** = a cheap "complete" check (manifest + both archives present) — or drop the column.
- `parseBackups` / `BackupRecord` updated to carry real `sizeMB`, `location`, `verified`.
- Web: invalidate/refetch the backups query after a backup job completes (fixes the stale count). Surface **retention** as an editable setting (Settings) reusing the config store.

### Phase 4 — destination menu
- "Back up now" becomes a menu: **Local only** · **Local + off-site**. Off-site entries disabled with "Configure R2 in Settings" when the resolved config isn't enabled/complete. The choice maps to the backup run (e.g. an input flag → env `VIBE_BACKUP_R2_ENABLED` for that run, overriding the stored default for the one-off).

## VPS validation (final)
Configure R2 in Settings → Test connection green → "Back up now → Local + off-site" → real progress + the backup lands locally **and** on R2 → the list shows real size + `both` + verified → retention respected → no concurrent same-site backup.
