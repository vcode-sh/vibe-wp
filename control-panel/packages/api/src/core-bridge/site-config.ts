/**
 * Per-site settings bridge: reads effective values from the host (systemd
 * timers + the site env file) and applies changes via the single host-exec
 * chokepoint. There is no DB store — the env file and the installed systemd
 * timers are the source of truth, exactly as the runtime contract intends, so
 * the panel and the unattended timers can never disagree.
 *
 * Pure parsing/mapping lives in site-config-pure.ts for DB/IO-free testing.
 */
import { runVibe } from "./exec";
import type {
	BackupCadence,
	MonitorState,
	SiteSettings,
} from "./site-config-pure";
import { debugPatchToEnv, parseScheduleStatus } from "./site-config-pure";
import { findSite } from "./sites";

/**
 * Resolve the effective settings for a site. Returns null when the site is not
 * found in the registry. A single `schedule-status` read reports the backup
 * cadence + monitor state (from the installed systemd timers) and the WP debug
 * flags (from the env file).
 */
export async function getSiteSettings(
	siteId: string
): Promise<SiteSettings | null> {
	const site = await findSite(siteId);
	if (!site) {
		return null;
	}
	const status = await runVibe(site.installDir, "prod", "scheduleStatus");
	return parseScheduleStatus(status.code === 0 ? status.stdout : "");
}

function ensureOk(
	label: string,
	siteId: string,
	result: { code: number; stderr: string; stdout: string }
): void {
	// runVibe never throws on a non-zero exit, so a failed host change would
	// otherwise be reported to the caller as success. Surface it instead.
	if (result.code !== 0) {
		const detail = (result.stderr || result.stdout).trim();
		throw new Error(
			`${label} failed for ${siteId} (exit ${result.code}): ${detail}`
		);
	}
}

/** Install/remove the scheduled-backup timer for the site. */
export async function applyBackupSchedule(
	siteId: string,
	cadence: BackupCadence
): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const result = await runVibe(site.installDir, "prod", "backupScheduleApply", {
		args: [cadence],
		timeoutMs: 30_000,
	});
	ensureOk("backup-schedule-apply", siteId, result);
}

/** Install/remove the hourly health-monitor timer for the site. */
export async function applyMonitorState(
	siteId: string,
	state: MonitorState
): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const result = await runVibe(
		site.installDir,
		"prod",
		"monitorScheduleApply",
		{
			args: [state],
			timeoutMs: 30_000,
		}
	);
	ensureOk("monitor-schedule-apply", siteId, result);
}

/**
 * Persist WP debug flags into the site env file. Returns whether the change
 * needs a container restart to take effect (always true when any flag changed,
 * since wp-config is rendered at container start).
 */
export async function applyDebugFlags(
	siteId: string,
	patch: { debugLog?: boolean; debugDisplay?: boolean; scriptDebug?: boolean }
): Promise<{ restartRequired: boolean }> {
	const env = debugPatchToEnv(patch);
	if (Object.keys(env).length === 0) {
		return { restartRequired: false };
	}
	const site = await findSite(siteId);
	if (!site) {
		return { restartRequired: false };
	}
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env,
	});
	ensureOk("site-config-apply", siteId, result);
	return { restartRequired: true };
}
