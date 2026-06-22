/**
 * Pure (DB-free) helpers for backup R2 config.
 * Imported by both backup-config.ts (DB layer) and tests.
 */

export const GLOBAL_SITE_ID = "__global__";

/** Shape matching the Drizzle backupConfig table row. */
export interface BackupConfigRow {
	accessKeyId: string | null;
	bucket: string | null;
	enabled: number | null;
	endpoint: string | null;
	prefix: string | null;
	provider: string | null;
	retention: number | null;
	secret: string | null;
	siteId: string;
}

/** Effective (resolved) backup config — all nullable fields inherited. */
export interface EffectiveBackupConfig {
	accessKeyId: string | null;
	bucket: string | null;
	enabled: number | null;
	endpoint: string | null;
	prefix: string | null;
	provider: string | null;
	retention: number | null;
	secret: string | null;
}

/**
 * Merges a global row and a site-specific row into effective config.
 * For every field: site value takes precedence over global value.
 * `prefix` is synthesised from the domain when neither row supplies one.
 */
export function mergeConfig(
	global: BackupConfigRow | null,
	site: BackupConfigRow | null,
	siteDomain: string
): EffectiveBackupConfig {
	const g = global ?? ({} as Partial<BackupConfigRow>);
	const s = site ?? ({} as Partial<BackupConfigRow>);

	const globalPrefix = g.prefix ?? null;
	const sitePrefix = s.prefix ?? null;

	let prefix: string | null;
	if (sitePrefix) {
		prefix = sitePrefix;
	} else if (globalPrefix) {
		prefix = `${globalPrefix}/${siteDomain}`;
	} else {
		prefix = siteDomain;
	}

	return {
		provider: s.provider ?? g.provider ?? null,
		endpoint: s.endpoint ?? g.endpoint ?? null,
		accessKeyId: s.accessKeyId ?? g.accessKeyId ?? null,
		secret: s.secret ?? g.secret ?? null,
		bucket: s.bucket ?? g.bucket ?? null,
		prefix,
		// `enabled` comes from the site row only — there is no global fallback.
		enabled: s.enabled ?? null,
		retention: s.retention ?? g.retention ?? null,
	};
}

/**
 * Maps an effective config to environment variables suitable for injection into
 * `bin/vibe`. Returns `{ VIBE_BACKUP_R2_ENABLED: "0" }` when R2 is not
 * configured or not enabled — injecting this is safe and suppresses off-site.
 */
export function toEnv(cfg: EffectiveBackupConfig): Record<string, string> {
	const isEnabled = cfg.enabled === 1;
	const hasCredentials = Boolean(
		cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket
	);

	if (!(isEnabled && hasCredentials)) {
		return { VIBE_BACKUP_R2_ENABLED: "0" };
	}

	const env: Record<string, string> = {
		VIBE_BACKUP_R2_ENABLED: "1",
	};

	if (cfg.bucket) {
		env.VIBE_BACKUP_R2_BUCKET = cfg.bucket;
	}
	if (cfg.prefix) {
		env.VIBE_BACKUP_R2_PREFIX = cfg.prefix;
	}
	env.RCLONE_CONFIG_R2_TYPE = "s3";
	if (cfg.provider) {
		env.RCLONE_CONFIG_R2_PROVIDER = cfg.provider;
	}
	if (cfg.accessKeyId) {
		env.RCLONE_CONFIG_R2_ACCESS_KEY_ID = cfg.accessKeyId;
	}
	if (cfg.secret) {
		env.RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = cfg.secret;
	}
	if (cfg.endpoint) {
		env.RCLONE_CONFIG_R2_ENDPOINT = cfg.endpoint;
	}

	return env;
}
