# Control Panel Realtime Invalidation Map

Date: 2026-06-26

This map is grounded in the current `control-panel` code. It covers the web
mutation surfaces, tracked job kinds, backend side effects, and TanStack Query
keys that need to refresh without requiring a browser reload.

## Audited Surfaces

- Web mutation and job starters:
  - `control-panel/web/src/components/**`
  - `control-panel/web/src/routes/**`
  - `control-panel/web/src/features/setup/**`
- Query helpers:
  - `control-panel/web/src/data/queries.ts`
- Live operation infrastructure:
  - `control-panel/web/src/lib/operations/operations-provider.tsx`
  - `control-panel/web/src/components/patterns/live-operation.tsx`
  - `control-panel/web/src/components/patterns/operations-tray.tsx`
- Backend routers:
  - `control-panel/packages/api/src/routers/**`
- Job launch and persistence:
  - `control-panel/packages/api/src/core-bridge/jobs.ts`
  - `control-panel/packages/api/src/core-bridge/jobs-db.ts`
  - compound job builders in `safe-update.ts`, `staging-push.ts`, `perf-apply.ts`,
    and `provision-job.ts`

## Current Realtime Shape

The panel already has live operation streams. Tracked jobs are persisted and
audited before the host command starts, streamed through `operationsStream`, then
finished in `jobs`. The web UI records local active operation state through
`OperationsProvider`.

The missing piece is a central query refresh layer. `LiveOperation` and
`OperationsTray` observe terminal job status, but they only call
`finish(jobId, status)`. They do not translate a completed job into invalidating
the affected oRPC/TanStack queries.

## Query Groups

Use these groups to keep implementation readable. In code, dynamic query families
such as logs, backup contents, and operations history should be invalidated with
a predicate, not only with one exact helper call.

| Group | Query helpers / keys | Current consumers | Backend source |
| --- | --- | --- | --- |
| `operations` | `operationsListQuery()` and every `operationsListQuery({ siteId })` | Operations page; future scoped history | `jobsHistory()` DB rows and audit join |
| `site-list` | `sitesQuery()` | Sites page, switcher, command menu, settings, staging, monitoring | `detectSites()` plus each site's backup listing |
| `server-summary` | `serverInfoQuery()` | Sites page, Server page | `detectSites()`, `df`, hostname, all-site smoke checks |
| `server-security` | `securityStatusQuery()` | Server page; also feeds site overview/security score indirectly | host `securityStatus` |
| `site-overview` | `siteOverviewQuery(siteId)` | Site overview | smoke, backups, plugin update count, monitor, security-status, recent audit |
| `site-status` | `siteStatusQuery(siteId)` | Site cards | smoke check |
| `health` | `healthQuery(siteId)` | Health page | monitor op plus resolved notify config |
| `health-perf` | `healthPerfQuery(siteId)` | Health page perf report | perf report op |
| `perf-advice` | `perfAdviceQuery(siteId)` | Performance advisor card | perf measure plus env read |
| `logs` | every `logsQuery(siteId, params)` | Logs page recent logs | docker/compose logs via `logsRecent` |
| `dev-info` | `devInfoQuery(siteId)` | Developer details | compose ps plus selected env keys |
| `backup-list` | `backupsQuery(siteId)` | Backups page | backup listing op |
| `backup-contents` | every `backupContentsQuery(siteId, backupId)` | Backup browser | archive/table listing |
| `offsite-verified` | `offsiteVerifiedQuery(siteId)` | Off-site verified banner | `backup_verification` DB table |
| `backup-config` | `backupConfigQuery("__global__")`; every `backupConfigQuery(siteId)` | Settings R2; Backup menu; per-site R2 | config DB plus resolved global/site rows |
| `staging` | `stagingQuery(siteId)` | Staging page, attach-staging dialog | stage env file |
| `inventory` | `inventoryQuery(siteId)` | Inventory page | Insights drop-file |
| `updates` | `updatesAvailableQuery(siteId)` | Overview page | `wpPluginUpdates` count |
| `security-score` | `securityScoreQuery(siteId)` | Security score card | Insights plus host security-status |
| `security-radar` | `securityRadarQuery(siteId)` | Security radar card | Insights plus vuln feed |
| `site-settings` | `siteSettingsQuery(siteId)` | Site settings, backup schedule | schedule status plus selected env values |
| `notify-config` | `notifyConfigQuery("__global__")` | Settings notifications | notify config DB |
| `smtp-config` | `smtpConfigQuery("__global__")` | Settings mail | SMTP config DB |
| `shared-db` | `sharedDbStatusQuery()` | Server page, provisioning database step | shared DB status bridge |
| `panel-access` | `panelAccessQuery()` | Setup and Server panel domain card | derived panel URL/domain/IP |
| `panel-domain-preflight` | `dnsPreflightQuery(domain)`; `setupPanelDnsPreflightQuery(domain)` | Panel domain forms in Settings and setup | DNS lookup plus server IP comparison |
| `setup-state` | `needsSetupQuery()` | Login/setup routing | admin count |
| `monitoring` | `monitoringOverviewQuery()`; `monitoringHistoryQuery(siteId, days)`; future `monitoringSummaryQuery()` | Monitoring pages | monitor sample DB |
| `users` | `["admin", "listUsers"]` | Users page | Better Auth admin list users |
| `self-sessions` | `["self", "sessions"]` | Profile sessions card | Better Auth self sessions |
| `auth-session` | Better Auth session hook/cache | user menu, role-gated UI, profile | Better Auth session |

