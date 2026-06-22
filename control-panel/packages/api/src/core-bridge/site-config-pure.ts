/**
 * Pure (DB- and IO-free) helpers for per-site settings.
 * Imported by both site-config.ts (exec layer) and tests.
 */

export type BackupCadence = "off" | "daily" | "weekly";
export type MonitorState = "on" | "off";

/** Effective per-site settings surfaced to the panel. */
export interface SiteSettings {
	/** Scheduled-backup cadence, recovered from the systemd timer. */
	backupSchedule: BackupCadence;
	/** WP_DEBUG_DISPLAY — render PHP notices/warnings in the page (unsafe in prod). */
	debugDisplay: boolean;
	/** WP_DEBUG_LOG — write debug messages to debug.log. */
	debugLog: boolean;
	/** Whether the hourly health-monitor timer is enabled. */
	monitorEnabled: boolean;
	/** SCRIPT_DEBUG — load un-minified core CSS/JS. */
	scriptDebug: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/** Interpret an env-style boolean string the way vibe_wp_env_bool does. */
export function envBool(value: string | null | undefined): boolean {
	if (value == null) {
		return false;
	}
	return TRUE_VALUES.has(value.trim().toLowerCase());
}

/**
 * Parse the TAB-separated `schedule-status` output into the full settings
 * shape. Unknown lines are ignored; missing keys fall back to safe defaults.
 */
export function parseScheduleStatus(stdout: string): SiteSettings {
	const settings: SiteSettings = {
		backupSchedule: "off",
		monitorEnabled: false,
		debugLog: false,
		debugDisplay: false,
		scriptDebug: false,
	};
	for (const raw of stdout.split("\n")) {
		const [key, value] = raw.split("\t");
		switch (key) {
			case "backup_schedule":
				settings.backupSchedule =
					value === "daily" || value === "weekly" ? value : "off";
				break;
			case "monitor":
				settings.monitorEnabled = value === "on";
				break;
			case "wp_debug_log":
				settings.debugLog = envBool(value);
				break;
			case "wp_debug_display":
				settings.debugDisplay = envBool(value);
				break;
			case "script_debug":
				settings.scriptDebug = envBool(value);
				break;
			default:
				break;
		}
	}
	return settings;
}

/**
 * Map a WP-debug patch to the env vars site-config-apply consumes. Only the
 * keys the caller actually changed are emitted, and VIBE_SITE_CONFIG_KEYS names
 * exactly those keys so the writer rewrites ONLY them — never a managed key that
 * merely happens to be inherited in the process environment. Returns an empty
 * map (and no VIBE_SITE_CONFIG_KEYS) when nothing changed.
 */
export function debugPatchToEnv(patch: {
	debugLog?: boolean;
	debugDisplay?: boolean;
	scriptDebug?: boolean;
}): Record<string, string> {
	const env: Record<string, string> = {};
	const keys: string[] = [];
	if (patch.debugLog !== undefined) {
		env.WP_DEBUG_LOG = patch.debugLog ? "1" : "0";
		keys.push("WP_DEBUG_LOG");
	}
	if (patch.debugDisplay !== undefined) {
		env.WP_DEBUG_DISPLAY = patch.debugDisplay ? "1" : "0";
		keys.push("WP_DEBUG_DISPLAY");
	}
	if (patch.scriptDebug !== undefined) {
		env.SCRIPT_DEBUG = patch.scriptDebug ? "1" : "0";
		keys.push("SCRIPT_DEBUG");
	}
	if (keys.length > 0) {
		env.VIBE_SITE_CONFIG_KEYS = keys.join(" ");
	}
	return env;
}
