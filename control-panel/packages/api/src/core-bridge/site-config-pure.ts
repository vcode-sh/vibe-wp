/**
 * Pure (DB- and IO-free) helpers for per-site settings.
 * Imported by both site-config.ts (exec layer) and tests.
 */

export type BackupCadence = "off" | "daily" | "weekly";
export type MonitorState = "on" | "off";

/**
 * Curated allowlist of WordPress runtime images the panel may select. A site's
 * PHP version is fixed by WORDPRESS_IMAGE (a Docker build arg), so picking one
 * of these tags and rebuilding is how the operator changes PHP. This list is the
 * TS-side trust boundary; the root shell (bin/site-config-apply) enforces the
 * SAME set independently, because the env file is sourced as root.
 */
export const ALLOWED_WORDPRESS_IMAGES = [
	"wordpress:7.0-php8.5-fpm",
	"wordpress:7.0-php8.4-fpm",
	"wordpress:7.0-php8.3-fpm",
] as const;

export type WordpressImage = (typeof ALLOWED_WORDPRESS_IMAGES)[number];

/** Human label for each selectable image (the PHP version it ships). */
export const WORDPRESS_IMAGE_LABELS: Record<WordpressImage, string> = {
	"wordpress:7.0-php8.5-fpm": "PHP 8.5",
	"wordpress:7.0-php8.4-fpm": "PHP 8.4",
	"wordpress:7.0-php8.3-fpm": "PHP 8.3",
};

/** Exact-membership test against the curated image allowlist. */
export function isAllowedWordpressImage(tag: string): tag is WordpressImage {
	return (ALLOWED_WORDPRESS_IMAGES as readonly string[]).includes(tag);
}

