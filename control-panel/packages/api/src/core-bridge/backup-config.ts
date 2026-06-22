/**
 * Backup R2 config: DB-backed storage + resolve/env helpers.
 *
 * Pure merge/env-mapping logic lives in backup-config-pure.ts so it can be
 * unit-tested without importing the database module.
 */
import { db } from "@control-panel/db";
import { backupConfig } from "@control-panel/db/schema/backups";
import { eq, ne } from "drizzle-orm";

import type {
	BackupConfigRow,
	EffectiveBackupConfig,
} from "./backup-config-pure";
import { GLOBAL_SITE_ID, mergeConfig, toEnv } from "./backup-config-pure";
import { runVibe } from "./exec";
import { findSite } from "./sites";

export type BackupConfigPatch = Omit<Partial<BackupConfigRow>, "siteId">;

// ---------------------------------------------------------------------------
// DB-backed functions
// ---------------------------------------------------------------------------

/** Returns the raw row for `siteId`, or null if no row exists. */
export async function getBackupConfig(
	siteId: string
): Promise<BackupConfigRow | null> {
	const rows = await db
		.select()
		.from(backupConfig)
		.where(eq(backupConfig.siteId, siteId));
	return rows[0] ?? null;
}

/**
 * Upserts config for `siteId`. The `secret` field is only overwritten when
 * `patch.secret` is a non-empty string — omitting or emptying it preserves
 * whatever is already stored.
 */
export async function setBackupConfig(
	siteId: string,
	patch: BackupConfigPatch
): Promise<void> {
	const secretUpdate: { secret?: string } =
		patch.secret && patch.secret.trim() !== "" ? { secret: patch.secret } : {};

	const { secret: _secret, ...rest } = patch;
	const values = {
		siteId,
		...rest,
		...secretUpdate,
		// Fill nullable columns that are not in patch with null for a complete upsert;
		// the onConflictDoUpdate set clause takes precedence for existing rows.
		provider: rest.provider ?? null,
		endpoint: rest.endpoint ?? null,
		accessKeyId: rest.accessKeyId ?? null,
		bucket: rest.bucket ?? null,
		prefix: rest.prefix ?? null,
		enabled: rest.enabled ?? null,
		retention: rest.retention ?? null,
		secret: secretUpdate.secret ?? null,
	};

	await db
		.insert(backupConfig)
		.values(values)
		.onConflictDoUpdate({
			target: backupConfig.siteId,
			set: {
				...rest,
				...secretUpdate,
			},
		});
}

/**
 * Resolves the effective config for a site by merging the global row and the
 * site-specific row. The site domain is read from `findSite`.
 */
export async function resolveBackupConfig(
	siteId: string
): Promise<EffectiveBackupConfig> {
	const [global, site, detectedSite] = await Promise.all([
		getBackupConfig(GLOBAL_SITE_ID),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : getBackupConfig(siteId),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : findSite(siteId),
	]);

	const domain = detectedSite?.domain ?? siteId;
	return mergeConfig(global, site, domain);
}

/**
 * Returns a map of environment variables for injection into `bin/vibe` for the
 * given site. Always safe to inject — returns `{ VIBE_BACKUP_R2_ENABLED: "0" }`
 * when R2 is not configured or disabled.
 */
export async function backupConfigEnv(
	siteId: string
): Promise<Record<string, string>> {
	const cfg = await resolveBackupConfig(siteId);
	const env = toEnv(cfg);
	// Retention is not part of the R2 enable/credentials gate, so it is mapped
	// here rather than in `toEnv` — it applies to local pruning even off-site is
	// disabled.
	if (cfg.retention && cfg.retention > 0) {
		env.VIBE_BACKUP_RETENTION = String(cfg.retention);
	}
	return env;
}

/** Per-site config rows the user has saved (excludes the global creds row). */
export async function listConfiguredSiteIds(): Promise<string[]> {
	const rows = await db
		.select({ siteId: backupConfig.siteId })
		.from(backupConfig)
		.where(ne(backupConfig.siteId, GLOBAL_SITE_ID));
	return rows.map((r) => r.siteId);
}

/**
 * Writes the resolved R2 config into the site's `prod.env` via `bin/vibe`, so
 * both the panel and the unattended cron backup timer read the same settings.
 * Secrets travel as injected env (redacted in logs), never as argv. No-op when
 * the site is not found in the registry.
 */
export async function applyBackupConfigToSite(siteId: string): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const env = await backupConfigEnv(siteId);
	const result = await runVibe(site.installDir, "prod", "backupConfigApply", {
		env,
	});
	// runVibe never throws on a non-zero exit, so a failed env-file write would
	// otherwise be reported to the caller as success. Surface it instead.
	if (result.code !== 0) {
		throw new Error(
			`backup-config-apply failed for ${siteId} (exit ${result.code}): ${result.stderr.trim()}`
		);
	}
}

/**
 * Returns the rclone environment variables needed to probe R2 connectivity,
 * built from the **global** credentials regardless of whether `enabled === 1`.
 * This lets an admin test credentials before toggling the backup on.
 *
 * Returns `null` when required credential fields (provider, accessKeyId,
 * secret, bucket) are incomplete — the caller should surface a friendly error.
 */
export async function backupTestEnv(
	siteId: string
): Promise<Record<string, string> | null> {
	// Always resolve from the global row for a connectivity test — per-site
	// overrides (bucket, creds) are not yet a use-case for test-connection.
	const cfg = await resolveBackupConfig(siteId);

	if (!(cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket)) {
		return null;
	}

	const env: Record<string, string> = {
		RCLONE_CONFIG_R2_TYPE: "s3",
		RCLONE_CONFIG_R2_PROVIDER: cfg.provider,
		RCLONE_CONFIG_R2_ACCESS_KEY_ID: cfg.accessKeyId,
		RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: cfg.secret,
		VIBE_BACKUP_R2_BUCKET: cfg.bucket,
	};

	if (cfg.endpoint) {
		env.RCLONE_CONFIG_R2_ENDPOINT = cfg.endpoint;
	}

	return env;
}
