import type { StepDef } from "./steps";

const BACKUP: StepDef[] = [
	{ match: /Dumping MariaDB/i, label: "Dumping database" },
	{ match: /Archiving wp-content/i, label: "Archiving files" },
	{ match: /Backup written/i, label: "Writing backup" },
	{ match: /Uploading|Transferred:/i, label: "Uploading off-site" },
	{
		match: /uploaded to off-server|Verifying remote/i,
		label: "Verifying upload",
	},
];

const RESTORE: StepDef[] = [
	{ match: /Starting required services/i, label: "Starting services" },
	{ match: /Resetting WordPress database/i, label: "Resetting database" },
	{ match: /Restoring database/i, label: "Restoring database" },
	{ match: /Restoring wp-content/i, label: "Restoring files" },
	{ match: /Normalizing/i, label: "Fixing permissions" },
	{ match: /Flushing caches/i, label: "Flushing caches" },
	{ match: /Restore complete/i, label: "Done" },
];

export const GENERIC_STEPS: StepDef[] = [{ match: /./, label: "Working" }];

// Provision step rails. streamProvision (packages/api .../provision-job.ts) emits
// one human line per installer task: `[running] <title>` on start and
// `[<status>] <title>` on result, where <title> is the installer task's `title`
// (install-plan.ts / external-plan.ts / operations-plan.ts). These matchers key
// off those titles so deriveSteps renders named step rows instead of GENERIC_STEPS.

// createSite (new-site) + createExternal (external-services) — both run under the
// `provision` job kind, so one rail covers the union of their task titles.
const PROVISION: StepDef[] = [
	{ match: /Verify DNS/i, label: "Checking DNS" },
	{ match: /Install Docker Engine/i, label: "Installing Docker" },
	{ match: /Install Caddy/i, label: "Installing Caddy" },
	{ match: /Prepare Vibe WP checkout/i, label: "Fetching Vibe WP" },
	{
		match: /Generate (?:production|external) environment/i,
		label: "Writing environment",
	},
	{ match: /Configure HTTPS proxy/i, label: "Configuring HTTPS" },
	{
		match: /Validate (?:production|external) Compose/i,
		label: "Validating Compose",
	},
	{
		match: /Start production|Start WordPress and Nginx/i,
		label: "Starting containers",
	},
	{ match: /Install WordPress/i, label: "Installing WordPress" },
	{ match: /Run (?:production )?smoke test/i, label: "Running smoke test" },
	{ match: /Create first backup/i, label: "First backup" },
	{ match: /Create performance report/i, label: "Performance report" },
];

// attachStaging (staging-only) — buildStagingOnlyTasks task titles.
const ATTACH_STAGING: StepDef[] = [
	{ match: /Verify DNS/i, label: "Checking DNS" },
	{ match: /Generate staging environment/i, label: "Writing staging env" },
	{ match: /Validate staging Compose/i, label: "Validating Compose" },
	{ match: /Add staging HTTPS route/i, label: "Adding HTTPS route" },
	{ match: /Start staging/i, label: "Starting staging" },
];

// removeSite (remove-existing) — buildRemoveTasks task titles. Titles vary with
// the purge flag (Remove vs Disable / Delete site files), matched permissively.
const REMOVE_SITE: StepDef[] = [
	{ match: /Create safety backup/i, label: "Safety backup" },
	{ match: /Stop staging/i, label: "Stopping staging" },
	{ match: /Stop production/i, label: "Stopping production" },
	{
		match: /(?:Remove|Disable) HTTPS route/i,
		label: "Removing HTTPS route",
	},
	{ match: /Delete site files/i, label: "Deleting files" },
];

// stagingPushToLive (safe "Push to live") — buildStagingPushStream emits labelled
// lines: [backup] (taking the pre-promote prod snapshot, incl. "Backup written"),
// [promote] (publishing staging files, incl. "Importing managed"), [smoke]/[ttfb]
// (the prod health check), and on failure [restore] (auto-rollback) lines.
//
// deriveSteps is positional: every step BEFORE the latest matched one renders as
// "done", so this rail stays strictly LINEAR (no mutually-exclusive branches).
// "Rolling back" is the trailing step: on a clean push the auto-restore lines
// never arrive, so it stays pending and "Checking response time" is the last
// active row; on a failed push it becomes the latest match and lights up while
// the earlier rows read done. We deliberately do NOT add a separate success
// terminal — that would falsely render "done" whenever a later rollback matched.
const STAGING_PUSH: StepDef[] = [
	{ match: /\[backup\].*Backup written/i, label: "Backing up live" },
	{ match: /\[promote\].*Importing managed/i, label: "Publishing to live" },
	{ match: /\[smoke\]/i, label: "Running smoke test" },
	{ match: /\[ttfb\].*Homepage/i, label: "Checking response time" },
	{ match: /auto-restoring|Rolled back/i, label: "Rolling back" },
];

export const OP_STEPS: Record<string, StepDef[]> = {
	backup: BACKUP,
	restore: RESTORE,
	provision: PROVISION,
	attachStaging: ATTACH_STAGING,
	removeSite: REMOVE_SITE,
	stagingPushToLive: STAGING_PUSH,
};