/** Effective per-site settings surfaced to the panel. */
export interface SiteSettings {
	/** Scheduled-backup cadence, recovered from the systemd timer. */
	backupSchedule: BackupCadence;
	/** WP_DEBUG_DISPLAY — render PHP notices/warnings in the page (unsafe in prod). */
	debugDisplay: boolean;
	/** WP_DEBUG_LOG — write debug messages to debug.log. */
	debugLog: boolean;
	/** VIBE_WP_DISABLE_XMLRPC — site-level XML-RPC block. */
	disableXmlRpc: boolean;
	/** DISALLOW_FILE_EDIT — close the WordPress dashboard file editor. */
	disallowFileEdit: boolean;
	/** NGINX_FASTCGI_CACHE — whether anonymous GET/HEAD is page-cached by nginx. */
	fastcgiCache: boolean;
	/** Whether the hourly health-monitor timer is enabled. */
	monitorEnabled: boolean;
	/** SCRIPT_DEBUG — load un-minified core CSS/JS. */
	scriptDebug: boolean;
	/** Current WORDPRESS_IMAGE (fixes the PHP version). Empty when unreadable. */
	wordpressImage: string;
	/**
	 * Whether the host Caddy snippet serves www.<domain> alongside the apex. Read
	 * from the snippet (the single source of truth — there is no env key/DB row),
	 * so an absent www_alias line (or missing snippet) means the alias is off.
	 */
	wwwAlias: boolean;
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
		disableXmlRpc: false,
		disallowFileEdit: false,
		// NGINX_FASTCGI_CACHE defaults to on in the runtime (compose + entrypoint),
		// so an absent fastcgi_cache line means caching is enabled.
		fastcgiCache: true,
		// schedule-status does not report the image; the exec layer fills this in
		// from a separate read-only `env` read (see site-config.ts).
		wordpressImage: "",
		// The www alias lives in the host Caddy snippet, not the env; an absent
		// www_alias line (or no snippet) means the alias is not configured.
		wwwAlias: false,
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
			case "fastcgi_cache":
				// schedule-status emits a literal on|off; treat only "off" as disabled
				// so any unexpected token errs on the runtime default (cache on).
				settings.fastcgiCache = value !== "off";
				break;
			case "www_alias":
				// schedule-status emits a literal on|off; only an explicit "on" enables
				// the alias (absent/off/anything-else -> not configured).
				settings.wwwAlias = value === "on";
				break;
			case "disable_xmlrpc":
				settings.disableXmlRpc = envBool(value);
				break;
			case "disallow_file_edit":
				settings.disallowFileEdit = envBool(value);
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

/**
 * Map a selected image tag to the env vars site-config-apply consumes. Naming
 * WORDPRESS_IMAGE in VIBE_SITE_CONFIG_KEYS is what tells the writer to rewrite
 * exactly that key. The caller is responsible for validating the tag against
 * isAllowedWordpressImage first; the shell writer revalidates independently.
 */
export function imagePatchToEnv(tag: WordpressImage): {
	WORDPRESS_IMAGE: WordpressImage;
	VIBE_SITE_CONFIG_KEYS: "WORDPRESS_IMAGE";
} {
	return { WORDPRESS_IMAGE: tag, VIBE_SITE_CONFIG_KEYS: "WORDPRESS_IMAGE" };
}

/**
 * Map the FastCGI page-cache toggle to the env vars site-config-apply consumes.
 * NGINX_FASTCGI_CACHE is a literal on|off (mirrors NGINX_GZIP / NGINX_OPEN_FILE_
 * CACHE); naming it in VIBE_SITE_CONFIG_KEYS is what tells the writer to rewrite
 * exactly that key. The shell writer revalidates the on|off value independently.
 */
export function fastcgiCachePatchToEnv(enabled: boolean): {
	NGINX_FASTCGI_CACHE: "off" | "on";
	VIBE_SITE_CONFIG_KEYS: "NGINX_FASTCGI_CACHE";
} {
	return {
		NGINX_FASTCGI_CACHE: enabled ? "on" : "off",
		VIBE_SITE_CONFIG_KEYS: "NGINX_FASTCGI_CACHE",
	};
}

/** One-click security hardening toggles the panel can apply via siteConfigApply. */
export type SecurityFixKind = "disableXmlRpc" | "disableFileEdit";

/** The single env key each security fix writes (always set to "1" — hardening). */
const SECURITY_FIX_KEY: Record<SecurityFixKind, string> = {
	// Read by the vibe-wp-environment MU plugin, which then forces xmlrpc_enabled
	// false + strips pingback XML-RPC methods + drops the X-Pingback header.
	disableXmlRpc: "VIBE_WP_DISABLE_XMLRPC",
	// Read by the WordPress image entrypoint when it renders wp-config; restores
	// the secure default (the file editor stays closed).
	disableFileEdit: "DISALLOW_FILE_EDIT",
};

/**
 * Map a one-click security fix to the env vars site-config-apply consumes. Each
 * fix flips exactly one boolean key to "1" (always tightening, never loosening).
 * Naming only the changed key in VIBE_SITE_CONFIG_KEYS tells the writer to rewrite
 * exactly that key; the root shell writer revalidates the 0|1 value independently.
 * Both keys are rendered only at container start, so the caller must restart the
 * container for the fix to take effect (surfaced as restartRequired by the exec
 * layer). Shape mirrors fastcgiCachePatchToEnv/imagePatchToEnv: a flat env map
 * with VIBE_SITE_CONFIG_KEYS naming exactly the changed key.
 */
export function securityFixToEnv(fix: SecurityFixKind): Record<string, string> {
	const key = SECURITY_FIX_KEY[fix];
	return { [key]: "1", VIBE_SITE_CONFIG_KEYS: key };
}

export function siteSecurityPatchToEnv(patch: {
	disableXmlRpc?: boolean;
	disallowFileEdit?: boolean;
}): Record<string, string> {
	const env: Record<string, string> = {};
	const keys: string[] = [];
	if (patch.disableXmlRpc !== undefined) {
		env.VIBE_WP_DISABLE_XMLRPC = patch.disableXmlRpc ? "1" : "0";
		keys.push("VIBE_WP_DISABLE_XMLRPC");
	}
	if (patch.disallowFileEdit !== undefined) {
		env.DISALLOW_FILE_EDIT = patch.disallowFileEdit ? "1" : "0";
		keys.push("DISALLOW_FILE_EDIT");
	}
	if (keys.length > 0) {
		env.VIBE_SITE_CONFIG_KEYS = keys.join(" ");
	}
	return env;
}