## Universal Job Rules

These rules apply to every tracked job launched through `startJob`,
`launchJob`, `startProvisionJob`, `startSafeUpdate`, `startStagingPushToLive`,
`startPerfApply`, or `launchPanelUpdateJob`.

| Event | Required invalidation |
| --- | --- |
| Job start | `operations` because `persistJobStart()` writes the job row. |
| Job start with a site id other than `server` | `site-overview(siteId)` because `writeAudit()` is read by `recentAudit(site.id)` in the overview activity timeline. |
| Job terminal status | `operations` because `persistJobFinish()` changes status, exit code, and finish time. |
| Job terminal status with a site id other than `server` | `site-overview(siteId)` again because the overview aggregates live state and activity. |

Do not make these success-only. Several compound jobs can create a backup or
write logs before failing or being canceled. Refreshing authoritative reads on
any terminal state is safer than trying to infer side effects from the status.

## Tracked Job Map

The `UI kind` column is what the web passes to `useOperations().start()`.
The `DB kind` column is what the backend persists in `jobs.kind`. Some differ
today, and the invalidation layer must handle both.

| Procedure / source | UI kind | DB kind | Side effect from current code | Refresh on terminal |
| --- | --- | --- | --- | --- |
| `lifecycleUp` from `SiteControls` and PHP rebuild | `up` | `up` | Starts/rebuilds the site's prod stack. | universal, `site-status`, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `server-summary` |
| `lifecycleRestart` from `SiteControls`, debug/security fix actions | `restart` | `restart` | Restarts the site containers. | universal, `site-status`, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `server-summary`, `inventory`, `security-score`, `security-radar` |
| `lifecycleCacheFlush` from `SiteControls` | `cacheFlush` | `cacheFlush` | Flushes site cache. | universal, `health-perf`, `perf-advice`, `logs` |
| `lifecycleNginxRecreate` from FastCGI cache card | `nginxRecreate` | `nginxRecreate` | Recreates nginx so env-rendered config applies. | universal, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `site-status`, `server-summary` |
| `lifecycleDown` from `SiteControls` | `down` | `down` | Stops the site containers. | universal, `site-status`, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `server-summary` |
| `backupsRun` from overview/backups page | `backup` | `backup` | Creates a local or local-plus-off-site backup. | universal, `backup-list`, `backup-contents` for that site, `site-list`, `server-summary`, `logs` |
| `backupsVerify` | `backupVerify` | `backupVerify` | Verifies a backup and records `backup_verification` on finish. | universal, `offsite-verified`, `backup-list`, `logs` |
| `backupsRestore` | `restore` | `restore` | Restores a whole backup. | universal, `site-status`, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `inventory`, `updates`, `security-score`, `security-radar`, `server-summary` |
| `restoreBackupItem` from backup browser | `restoreItem` | `restoreItem` | Restores one file or table from a backup. | universal, `health`, `health-perf`, `perf-advice`, `logs`, `inventory`, `security-score`, `security-radar` |
| `updatesApply({ what: "core" })` | `wpUpdate` | `wpUpdate` | Runs WordPress core update. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `updatesApply({ what: "plugins" })` | `wpUpdate` | `wpUpdate` | Updates all plugins. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `pluginActivate` | `wp:plugin` | `wpPluginActivate` | Activates one plugin. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status` |
| `pluginDeactivate` | `wp:plugin` | `wpPluginDeactivate` | Deactivates one plugin. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status` |
| `pluginUpdate` | `wp:plugin` | `wpPluginUpdate` | Updates one plugin. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `pluginDelete` | `wp:plugin` | `wpPluginDelete` | Deletes one plugin. | universal, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `pluginAutoUpdate` | `wp:plugin` | `wpPluginAutoUpdate` | Enables/disables one plugin's WP auto-update flag. | universal, `inventory`, `security-score`, `security-radar`, `logs` |
| `themeActivate` | `wp:theme` | `wpThemeActivate` | Activates one theme. | universal, `inventory`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status` |
| `themeUpdate` | `wp:theme` | `wpThemeUpdate` | Updates one theme. | universal, `inventory`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `themeDelete` | `wp:theme` | `wpThemeDelete` | Deletes one theme. | universal, `inventory`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `themeAutoUpdate` | `wp:theme` | `wpThemeAutoUpdate` | Enables/disables one theme's WP auto-update flag. | universal, `inventory`, `security-score`, `security-radar`, `logs` |
| `safeUpdate` / `safeUpdateAll` | `safeUpdate` | `safeUpdate` | Takes a local backup, applies core/plugin/theme update, verifies, and may roll back. | universal, `backup-list`, `backup-contents`, `site-list`, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `stagingRefresh` | `refresh` | `refresh` | Copies live to staging. | universal, `staging`, `logs`, `server-summary` |
| `stagingPushToLive` | `stagingPushToLive` | `stagingPushToLive` | Takes prod backup, promotes staging to live, verifies, and may roll back. | universal, `staging`, `backup-list`, `backup-contents`, `site-list`, `inventory`, `updates`, `security-score`, `security-radar`, `health`, `health-perf`, `perf-advice`, `logs`, `site-status`, `server-summary` |
| `createSite`, `createExternal`, `createSharedDb` | `provision` | `provision` | Creates a new site through installer headless state. | universal for the new site id, plus `site-list`, `server-summary`, `shared-db`, `monitoring`, `panel-access` |
| `attachStaging` | `attachStaging` | `attachStaging` | Adds staging env/domain for an existing site. | universal, `staging`, `site-list`, `server-summary`, `logs` |
| `removeSite` | `removeSite` | `removeSite` | Removes or purges an existing site. | universal, `site-list`, `server-summary`, `monitoring`, `shared-db`, and remove all cached query families scoped to the removed `siteId` |
| `serverHarden` | `harden` | `harden` | Runs host-level hardening against `PANEL_HOST_DIR`. | `operations`, `server-security`, `server-summary`, every active `site-overview`, every active `security-score` |
| `serverUpdateStack` | `panel-update` | `panel-update` | Updates the Vibe WP stack and panel; may restart the panel. | `operations`, then invalidate all active queries if the app remains mounted after reconnect |
| `perfApply` | `perfApply` | `perfApply` | Takes backup, writes perf env settings, recreates/restarts, health-checks, and may roll back. | universal, `backup-list`, `backup-contents`, `site-list`, `site-settings`, `health`, `health-perf`, `perf-advice`, `logs`, `dev-info`, `site-status`, `server-summary` |

## Immediate oRPC Mutation Map

These procedures do not create tracked jobs. They should invalidate on successful
mutation completion.

| Procedure / source | Side effect from current code | Refresh on success |
| --- | --- | --- |
| `refreshInventory` from Inventory/Security cards | Runs `insightsRefresh` and writes/updates the Insights drop-file. | `inventory`, `updates`, `security-score`, `security-radar`, `site-overview` |
| `setAutoUpdateSchedule` | Applies plugin auto-update schedule through `autoUpdateScheduleApply`. | No current read query exposes the saved cadence. If a read model is added, invalidate it here. Also refresh `inventory` only if the collector reports schedule state in Insights later. |
| `backupConfigSet("__global__")` | Saves global R2 credentials and applies resolved config to affected site env files. | `backup-config` for `__global__` and every active site-specific `backupConfigQuery(siteId)` because each response includes both `site` and `global`. Also refresh backup menus using those keys. |
| `backupConfigSet(siteId)` | Saves per-site R2 enable/prefix/retention and applies to that site's env. | `backup-config(siteId)` and any active backups page backup menu for that site. |
| `backupConfigTest` | Runs a connection test only. | None. |
| `notifyConfigSet("__global__")` | Saves alert channels and applies them to every real site env. | `notify-config`, every active `healthQuery(siteId)` because health report displays resolved alert channels. |
| `notifyTest` | Sends a test alert only. | None. |
| `smtpConfigSet("__global__")` | Saves SMTP relay config and applies it to every real site env. | `smtp-config`. No current query reads per-site SMTP state. |
| `smtpTest` | Sends a test email only. | None. |
| `siteBackupScheduleSet` | Rewrites the scheduled-backup systemd timer. | `site-settings(siteId)`. |
| `siteMonitorSet` | Enables/disables the hourly monitor timer. | `site-settings(siteId)`. |
| `siteDebugSet` | Writes debug env flags; returned `restartRequired` means runtime changes after restart. | Immediate: `site-settings(siteId)`. If restart is started and completes, use the `restart` job map. |
| `sitePhpImageSet` | Writes `WORDPRESS_IMAGE`; returned `rebuildRequired` means runtime changes after `up`. | Immediate: `site-settings(siteId)`. If rebuild starts and completes, use the `up` job map. |
| `siteFastcgiCacheSet` | Writes FastCGI cache env flag; returned `recreateRequired` means runtime changes after nginx recreate. | Immediate: `site-settings(siteId)`. If recreate starts and completes, use the `nginxRecreate` job map. |
| `siteWwwAliasSet` | Edits Caddy address line and hot-reloads Caddy. | `site-settings(siteId)`, `health(siteId)`, `site-overview(siteId)` because monitor/Caddy reachability can change. |
| `applySecurityFix` | Writes XML-RPC/file-edit hardening env flag; runtime changes after restart and next Insights collection. | Immediate: `security-score(siteId)` and `site-settings(siteId)` if active. After restart plus inventory refresh, use `restart` and `refreshInventory` maps. |
| `monitoringSummary` | Records fresh monitor samples for every detected site, then returns summary. | `monitoringOverview`, every active `monitoringHistoryQuery(siteId, days)`, every active `site-overview(siteId)`, every active `healthQuery(siteId)`. |
| `monitoringRecordSample(siteId)` | Records one fresh monitor sample. | `monitoringHistory(siteId, *)`, `monitoringOverview`, `site-overview(siteId)`, `health(siteId)`. |
| `sharedDbInit` | Initializes the global shared MariaDB project. | `shared-db`, `server-summary`. |
| `sharedDbRotateRoot` | Rotates shared DB root password. | `shared-db`. |
| `panelDomainApply` | Applies an additive custom panel domain and writes trusted origin. | `panel-access`. |
| `setupPanelDomainApply` | Same as `panelDomainApply`, but setup-gated. | `panel-access`. |
| `completeSetup` | Creates first owner account via Better Auth. | `setup-state`, `auth-session` after client sign-in. |
| `supportBundleDownload` | Writes a server audit row and returns a file. | None in current UI; no query currently displays server audit rows without jobs. |
| `logsExport` | Downloads logs only. | None. |

## Better Auth Mutation Map

These are not oRPC procedures and do not enter the operation stream.

| Client call | Current source | Refresh on success |
| --- | --- | --- |
| `authClient.admin.createUser` | Add user dialog | `users` |
| `authClient.admin.setRole` | User role select | `users`; if the changed user is the current session, also `auth-session` |
| `authClient.admin.banUser` | Ban user dialog | `users` |
| `authClient.admin.unbanUser` | User row actions | `users` |
| `authClient.admin.removeUser` | Delete user dialog | `users` |
| `authClient.admin.setUserPassword` | Set password dialog | `users`; if sessions are revoked, affected user's sessions are server-side invalidated |
| `authClient.admin.revokeUserSessions` | User row actions / set password | No list query currently shows another user's sessions; keep toast only. If user list later exposes session state, invalidate `users`. |
| `authClient.updateUser` | Profile details | `auth-session`; also `users` if the Users page is mounted and the current user appears there |
| `authClient.changePassword` | Profile password card | `self-sessions` when `revokeOtherSessions` is true |
| `authClient.revokeSession` | Profile sessions card | `self-sessions` |
| `authClient.revokeOtherSessions` | Profile sessions card | `self-sessions` |
| `authClient.signOut` | User menu | Clear query cache or let route transition discard protected state |

## Cross-Query Effects That Are Easy To Miss

- `siteOverviewQuery(siteId)` is broad. It reads smoke, backups, plugin update
  count, monitor, security status, and recent audit. Most tracked site jobs
  should refresh it.
- `sitesQuery()` is not just a static site registry. It includes `hasStaging` and
  `lastBackupISO`, so backups and compound jobs that take snapshots affect it.
- `serverInfoQuery()` reads disk and all-site smoke state. Backups, creates,
  removes, lifecycle changes, restores, and large updates can affect it.
- `backupConfigQuery(siteId)` includes both the site row and global row. A global
  save must invalidate active site-specific backup config queries.
- `healthQuery(siteId)` displays resolved alert channels, so global notification
  config saves affect health pages even though they are not health operations.
- Plugin/theme action UI uses `wp:plugin` and `wp:theme`, while backend job rows
  persist specific kinds like `wpPluginActivate` and `wpThemeUpdate`. A future
  server-driven realtime layer should use backend kinds; the current local
  operation layer must also understand the UI aliases.
- `operationsListQuery()` is stale today after a live operation finishes unless
  the browser refreshes or the page manually refetches.

## Current Partial Refreshes Already Present

- Backups page polls `backupsQuery(siteId)` while a backup job is running and
  manually refreshes backups/off-site verification after a verify job settles.
- Provision/create and remove flows manually invalidate `sitesList` in their
  local components.
- Attach staging manually invalidates `stagingQuery(siteId)`.
- Inventory refresh manually invalidates `inventoryQuery(siteId)`.
- Security refresh buttons manually invalidate inventory plus their local
  security query.
- Site settings cards manually invalidate `siteSettingsQuery(siteId)` after
  saving.
- Monitoring pages manually invalidate monitoring queries after explicit checks.
- User manager manually invalidates `["admin", "listUsers"]`.
- Sessions card manually invalidates `["self", "sessions"]`.

These are useful, but they are inconsistent and do not cover the general
job-completion path.

## Recommended Implementation Shape

1. Add a central invalidation module in the web app, for example
   `web/src/lib/realtime/invalidation-map.ts`.
2. Represent tracked operation completion as:

   ```ts
   interface OperationInvalidationEvent {
     jobId: string;
     siteId: string;
     uiKind: string;
     status: JobStatus;
   }
   ```

3. Run the map from the two places that currently observe terminal job state:
   `LiveOperation` and `OperationsTray`. Deduplicate by `jobId` so the expanded
   dialog and tray do not double-refresh.
4. Always invalidate `operations` on job start and terminal status. Always
   invalidate `site-overview(siteId)` for non-server jobs on start and terminal
   status.
5. For terminal status, apply the `Tracked Job Map` above. Prefer authoritative
   refetches over hand-patching query data for host state.
6. Add helper invalidators for dynamic families:
   - all `operationsList` query variants
   - all `logsRecent` variants for one site
   - all `listBackupContents` variants for one site
   - all `monitoringHistory` variants for one site
   - all active per-site `backupConfigGet` queries when global config changes
7. Keep immediate non-job mutations explicit. They already know the procedure and
   input, so they can call narrow invalidators directly after success.

## Verification Checklist For Implementation

- Starting and completing any job updates the Operations page without browser
  reload.
- Starting any site job updates the Overview activity timeline without browser
  reload.
- Lifecycle Start/Stop/Restart changes site cards, overview, health, dev details,
  and server summary without browser reload.
- Plugin/theme/core actions update Inventory, Security Score, Security Radar,
  Overview needs, and update counts after the job finishes.
- Backup, verify, restore, safe-update, staging push, and perf apply update backup
  lists and off-site verification where applicable.
- Creating, attaching staging, and removing sites update the site switcher,
  command menu, Sites page, Staging page, and Server summary.
- Global R2 changes update existing per-site backup menus without reload.
- Notification changes update Health alert-channel displays without reload.
- Better Auth user/profile/session actions update their local screens without
  relying on navigation.
